import { getColomboDateStr, VILLA_TIMEZONE } from "../utils/colomboTime.js";
import { randomUUID } from "node:crypto";
import { getAdminDb } from "./firebaseAdmin.js";
const REMINDER_COLLECTION = "whatsapp_reminders";
const LEASE_DURATION_MS = 5 * 60 * 1e3;
class ReminderRequestError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ReminderRequestError";
  }
}
function getWeeklyReminderPeriod(now = /* @__PURE__ */ new Date()) {
  const localToday = getColomboDateStr(now);
  const sunday = /* @__PURE__ */ new Date(`${localToday}T00:00:00.000Z`);
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  const nextSunday = new Date(sunday);
  nextSunday.setUTCDate(nextSunday.getUTCDate() + 7);
  const startDate = sunday.toISOString().slice(0, 10);
  const endDateExclusive = nextSunday.toISOString().slice(0, 10);
  return { startDate, endDateExclusive, periodId: startDate };
}
function isValidWhatsAppNumber(value) {
  return typeof value === "string" && /^\+[1-9][0-9]{7,14}$/.test(value.trim());
}
function normalizeWhatsAppNumber(value) {
  return value.trim();
}
function makeReminderId(periodId, bookingId) {
  return `${periodId}__${encodeURIComponent(bookingId)}`;
}
function isDateInReminderPeriod(date, periodId) {
  const start = /* @__PURE__ */ new Date(`${periodId}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const endDateExclusive = end.toISOString().slice(0, 10);
  return date >= periodId && date < endDateExclusive;
}
function formatShootDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
function formatTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
function buildTemplateParameters(booking, location) {
  return [
    booking.customerName,
    formatShootDate(booking.shootDate),
    `${formatTime(booking.startTime)} \u2013 ${formatTime(booking.endTime)}`,
    booking.shootType,
    booking.paxCount ? String(booking.paxCount) : "Not specified",
    location,
    booking.specialNotes?.trim() || "None provided"
  ].map((value) => value.slice(0, 900));
}
function reminderFields(booking, periodId, assignedStaff, phone) {
  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    clientName: booking.customerName,
    shootDate: booking.shootDate,
    assignedStaffId: booking.assignedStaffId?.trim().toLowerCase() || null,
    assignedStaffName: assignedStaff?.name || null,
    staffWhatsAppNumber: phone,
    periodId
  };
}
function skipReasonForBooking(booking) {
  if (!booking.assignedStaffId?.trim()) return "No staff member is assigned to this photoshoot.";
  return null;
}
async function processBooking(booking, periodId, store, sender, now, location) {
  const reminderId = makeReminderId(periodId, booking.id);
  const existing = await store.getReminder(reminderId);
  if (existing?.status === "SENT") return "ALREADY_SENT";
  const initialFields = reminderFields(booking, periodId, null, null);
  const noAssignmentReason = skipReasonForBooking(booking);
  if (noAssignmentReason) {
    await store.markSkipped(reminderId, initialFields, noAssignmentReason, now);
    return "SKIPPED";
  }
  const assignedStaffId = booking.assignedStaffId?.trim().toLowerCase();
  if (!assignedStaffId) {
    await store.markSkipped(reminderId, initialFields, "No staff member is assigned.", now);
    return "SKIPPED";
  }
  const assignedStaff = await store.getStaff(assignedStaffId);
  if (!assignedStaff || !assignedStaff.isActive) {
    await store.markSkipped(
      reminderId,
      reminderFields(booking, periodId, assignedStaff, null),
      "The assigned staff account is missing or inactive.",
      now
    );
    return "SKIPPED";
  }
  const number = assignedStaff.whatsappPhone?.trim() || "";
  if (!isValidWhatsAppNumber(number)) {
    await store.markSkipped(
      reminderId,
      reminderFields(booking, periodId, assignedStaff, number || null),
      "The assigned staff member does not have a valid WhatsApp number.",
      now
    );
    return "SKIPPED";
  }
  const fields = reminderFields(booking, periodId, assignedStaff, number);
  const attemptId = randomUUID();
  const claim = await store.claimAttempt(reminderId, fields, attemptId, now);
  if (claim === "ALREADY_SENT") return "ALREADY_SENT";
  if (claim === "IN_PROGRESS") return "IN_PROGRESS";
  if (claim === "STALE_ATTEMPT") return "FAILED";
  let response;
  try {
    response = await sender.sendTemplate(
      normalizeWhatsAppNumber(number),
      buildTemplateParameters(booking, location)
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 500) : "WhatsApp send failed unexpectedly.";
    await store.markFailed(reminderId, attemptId, reason, /* @__PURE__ */ new Date());
    console.error("WhatsApp photoshoot reminder failed", {
      reminderId,
      bookingCode: booking.bookingCode,
      reason
    });
    return "FAILED";
  }
  await store.markSent(reminderId, attemptId, response.messageId, /* @__PURE__ */ new Date());
  return "SENT";
}
async function runWeeklyPhotoshootReminders(store, sender, now = /* @__PURE__ */ new Date()) {
  const period = getWeeklyReminderPeriod(now);
  const bookings = await store.listShootBookings(period.startDate, period.endDateExclusive);
  const villaSettings = await store.getVillaSettings();
  const location = process.env.VILLA_LOCATION?.trim() || villaSettings?.villaName || "Villa";
  const summary = {
    periodId: period.periodId,
    startDate: period.startDate,
    endDateExclusive: period.endDateExclusive,
    matchedBookings: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    alreadySent: 0,
    inProgress: 0
  };
  const activeBookings = bookings.filter(
    (booking) => booking.status !== "Cancelled" && !booking.isArchived
  );
  summary.matchedBookings = activeBookings.length;
  for (const booking of activeBookings) {
    const result = await processBooking(
      booking,
      period.periodId,
      store,
      sender,
      now,
      location
    );
    if (result === "ALREADY_SENT") summary.alreadySent += 1;
    else if (result === "IN_PROGRESS") summary.inProgress += 1;
    else summary[result.toLowerCase()] += 1;
  }
  return summary;
}
async function retryFailedPhotoshootReminder(reminderId, store, sender, now = /* @__PURE__ */ new Date()) {
  const reminder = await store.getReminder(reminderId);
  if (!reminder) throw new ReminderRequestError("Reminder record not found.", 404);
  if (reminder.status !== "FAILED") {
    throw new ReminderRequestError("Only failed reminders can be retried.", 409);
  }
  const booking = await store.getShootBooking(reminder.bookingId);
  if (!booking || booking.isArchived || booking.status === "Cancelled") {
    await store.markSkipped(
      reminderId,
      {
        bookingId: reminder.bookingId,
        bookingCode: booking?.bookingCode || reminder.bookingCode,
        clientName: booking?.customerName || reminder.clientName,
        shootDate: booking?.shootDate || reminder.shootDate,
        assignedStaffId: booking?.assignedStaffId?.trim().toLowerCase() || null,
        assignedStaffName: null,
        staffWhatsAppNumber: null,
        periodId: reminder.periodId
      },
      "The photoshoot is missing, archived, or cancelled.",
      now
    );
    return await store.getReminder(reminderId);
  }
  if (!isDateInReminderPeriod(booking.shootDate, reminder.periodId)) {
    await store.markSkipped(
      reminderId,
      {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        clientName: booking.customerName,
        shootDate: booking.shootDate,
        assignedStaffId: booking.assignedStaffId?.trim().toLowerCase() || null,
        assignedStaffName: null,
        staffWhatsAppNumber: null,
        periodId: reminder.periodId
      },
      "The updated shoot date is outside this reminder week.",
      now
    );
    return await store.getReminder(reminderId);
  }
  const settings = await store.getVillaSettings();
  const location = process.env.VILLA_LOCATION?.trim() || settings?.villaName || "Villa";
  await processBooking(booking, reminder.periodId, store, sender, now, location);
  const updated = await store.getReminder(reminderId);
  if (!updated) throw new Error("Reminder record disappeared after retry.");
  return updated;
}
function asDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
function toIsoString(value) {
  return asDate(value)?.toISOString() || null;
}
function decodeReminder(id, data) {
  return {
    id,
    bookingId: String(data.bookingId || ""),
    bookingCode: String(data.bookingCode || ""),
    clientName: String(data.clientName || ""),
    shootDate: String(data.shootDate || ""),
    assignedStaffId: typeof data.assignedStaffId === "string" ? data.assignedStaffId : null,
    assignedStaffName: typeof data.assignedStaffName === "string" ? data.assignedStaffName : null,
    staffWhatsAppNumber: typeof data.staffWhatsAppNumber === "string" ? data.staffWhatsAppNumber : null,
    periodId: String(data.periodId || ""),
    status: data.status,
    attemptCount: Number(data.attemptCount || 0),
    sentAt: toIsoString(data.sentAt),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    deliveryStatus: typeof data.deliveryStatus === "string" ? data.deliveryStatus : null,
    deliveredAt: toIsoString(data.deliveredAt),
    failureReason: typeof data.failureReason === "string" ? data.failureReason : null,
    skipReason: typeof data.skipReason === "string" ? data.skipReason : null,
    providerMessageId: typeof data.providerMessageId === "string" ? data.providerMessageId : null,
    attemptId: typeof data.attemptId === "string" ? data.attemptId : void 0,
    leaseUntil: data.leaseUntil
  };
}
class FirestoreReminderStore {
  async listShootBookings(startDate, endDateExclusive) {
    const snapshot = await getAdminDb().collection("shoots").where("shootDate", ">=", startDate).where("shootDate", "<", endDateExclusive).get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }
  async getShootBooking(bookingId) {
    const snapshot = await getAdminDb().collection("shoots").doc(bookingId).get();
    return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
  }
  async getStaff(staffEmail) {
    const email = staffEmail.trim().toLowerCase();
    const snapshot = await getAdminDb().collection("staff").doc(email).get();
    return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
  }
  async getVillaSettings() {
    const snapshot = await getAdminDb().collection("villa_settings").doc("general").get();
    return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
  }
  async getReminder(reminderId) {
    const snapshot = await getAdminDb().collection(REMINDER_COLLECTION).doc(reminderId).get();
    return snapshot.exists ? decodeReminder(snapshot.id, snapshot.data() || {}) : null;
  }
  async markSkipped(reminderId, fields, reason, now) {
    const db = getAdminDb();
    const ref = db.collection(REMINDER_COLLECTION).doc(reminderId);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.data();
      if (current?.status === "SENT") return;
      if (current?.status === "PENDING") {
        const leaseUntil = asDate(current.leaseUntil);
        if (leaseUntil && leaseUntil.getTime() > now.getTime()) return;
        transaction.update(ref, {
          status: "FAILED",
          failureReason: "A prior attempt timed out; delivery outcome is unknown.",
          updatedAt: now
        });
        return;
      }
      transaction.set(
        ref,
        {
          ...fields,
          status: "SKIPPED",
          attemptCount: Number(current?.attemptCount || 0),
          skipReason: reason.slice(0, 300),
          failureReason: null,
          updatedAt: now,
          createdAt: current?.createdAt || now
        },
        { merge: true }
      );
    });
  }
  async claimAttempt(reminderId, fields, attemptId, now) {
    const db = getAdminDb();
    const ref = db.collection(REMINDER_COLLECTION).doc(reminderId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.data();
      if (current?.status === "SENT") return "ALREADY_SENT";
      if (current?.status === "PENDING") {
        const leaseUntil = asDate(current.leaseUntil);
        if (leaseUntil && leaseUntil.getTime() > now.getTime()) return "IN_PROGRESS";
        transaction.update(ref, {
          status: "FAILED",
          failureReason: "A prior attempt timed out; delivery outcome is unknown.",
          updatedAt: now
        });
        return "STALE_ATTEMPT";
      }
      transaction.set(
        ref,
        {
          ...fields,
          status: "PENDING",
          attemptCount: Number(current?.attemptCount || 0) + 1,
          attemptId,
          leaseUntil: new Date(now.getTime() + LEASE_DURATION_MS),
          failureReason: null,
          skipReason: null,
          providerMessageId: null,
          deliveryStatus: null,
          sentAt: null,
          deliveredAt: null,
          updatedAt: now,
          createdAt: current?.createdAt || now
        },
        { merge: true }
      );
      return "CLAIMED";
    });
  }
  async markSent(reminderId, attemptId, providerMessageId, sentAt) {
    const db = getAdminDb();
    const ref = db.collection(REMINDER_COLLECTION).doc(reminderId);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.data();
      if (!current || current.attemptId !== attemptId || current.status !== "PENDING") {
        throw new Error("Reminder attempt is no longer active; delivery status was not updated.");
      }
      transaction.update(ref, {
        status: "SENT",
        providerMessageId,
        deliveryStatus: "sent",
        sentAt,
        failureReason: null,
        leaseUntil: null,
        updatedAt: sentAt
      });
    });
  }
  async markFailed(reminderId, attemptId, reason, failedAt) {
    const db = getAdminDb();
    const ref = db.collection(REMINDER_COLLECTION).doc(reminderId);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.data();
      if (!current || current.attemptId !== attemptId || current.status !== "PENDING") {
        throw new Error("Reminder attempt is no longer active; failure status was not updated.");
      }
      transaction.update(ref, {
        status: "FAILED",
        failureReason: reason.slice(0, 500),
        leaseUntil: null,
        updatedAt: failedAt
      });
    });
  }
  async listReminders() {
    const snapshot = await getAdminDb().collection(REMINDER_COLLECTION).orderBy("updatedAt", "desc").limit(200).get();
    return snapshot.docs.map((doc) => decodeReminder(doc.id, doc.data()));
  }
  async updateDeliveryStatus(providerMessageId, status, failureReason) {
    const snapshot = await getAdminDb().collection(REMINDER_COLLECTION).where("providerMessageId", "==", providerMessageId).limit(1).get();
    const reminder = snapshot.docs[0];
    if (!reminder) return false;
    const now = /* @__PURE__ */ new Date();
    const update = {
      deliveryStatus: status,
      updatedAt: now
    };
    if (status === "delivered" || status === "read") update.deliveredAt = now;
    if (status === "failed") {
      update.status = "FAILED";
      update.failureReason = (failureReason || "WhatsApp reported a delivery failure.").slice(
        0,
        500
      );
    }
    await reminder.ref.update(update);
    return true;
  }
}
class MetaWhatsAppSender {
  async sendTemplate(to, parameters) {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
    if (!accessToken || !phoneNumberId || !apiVersion || !templateName) {
      throw new Error(
        "WhatsApp Cloud API is not configured. Set its access token, phone number ID, API version, and approved template name."
      );
    }
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: [
              {
                type: "body",
                parameters: parameters.map((text) => ({ type: "text", text }))
              }
            ]
          }
        }),
        signal: AbortSignal.timeout(15e3)
      }
    );
    const responseText = await response.text();
    let responseBody = {};
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      if (response.ok) throw new Error("WhatsApp API returned an unreadable response.");
    }
    if (!response.ok) {
      const details = responseBody.error?.error_user_title || responseBody.error?.message || `HTTP ${response.status}`;
      throw new Error(`WhatsApp API rejected the message: ${details}`.slice(0, 500));
    }
    const messageId = responseBody.messages?.[0]?.id;
    if (!messageId) throw new Error("WhatsApp API accepted no message ID in its response.");
    return { messageId };
  }
}
async function applyWhatsAppWebhookStatus(store, providerMessageId, status, failureReason) {
  const supported = /* @__PURE__ */ new Set(["sent", "delivered", "read", "failed"]);
  if (!supported.has(status)) return false;
  return store.updateDeliveryStatus(providerMessageId, status, failureReason);
}
export {
  FirestoreReminderStore,
  MetaWhatsAppSender,
  ReminderRequestError,
  VILLA_TIMEZONE,
  applyWhatsAppWebhookStatus,
  buildTemplateParameters,
  getWeeklyReminderPeriod,
  isDateInReminderPeriod,
  isValidWhatsAppNumber,
  makeReminderId,
  normalizeWhatsAppNumber,
  retryFailedPhotoshootReminder,
  runWeeklyPhotoshootReminders
};
