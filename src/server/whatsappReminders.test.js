import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFirebaseServiceAccount } from "./firebaseAdmin.js";
import {
  buildTemplateParameters,
  getWeeklyReminderPeriod,
  makeReminderId,
  retryFailedPhotoshootReminder,
  runWeeklyPhotoshootReminders
} from "./whatsappReminders.js";
const periodId = "2026-03-22";
describe("Firebase service-account configuration", () => {
  it("keeps malformed optional credentials from breaking API startup", () => {
    const result = parseFirebaseServiceAccount("{invalid json");
    assert.equal(result.credential, void 0);
    assert.match(result.error?.message || "", /valid service-account JSON/);
  });
  it("does not treat an unset optional credential as malformed", () => {
    const result = parseFirebaseServiceAccount(void 0);
    assert.equal(result.credential, void 0);
    assert.equal(result.error, void 0);
  });
});
function makeBooking(overrides = {}) {
  return {
    id: "sht_test_1",
    bookingCode: "SHT-2026-1234",
    shootDate: "2026-03-24",
    shootType: "Commercial Shoot",
    venueResource: "Garden Pavilion",
    startTime: "09:00",
    endTime: "12:00",
    paxCount: 15,
    assignedStaffId: "staff@example.com",
    customerName: "Nimal Perera",
    customerPhone: "+94771234567",
    totalPayment: 0,
    advancePayment: 0,
    duePayment: 0,
    paymentStatus: "FULLY_PAID",
    status: "Confirmed",
    isArchived: false,
    authorizedEmails: ["staff@example.com"],
    createdBy: "test",
    createdByName: "Test",
    ...overrides
  };
}
function makeStaff(overrides = {}) {
  return {
    id: "staff@example.com",
    email: "staff@example.com",
    name: "Staff Member",
    role: "STAFF",
    slotNumber: 2,
    whatsappPhone: "+94771234567",
    isActive: true,
    adminEmails: ["admin@example.com"],
    createdBy: "test",
    ...overrides
  };
}
class MemoryReminderStore {
  constructor() {
    this.bookings = [];
    this.staff = /* @__PURE__ */ new Map();
    this.reminders = /* @__PURE__ */ new Map();
    this.settings = null;
  }
  async listShootBookings(startDate, endDateExclusive) {
    return this.bookings.filter(
      (booking) => booking.shootDate >= startDate && booking.shootDate < endDateExclusive
    );
  }
  async getShootBooking(bookingId) {
    return this.bookings.find((booking) => booking.id === bookingId) || null;
  }
  async getStaff(staffEmail) {
    return this.staff.get(staffEmail) || null;
  }
  async getVillaSettings() {
    return this.settings;
  }
  async getReminder(reminderId) {
    return this.reminders.get(reminderId) || null;
  }
  async markSkipped(reminderId, fields, reason, now) {
    const current = this.reminders.get(reminderId);
    if (current?.status === "SENT") return;
    this.reminders.set(reminderId, {
      ...fields,
      id: reminderId,
      status: "SKIPPED",
      attemptCount: current?.attemptCount || 0,
      skipReason: reason,
      createdAt: current?.createdAt || now.toISOString(),
      updatedAt: now.toISOString()
    });
  }
  async claimAttempt(reminderId, fields, attemptId, now) {
    const current = this.reminders.get(reminderId);
    if (current?.status === "SENT") return "ALREADY_SENT";
    if (current?.status === "PENDING") return "IN_PROGRESS";
    this.reminders.set(reminderId, {
      ...fields,
      id: reminderId,
      status: "PENDING",
      attemptCount: (current?.attemptCount || 0) + 1,
      attemptId,
      createdAt: current?.createdAt || now.toISOString(),
      updatedAt: now.toISOString()
    });
    return "CLAIMED";
  }
  async markSent(reminderId, attemptId, providerMessageId, sentAt) {
    const current = this.reminders.get(reminderId);
    assert.equal(current?.attemptId, attemptId);
    this.reminders.set(reminderId, {
      ...current,
      status: "SENT",
      providerMessageId,
      deliveryStatus: "sent",
      sentAt: sentAt.toISOString(),
      updatedAt: sentAt.toISOString()
    });
  }
  async markFailed(reminderId, attemptId, reason, failedAt) {
    const current = this.reminders.get(reminderId);
    assert.equal(current?.attemptId, attemptId);
    this.reminders.set(reminderId, {
      ...current,
      status: "FAILED",
      failureReason: reason,
      updatedAt: failedAt.toISOString()
    });
  }
  async listReminders() {
    return [...this.reminders.values()];
  }
  async updateDeliveryStatus() {
    return true;
  }
}
class RecordingSender {
  constructor() {
    this.calls = [];
    this.failure = null;
  }
  async sendTemplate(to, parameters) {
    this.calls.push({ to, parameters });
    if (this.failure) throw this.failure;
    return { messageId: `wamid.${this.calls.length}` };
  }
}
describe("weekly WhatsApp photoshoot reminders", () => {
  it("uses the Colombo Sunday boundary and a seven-day exclusive end", () => {
    assert.deepEqual(
      getWeeklyReminderPeriod(/* @__PURE__ */ new Date("2026-03-22T06:29:59.000Z")),
      { startDate: "2026-03-22", endDateExclusive: "2026-03-29", periodId: "2026-03-22" }
    );
    assert.deepEqual(
      getWeeklyReminderPeriod(/* @__PURE__ */ new Date("2026-03-21T18:30:00.000Z")),
      { startDate: "2026-03-22", endDateExclusive: "2026-03-29", periodId: "2026-03-22" }
    );
  });
  it("sends nothing for an empty week and excludes cancelled and archived shoots", async () => {
    const store = new MemoryReminderStore();
    const sender = new RecordingSender();
    store.bookings = [
      makeBooking({ id: "cancelled", status: "Cancelled" }),
      makeBooking({ id: "archived", isArchived: true })
    ];
    const summary = await runWeeklyPhotoshootReminders(
      store,
      sender,
      /* @__PURE__ */ new Date("2026-03-22T06:30:00.000Z")
    );
    assert.equal(summary.matchedBookings, 0);
    assert.equal(sender.calls.length, 0);
    store.bookings = [];
    const emptySummary = await runWeeklyPhotoshootReminders(
      store,
      sender,
      /* @__PURE__ */ new Date("2026-03-22T06:30:00.000Z")
    );
    assert.equal(emptySummary.sent, 0);
    assert.equal(sender.calls.length, 0);
  });
  it("records missing assignments and invalid WhatsApp numbers as skipped", async () => {
    const store = new MemoryReminderStore();
    const sender = new RecordingSender();
    store.bookings = [
      makeBooking({ id: "unassigned", assignedStaffId: void 0 }),
      makeBooking({ id: "bad-number", assignedStaffId: "bad-number@example.com" })
    ];
    store.staff.set("bad-number@example.com", makeStaff({ whatsappPhone: "0771234567" }));
    const summary = await runWeeklyPhotoshootReminders(
      store,
      sender,
      /* @__PURE__ */ new Date("2026-03-22T06:30:00.000Z")
    );
    assert.equal(summary.skipped, 2);
    assert.equal(sender.calls.length, 0);
    assert.match(
      store.reminders.get(makeReminderId(periodId, "unassigned"))?.skipReason || "",
      /No staff member/
    );
  });
  it("stores WhatsApp API failures and retries with the latest booking details", async () => {
    const store = new MemoryReminderStore();
    const sender = new RecordingSender();
    const booking = makeBooking();
    store.bookings = [booking];
    store.staff.set("staff@example.com", makeStaff());
    sender.failure = new Error("Meta API temporarily unavailable");
    const failed = await runWeeklyPhotoshootReminders(
      store,
      sender,
      /* @__PURE__ */ new Date("2026-03-22T06:30:00.000Z")
    );
    const reminderId = makeReminderId(periodId, booking.id);
    assert.equal(failed.failed, 1);
    assert.match(store.reminders.get(reminderId)?.failureReason || "", /Meta API/);
    sender.failure = null;
    store.bookings[0] = makeBooking({
      customerName: "Updated Client",
      shootDate: "2026-03-25",
      specialNotes: "Latest notes"
    });
    const retried = await retryFailedPhotoshootReminder(
      reminderId,
      store,
      sender,
      /* @__PURE__ */ new Date("2026-03-22T06:31:00.000Z")
    );
    assert.equal(retried.status, "SENT");
    assert.equal(sender.calls[1].parameters[0], "Updated Client");
    assert.equal(sender.calls[1].parameters[6], "Latest notes");
  });
  it("does not send a successful reminder twice for the same week and booking", async () => {
    const store = new MemoryReminderStore();
    const sender = new RecordingSender();
    store.bookings = [makeBooking()];
    store.staff.set("staff@example.com", makeStaff());
    const first = await runWeeklyPhotoshootReminders(
      store,
      sender,
      /* @__PURE__ */ new Date("2026-03-22T06:30:00.000Z")
    );
    const second = await runWeeklyPhotoshootReminders(
      store,
      sender,
      /* @__PURE__ */ new Date("2026-03-22T06:31:00.000Z")
    );
    assert.equal(first.sent, 1);
    assert.equal(second.alreadySent, 1);
    assert.equal(sender.calls.length, 1);
  });
  it("formats the seven approved-template parameters", () => {
    const params = buildTemplateParameters(makeBooking(), "Urban Escape Villa, Homagama");
    assert.deepEqual(params, [
      "Nimal Perera",
      "24 March 2026",
      "9:00 AM \u2013 12:00 PM",
      "Commercial Shoot",
      "15",
      "Urban Escape Villa, Homagama",
      "None provided"
    ]);
  });
});
