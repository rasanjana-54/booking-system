import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { createApp } from "./app.js";
import { adminAuth, FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from "./firebaseAdmin.js";
import { decodeDoc, fromFirestoreValue, toFirestoreValue } from "./firestoreRest.js";
import { SUPER_ADMIN_EMAIL } from "./middleware/security.js";

const DOC_PREFIX = `projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;

const TOKENS = {
  admin: {
    uid: "uid_admin_1",
    email: SUPER_ADMIN_EMAIL,
    email_verified: true,
    name: "Villa Administrator"
  },
  staff1: {
    uid: "uid_staff_1",
    email: "staff1@gmail.com",
    email_verified: true,
    name: "Staff One"
  },
  staff2: {
    uid: "uid_staff_2",
    email: "staff2@gmail.com",
    email_verified: true,
    name: "Staff Two"
  },
  outsider: {
    uid: "uid_outsider",
    email: "outsider@gmail.com",
    email_verified: true,
    name: "Outside User"
  },
  unverified: {
    uid: "uid_unverified",
    email: "unverified@gmail.com",
    email_verified: false,
    name: "Unverified User"
  }
};

function createFirestoreSimulator() {
  const store = new Map();

  function getDoc(col, id) {
    return store.get(`${col}/${id}`) || null;
  }

  function isActiveStaff(user) {
    if (!user || !user.email_verified) return false;
    const email = user.email.toLowerCase();
    if (email === SUPER_ADMIN_EMAIL) return true;
    const staff = getDoc("staff", email);
    return Boolean(staff && staff.isActive === true);
  }

  function isAdmin(user) {
    if (!user || !user.email_verified) return false;
    const email = user.email.toLowerCase();
    if (email === SUPER_ADMIN_EMAIL) return true;
    const staff = getDoc("staff", email);
    return Boolean(staff && staff.isActive === true && staff.role === "ADMIN");
  }

  function encodeDoc(col, id, data) {
    const fields = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "id" || v === undefined) continue;
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) && (k.endsWith("At") || k === "timestamp")) {
        fields[k] = { timestampValue: v };
      } else {
        fields[k] = toFirestoreValue(v);
      }
    }
    return {
      name: `${DOC_PREFIX}/${col}/${id}`,
      fields
    };
  }

  function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  function permissionDenied(msg = "Missing or insufficient permissions.") {
    return jsonResponse(403, {
      error: { code: 403, status: "PERMISSION_DENIED", message: msg }
    });
  }

  async function handleFetch(url, init = {}) {
    const authHeader = init.headers?.Authorization || init.headers?.authorization || "";
    const tokenKey = authHeader.replace(/^Bearer\s+/i, "");
    const user = TOKENS[tokenKey];
    if (!user) {
      return jsonResponse(401, { error: { code: 401, status: "UNAUTHENTICATED", message: "Invalid token." } });
    }
    const email = user.email.toLowerCase();
    const parsed = new URL(String(url));
    const pathAfterDocs = parsed.pathname.split("/documents")[1] || "";

    if (pathAfterDocs === ":runQuery") {
      const { structuredQuery } = JSON.parse(init.body);
      const col = structuredQuery.from[0].collectionId;
      const where = structuredQuery.where?.fieldFilter;

      if (col === "staff") {
        if (!user.email_verified) return permissionDenied();
        if (email !== SUPER_ADMIN_EMAIL && (!where || where.op !== "ARRAY_CONTAINS" || where.field.fieldPath !== "adminEmails" || where.value.stringValue !== email || !isAdmin(user))) {
          return permissionDenied("Staff list requires adminEmails filter.");
        }
      } else if (col === "audit_logs") {
        if (!isAdmin(user)) return permissionDenied("Audit logs are admin-only.");
      } else {
        if (!isActiveStaff(user)) return permissionDenied(`User ${email} is not active staff.`);
      }

      const docs = [];
      for (const [key, data] of store.entries()) {
        if (!key.startsWith(`${col}/`)) continue;
        const id = key.slice(col.length + 1);
        if (where && where.op === "ARRAY_CONTAINS") {
          const arr = data[where.field.fieldPath];
          if (!Array.isArray(arr) || !arr.includes(where.value.stringValue)) continue;
        }
        docs.push({ document: encodeDoc(col, id, data) });
      }
      return jsonResponse(200, docs);
    }

    if (pathAfterDocs === ":commit") {
      const { writes } = JSON.parse(init.body);
      const pending = [];
      const nowIso = new Date().toISOString();

      for (const write of writes) {
        if (write.delete) {
          const rel = write.delete.replace(`${DOC_PREFIX}/`, "");
          const [col, id] = rel.split("/");
          if (col === "audit_logs" || col === "payments" || col === "villa_settings") {
            return permissionDenied("Delete not allowed.");
          }
          if (["events", "shoots", "room_types", "room_bookings", "staff"].includes(col) && !isAdmin(user)) {
            return permissionDenied("Only admins may delete records.");
          }
          if (col === "blocked_schedules" && !isActiveStaff(user)) {
            return permissionDenied();
          }
          pending.push({ type: "delete", key: `${col}/${id}` });
          continue;
        }

        const rel = write.update.name.replace(`${DOC_PREFIX}/`, "");
        const [col, id] = rel.split("/");
        const key = `${col}/${id}`;
        const existing = store.get(key) || null;
        const incomingFields = decodeDoc({ name: write.update.name, fields: write.update.fields || {} });
        delete incomingFields.id;

        const transformed = {};
        for (const tr of write.updateTransforms || []) {
          if (tr.setToServerValue === "REQUEST_TIME") {
            transformed[tr.fieldPath] = nowIso;
          }
        }

        const isUpdate = Boolean(write.updateMask);
        if (isUpdate && !existing) {
          return jsonResponse(404, { error: { code: 404, status: "NOT_FOUND", message: `Doc ${key} not found.` } });
        }

        const nextData = isUpdate ? { ...existing, ...incomingFields, ...transformed } : { ...incomingFields, ...transformed };

        if (col === "staff") {
          if (isUpdate) {
            const adminAllowed = isAdmin(user);
            const selfLoginUpdate =
              user.email_verified &&
              existing.email === email &&
              existing.isActive === true &&
              incomingFields.uid === user.uid;
            if (!adminAllowed && !selfLoginUpdate) return permissionDenied();
          } else if (!isAdmin(user)) {
            return permissionDenied();
          }
        } else if (col === "villa_settings") {
          if (!isAdmin(user)) return permissionDenied();
        } else if (col === "room_types") {
          if (!isActiveStaff(user)) return permissionDenied();
          if ("updatedBy" in nextData) return permissionDenied("Unexpected updatedBy field on room_types.");
        } else if (["events", "shoots", "room_bookings"].includes(col)) {
          if (!isActiveStaff(user)) return permissionDenied();
          if (isUpdate && !isAdmin(user)) {
            if (existing.isArchived || ["Completed", "Cancelled", "Checked-out"].includes(existing.status)) {
              return permissionDenied("Terminal/archived bookings cannot be modified by staff.");
            }
          }
        } else if (col === "payments") {
          if (!isActiveStaff(user)) return permissionDenied();
          if (isUpdate && !isAdmin(user)) return permissionDenied();
          if (!isUpdate && nextData.isAdjustment && !isAdmin(user)) return permissionDenied();
        } else if (col === "blocked_schedules") {
          if (!isActiveStaff(user)) return permissionDenied();
        } else if (col === "audit_logs") {
          if (!isActiveStaff(user) || isUpdate) return permissionDenied();
        }

        pending.push({ type: "set", key, data: nextData });
      }

      for (const op of pending) {
        if (op.type === "delete") store.delete(op.key);
        else store.set(op.key, op.data);
      }
      return jsonResponse(200, { writeResults: pending.map(() => ({})) });
    }

    // Single document GET
    const rel = pathAfterDocs.replace(/^\/+/, "");
    const [col, id] = rel.split("/");
    if (col === "staff") {
      if (!user.email_verified) return permissionDenied();
      const docData = getDoc(col, id);
      if (!isAdmin(user) && id !== email && (!docData || docData.email !== email)) {
        return permissionDenied();
      }
      if (!docData) return jsonResponse(404, { error: { code: 404, status: "NOT_FOUND" } });
      return jsonResponse(200, encodeDoc(col, id, docData));
    }
    if (col === "audit_logs") {
      if (!isAdmin(user)) return permissionDenied();
    } else if (!isActiveStaff(user)) {
      return permissionDenied();
    }
    const docData = getDoc(col, id);
    if (!docData) return jsonResponse(404, { error: { code: 404, status: "NOT_FOUND" } });
    return jsonResponse(200, encodeDoc(col, id, docData));
  }

  return { store, handleFetch };
}

async function startTestServer() {
  const app = createApp();
  return {
    app,
    baseUrl: "http://localhost",
    close: async () => {}
  };
}

function invokeApp(app, path, { method = "GET", token, body } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new PassThrough();
    socket.remoteAddress = "127.0.0.1";
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = path;
    const rawBody = body !== undefined ? Buffer.from(JSON.stringify(body), "utf8") : Buffer.alloc(0);
    req.headers = {
      host: "localhost",
      "x-requested-with": "XMLHttpRequest"
    };
    if (token) req.headers.authorization = `Bearer ${token}`;
    if (body !== undefined) {
      req.headers["content-type"] = "application/json";
      req.headers["content-length"] = String(rawBody.length);
    }

    const res = new ServerResponse(req);
    const chunks = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    res.write = (chunk, encoding, cb) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      return origWrite(chunk, encoding, cb);
    };
    res.end = (chunk, encoding, cb) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      const text = Buffer.concat(chunks).toString("utf8");
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      const result = origEnd(chunk, encoding, cb);
      resolve({ status: res.statusCode, headers: res.getHeaders(), data: json });
      return result;
    };

    res.on("error", reject);
    app(req, res);
    if (rawBody.length > 0) {
      req.push(rawBody);
    }
    req.push(null);
  });
}

async function apiRequest(appOrUrl, path, options = {}) {
  return invokeApp(appOrUrl, path, options);
}

test("Multi-user authentication, RBAC, booking sync, payments, and conflict prevention", async (t) => {
  const sim = createFirestoreSimulator();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://firestore.googleapis.com/")) {
      return sim.handleFetch(url, init);
    }
    return originalFetch(url, init);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  t.mock.method(adminAuth, "verifyIdToken", async (token) => {
    if (token === "expired") {
      const err = new Error("Firebase ID token has expired.");
      err.code = "auth/id-token-expired";
      throw err;
    }
    if (!TOKENS[token]) {
      throw new Error("Invalid Firebase ID token.");
    }
    return TOKENS[token];
  });

  const server = await startTestServer();
  t.after(() => server.close());
  const baseUrl = server.app;

  // 1. Unauthenticated & expired token requests must return 401 (never fall back to local admin)
  const noAuthRes = await apiRequest(baseUrl, "/api/bootstrap");
  assert.equal(noAuthRes.status, 401);

  const localTokenRes = await apiRequest(baseUrl, "/api/bootstrap", { token: "local-admin-token" });
  assert.equal(localTokenRes.status, 401);

  const expiredRes = await apiRequest(baseUrl, "/api/bootstrap", { token: "expired" });
  assert.equal(expiredRes.status, 401);
  assert.match(expiredRes.data.error, /expired/i);

  // 2. Unauthorized & unverified Google users must receive 403
  const outsiderSession = await apiRequest(baseUrl, "/api/auth/session", {
    method: "POST",
    token: "outsider",
    body: { logLogin: true }
  });
  assert.equal(outsiderSession.status, 403);
  assert.match(outsiderSession.data.error, /Access Denied/i);

  const outsiderBootstrap = await apiRequest(baseUrl, "/api/bootstrap", { token: "outsider" });
  assert.equal(outsiderBootstrap.status, 403);

  const unverifiedSession = await apiRequest(baseUrl, "/api/auth/session", {
    method: "POST",
    token: "unverified",
    body: { logLogin: true }
  });
  assert.equal(unverifiedSession.status, 403);

  // 3. Super admin logs in and bootstraps staff + settings + default rooms
  const adminSession = await apiRequest(baseUrl, "/api/auth/session", {
    method: "POST",
    token: "admin",
    body: { logLogin: true }
  });
  assert.equal(adminSession.status, 200);
  assert.equal(adminSession.data.staff.email, SUPER_ADMIN_EMAIL);
  assert.equal(adminSession.data.staff.role, "ADMIN");

  // 4. Admin provisions User A (staff1, STAFF) and User B (staff2, ADMIN)
  const createStaff1 = await apiRequest(baseUrl, "/api/staff", {
    method: "POST",
    token: "admin",
    body: {
      email: "staff1@gmail.com",
      name: "Staff One",
      role: "STAFF",
      whatsappPhone: "+94771234567",
      isActive: true
    }
  });
  assert.equal(createStaff1.status, 201);

  const createStaff2 = await apiRequest(baseUrl, "/api/staff", {
    method: "POST",
    token: "admin",
    body: {
      email: "staff2@gmail.com",
      name: "Staff Two",
      role: "ADMIN",
      whatsappPhone: "+94777654321",
      isActive: true
    }
  });
  assert.equal(createStaff2.status, 201);

  // Staff cannot provision other staff (403)
  const staffCreateDenied = await apiRequest(baseUrl, "/api/staff", {
    method: "POST",
    token: "staff1",
    body: { email: "hacker@gmail.com", name: "Hacker", role: "ADMIN", isActive: true }
  });
  assert.equal(staffCreateDenied.status, 403);

  // 5. Newly authorized User A & User B sign in and establish sessions
  const staff1Session = await apiRequest(baseUrl, "/api/auth/session", {
    method: "POST",
    token: "staff1",
    body: { logLogin: true }
  });
  assert.equal(staff1Session.status, 200);
  assert.equal(staff1Session.data.staff.role, "STAFF");

  const staff2Session = await apiRequest(baseUrl, "/api/auth/session", {
    method: "POST",
    token: "staff2",
    body: { logLogin: true }
  });
  assert.equal(staff2Session.status, 200);
  assert.equal(staff2Session.data.staff.role, "ADMIN");

  // 6. User A (staff1) creates an event booking; User B (staff2) immediately sees it via bootstrap & GET /events
  const createEvt = await apiRequest(baseUrl, "/api/events", {
    method: "POST",
    token: "staff1",
    body: {
      eventType: "Wedding",
      venueResource: "Main Lawn & Poolside",
      eventDate: "2026-12-20",
      startTime: "10:00",
      endTime: "18:00",
      paxCount: 120,
      customerName: "Nimal Perera",
      customerPhone: "+94771112233",
      totalPayment: 250000,
      advancePayment: 50000,
      paymentMethod: "Bank Transfer",
      status: "Pending"
    }
  });
  assert.equal(createEvt.status, 201);
  const eventId = createEvt.data.id;

  const staff2Boot1 = await apiRequest(baseUrl, "/api/bootstrap", { token: "staff2" });
  assert.equal(staff2Boot1.status, 200);
  assert.equal(staff2Boot1.data.events.length, 1);
  assert.equal(staff2Boot1.data.events[0].customerName, "Nimal Perera");
  assert.equal(staff2Boot1.data.events[0].status, "Pending");

  const staff2Events = await apiRequest(baseUrl, "/api/events", { token: "staff2" });
  assert.equal(staff2Events.status, 200);
  assert.equal(staff2Events.data.events[0].id, eventId);

  // 7. Duplicate/overlapping booking prevention (409 Conflict)
  const conflictEvt = await apiRequest(baseUrl, "/api/events", {
    method: "POST",
    token: "staff2",
    body: {
      eventType: "Birthday",
      venueResource: "Full Estate",
      eventDate: "2026-12-20",
      startTime: "12:00",
      endTime: "15:00",
      paxCount: 40,
      customerName: "Overlap Guest",
      customerPhone: "+94770000000",
      totalPayment: 100000,
      advancePayment: 0,
      paymentMethod: "Cash",
      status: "Confirmed"
    }
  });
  assert.equal(conflictEvt.status, 409);

  // Simultaneous booking race test: two overlapping room bookings
  const [roomResA, roomResB] = await Promise.all([
    apiRequest(baseUrl, "/api/room-bookings", {
      method: "POST",
      token: "staff1",
      body: {
        roomTypeId: "suite_king_room",
        customerName: "Guest Alpha",
        customerPhone: "+94771231231",
        foodStatus: "Included",
        checkInDate: "2026-12-22",
        checkInTime: "14:00",
        checkOutDate: "2026-12-24",
        checkOutTime: "11:00",
        totalPayment: 100000,
        advancePayment: 20000,
        paymentMethod: "Card",
        status: "Confirmed"
      }
    }),
    apiRequest(baseUrl, "/api/room-bookings", {
      method: "POST",
      token: "staff2",
      body: {
        roomTypeId: "suite_king_room",
        customerName: "Guest Beta",
        customerPhone: "+94779998887",
        foodStatus: "Pending",
        checkInDate: "2026-12-22",
        checkInTime: "14:00",
        checkOutDate: "2026-12-23",
        checkOutTime: "11:00",
        totalPayment: 50000,
        advancePayment: 0,
        paymentMethod: "Cash",
        status: "Pending"
      }
    })
  ]);
  const statuses = [roomResA.status, roomResB.status].sort();
  assert.deepEqual(statuses, [201, 409]);

  // 8. User A updates event booking details and status; User B sees update
  const updateEvt = await apiRequest(baseUrl, `/api/events/${eventId}`, {
    method: "PATCH",
    token: "staff1",
    body: {
      eventType: "Wedding",
      venueResource: "Main Lawn & Poolside",
      eventDate: "2026-12-20",
      startTime: "10:00",
      endTime: "19:00",
      paxCount: 150,
      customerName: "Nimal Perera Updated",
      customerPhone: "+94771112233",
      totalPayment: 300000,
      specialNotes: "Added live band",
      status: "Confirmed"
    }
  });
  assert.equal(updateEvt.status, 200);

  const staff2EventDetail = await apiRequest(baseUrl, `/api/events/${eventId}`, { token: "staff2" });
  assert.equal(staff2EventDetail.status, 200);
  assert.equal(staff2EventDetail.data.event.customerName, "Nimal Perera Updated");
  assert.equal(staff2EventDetail.data.event.status, "Confirmed");
  assert.equal(staff2EventDetail.data.event.paxCount, 150);

  // 9. Payments endpoint & RBAC
  const payRes = await apiRequest(baseUrl, "/api/payments", {
    method: "POST",
    token: "staff1",
    body: {
      bookingId: eventId,
      bookingType: "EVENT",
      amount: 50000,
      paymentMethod: "Cash",
      paymentDate: "2026-11-25",
      notes: "Second installment"
    }
  });
  assert.equal(payRes.status, 201);

  const paymentsList = await apiRequest(baseUrl, "/api/payments", { token: "staff2" });
  assert.equal(paymentsList.status, 200);
  assert.equal(paymentsList.data.payments.length >= 2, true);

  // Staff cannot void payments (403); Admin can void payments (200)
  const staffVoid = await apiRequest(baseUrl, `/api/payments/${payRes.data.id}/void`, {
    method: "POST",
    token: "staff1",
    body: { reason: "Staff test void" }
  });
  assert.equal(staffVoid.status, 403);

  const adminVoid = await apiRequest(baseUrl, `/api/payments/${payRes.data.id}/void`, {
    method: "POST",
    token: "staff2",
    body: { reason: "Duplicate entry" }
  });
  assert.equal(adminVoid.status, 200);

  // 10. Staff cannot permanently delete bookings (403); Admin can archive, restore, and delete
  const staffDelete = await apiRequest(baseUrl, `/api/bookings/EVENT/${eventId}`, {
    method: "DELETE",
    token: "staff1"
  });
  assert.equal(staffDelete.status, 403);

  const archiveEvt = await apiRequest(baseUrl, `/api/bookings/EVENT/${eventId}/archive`, {
    method: "POST",
    token: "staff1",
    body: {}
  });
  assert.equal(archiveEvt.status, 200);

  // Staff cannot restore archived booking (403)
  const staffRestore = await apiRequest(baseUrl, `/api/bookings/EVENT/${eventId}/restore`, {
    method: "POST",
    token: "staff1",
    body: {}
  });
  assert.equal(staffRestore.status, 403);

  const adminRestore = await apiRequest(baseUrl, `/api/bookings/EVENT/${eventId}/restore`, {
    method: "POST",
    token: "staff2",
    body: {}
  });
  assert.equal(adminRestore.status, 200);

  // 11. Terminal status locking: Admin marks event Completed -> Staff cannot modify it (403)
  const completeEvt = await apiRequest(baseUrl, `/api/events/${eventId}`, {
    method: "PATCH",
    token: "admin",
    body: {
      eventType: "Wedding",
      venueResource: "Main Lawn & Poolside",
      eventDate: "2026-12-20",
      startTime: "10:00",
      endTime: "19:00",
      paxCount: 150,
      customerName: "Nimal Perera Updated",
      customerPhone: "+94771112233",
      totalPayment: 300000,
      status: "Completed"
    }
  });
  assert.equal(completeEvt.status, 200);

  const staffEditCompleted = await apiRequest(baseUrl, `/api/events/${eventId}`, {
    method: "PATCH",
    token: "staff1",
    body: {
      eventType: "Wedding",
      venueResource: "Main Lawn & Poolside",
      eventDate: "2026-12-20",
      startTime: "10:00",
      endTime: "19:00",
      paxCount: 160,
      customerName: "Tamper",
      customerPhone: "+94771112233",
      totalPayment: 300000,
      status: "Confirmed"
    }
  });
  assert.equal(staffEditCompleted.status, 403);

  // Admin deletes event -> User B sees deletion
  const adminDelete = await apiRequest(baseUrl, `/api/bookings/EVENT/${eventId}`, {
    method: "DELETE",
    token: "staff2"
  });
  assert.equal(adminDelete.status, 200);

  const afterDelete = await apiRequest(baseUrl, "/api/events", { token: "admin" });
  assert.equal(afterDelete.data.events.length, 0);

  // 12. Logout and login again + deactivated user enforcement
  const logoutRes = await apiRequest(baseUrl, "/api/auth/logout", {
    method: "POST",
    token: "staff1",
    body: { reason: "manual", timeoutMinutes: 30 }
  });
  assert.equal(logoutRes.status, 200);

  const deactivateRes = await apiRequest(baseUrl, "/api/staff/staff1@gmail.com", {
    method: "PATCH",
    token: "admin",
    body: {
      name: "Staff One",
      role: "STAFF",
      phone: "",
      whatsappPhone: "+94771234567",
      isActive: false
    }
  });
  assert.equal(deactivateRes.status, 200);

  const deactivatedLogin = await apiRequest(baseUrl, "/api/auth/session", {
    method: "POST",
    token: "staff1",
    body: { logLogin: true }
  });
  assert.equal(deactivatedLogin.status, 403);
  assert.match(deactivatedLogin.data.error, /Deactivated/i);

  // 13. Shoots, room types, room bookings, calendar blocks, settings, and staff deletion
  const createShoot = await apiRequest(baseUrl, "/api/shoots", {
    method: "POST",
    token: "staff2",
    body: {
      shootDate: "2026-12-25",
      shootType: "Wedding Shoot",
      venueResource: "Garden Pavilion",
      startTime: "08:00",
      endTime: "12:00",
      paxCount: 8,
      assignedStaffId: "staff2@gmail.com",
      customerName: "Studio Lumiere",
      customerPhone: "+94775554433",
      totalPayment: 75000,
      advancePayment: 25000,
      paymentMethod: "Bank Transfer",
      status: "Confirmed"
    }
  });
  assert.equal(createShoot.status, 201);

  const updateShoot = await apiRequest(baseUrl, `/api/shoots/${createShoot.data.id}`, {
    method: "PATCH",
    token: "staff2",
    body: {
      shootDate: "2026-12-25",
      shootType: "Fashion Shoot",
      venueResource: "Garden Pavilion",
      startTime: "09:00",
      endTime: "13:00",
      paxCount: 10,
      assignedStaffId: "staff2@gmail.com",
      customerName: "Studio Lumiere",
      customerPhone: "+94775554433",
      totalPayment: 85000,
      specialNotes: "Outdoor golden hour",
      status: "Confirmed"
    }
  });
  assert.equal(updateShoot.status, 200);

  const createdRoomId = roomResA.status === 201 ? roomResA.data.id : roomResB.data.id;
  const updateRoomBooking = await apiRequest(baseUrl, `/api/room-bookings/${createdRoomId}`, {
    method: "PATCH",
    token: "staff2",
    body: {
      roomTypeId: "suite_king_room",
      customerName: "Guest Alpha Updated",
      customerPhone: "+94771231231",
      foodStatus: "Included",
      checkInDate: "2026-12-22",
      checkInTime: "14:00",
      checkOutDate: "2026-12-24",
      checkOutTime: "11:00",
      totalPayment: 110000,
      specialNotes: "Early check-in",
      status: "Checked-in"
    }
  });
  assert.equal(updateRoomBooking.status, 200);

  const createRt = await apiRequest(baseUrl, "/api/room-types", {
    method: "POST",
    token: "staff2",
    body: {
      roomCode: "RM-03",
      name: "Garden Villa",
      description: "Private garden suite",
      maxCapacity: 4,
      price: 65000,
      status: "Available"
    }
  });
  assert.equal(createRt.status, 201);

  const updateRt = await apiRequest(baseUrl, `/api/room-types/${createRt.data.id}`, {
    method: "PATCH",
    token: "staff2",
    body: {
      roomCode: "RM-03",
      name: "Garden Villa Deluxe",
      description: "Updated private garden suite",
      maxCapacity: 4,
      price: 70000,
      status: "Available"
    }
  });
  assert.equal(updateRt.status, 200);

  const archiveRt = await apiRequest(baseUrl, `/api/room-types/${createRt.data.id}/archive`, {
    method: "PATCH",
    token: "staff2",
    body: { archive: true }
  });
  assert.equal(archiveRt.status, 200);

  const createBlock = await apiRequest(baseUrl, "/api/calendar/blocks", {
    method: "POST",
    token: "staff2",
    body: {
      scope: "FULL_VILLA",
      startDate: "2026-12-30",
      endDate: "2026-12-31",
      startTime: "00:00",
      endTime: "23:59",
      reason: "Year-end maintenance"
    }
  });
  assert.equal(createBlock.status, 201);

  const deleteBlock = await apiRequest(baseUrl, `/api/calendar/blocks/${createBlock.data.id}`, {
    method: "DELETE",
    token: "staff2"
  });
  assert.equal(deleteBlock.status, 200);

  const updateSettings = await apiRequest(baseUrl, "/api/settings", {
    method: "PATCH",
    token: "admin",
    body: {
      villaName: "Urban Escape Villa",
      currency: "LKR",
      inactivityTimeoutMinutes: 45
    }
  });
  assert.equal(updateSettings.status, 200);

  const deleteStaff1 = await apiRequest(baseUrl, "/api/staff/staff1@gmail.com", {
    method: "DELETE",
    token: "admin"
  });
  assert.equal(deleteStaff1.status, 200);

  // 14. All GET endpoints return fresh non-cached responses (Cache-Control: no-store)
  const shootsRes = await apiRequest(baseUrl, "/api/shoots", { token: "staff2" });
  assert.equal(shootsRes.status, 200);
  assert.equal(shootsRes.data.shoots.length, 1);
  assert.match(String(shootsRes.headers["cache-control"] || ""), /no-store/i);
  const shootByIdRes = await apiRequest(baseUrl, `/api/shoots/${createShoot.data.id}`, { token: "staff2" });
  assert.equal(shootByIdRes.status, 200);
  const rtRes = await apiRequest(baseUrl, "/api/room-types", { token: "staff2" });
  assert.equal(rtRes.status, 200);
  assert.equal(rtRes.data.roomTypes.length, 2);
  const rbRes = await apiRequest(baseUrl, "/api/room-bookings", { token: "staff2" });
  assert.equal(rbRes.status, 200);
  assert.equal(rbRes.data.roomBookings.length, 1);
  const rbByIdRes = await apiRequest(baseUrl, `/api/room-bookings/${createdRoomId}`, { token: "staff2" });
  assert.equal(rbByIdRes.status, 200);
  assert.equal(rbByIdRes.data.roomBooking.status, "Checked-in");
  const blkRes = await apiRequest(baseUrl, "/api/calendar/blocks", { token: "staff2" });
  assert.equal(blkRes.status, 200);
  const staffListRes = await apiRequest(baseUrl, "/api/staff", { token: "staff2" });
  assert.equal(staffListRes.status, 200);
  assert.equal(staffListRes.data.staffMembers.length, 2);
  const logsRes = await apiRequest(baseUrl, "/api/audit-logs", { token: "staff2" });
  assert.equal(logsRes.status, 200);
  assert.equal(logsRes.data.auditLogs.length > 0, true);
  const settingsRes = await apiRequest(baseUrl, "/api/settings", { token: "staff2" });
  assert.equal(settingsRes.status, 200);
  assert.equal(settingsRes.data.settings.inactivityTimeoutMinutes, 45);
});

test("Firestore backend failure propagates 500 cleanly without silent fallback", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://firestore.googleapis.com/")) {
      if (String(url).includes("/documents/staff/rnimsara54@gmail.com")) {
        return new Response(
          JSON.stringify({
            name: `${DOC_PREFIX}/staff/rnimsara54@gmail.com`,
            fields: {
              email: { stringValue: SUPER_ADMIN_EMAIL },
              name: { stringValue: "Villa Administrator" },
              role: { stringValue: "ADMIN" },
              slotNumber: { integerValue: "1" },
              isActive: { booleanValue: true },
              adminEmails: { arrayValue: { values: [{ stringValue: SUPER_ADMIN_EMAIL }] } }
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: { code: 503, status: "UNAVAILABLE", message: "Backend unavailable" } }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(url, init);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  t.mock.method(adminAuth, "verifyIdToken", async () => TOKENS.admin);
  const server = await startTestServer();
  t.after(() => server.close());

  const res = await apiRequest(server.app, "/api/bootstrap", { token: "admin" });
  assert.equal(res.status, 500);
  assert.match(res.data.error, /UNAVAILABLE|503/i);
});
