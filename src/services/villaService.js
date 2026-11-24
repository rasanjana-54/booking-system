import { apiClient } from "../lib/apiClient";
const SUPER_ADMIN_EMAIL = "rnimsara54@gmail.com";
const refreshListeners = /* @__PURE__ */ new Set();
function subscribeDataRefresh(listener) {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}
function triggerDataRefresh() {
  refreshListeners.forEach((fn) => {
    try {
      fn();
    } catch {
    }
  });
}
async function establishStaffSession(logLogin) {
  const res = await apiClient.post("/auth/session", { logLogin });
  return res.data.staff;
}
async function logStaffLogout(reason, timeoutMinutes) {
  await apiClient.post("/auth/logout", { reason, timeoutMinutes });
}
async function fetchBootstrapData() {
  const res = await apiClient.get("/bootstrap");
  return res.data;
}
async function fetchOperationalBackup() {
  const res = await apiClient.get("/backup");
  return res.data;
}
async function fetchExcelBackup() {
  const res = await apiClient.get("/backup/excel", {
    responseType: "blob"
  });
  return res.data;
}
async function createStaffAccount(_actor, _existingStaff, input) {
  await apiClient.post("/staff", input);
  triggerDataRefresh();
}
async function updateStaffAccount(_actor, _existingStaff, staffId, input) {
  await apiClient.patch(`/staff/${staffId}`, input);
  triggerDataRefresh();
}
async function deleteStaffAccount(_actor, _existingStaff, staffId) {
  await apiClient.delete(`/staff/${staffId}`);
  triggerDataRefresh();
}
async function createEventBooking(_actor, input) {
  const res = await apiClient.post("/events", input);
  triggerDataRefresh();
  return res.data.id;
}
async function updateEventBooking(_actor, event, input) {
  await apiClient.patch(`/events/${event.id}`, input);
  triggerDataRefresh();
}
async function createShootBooking(_actor, input) {
  const res = await apiClient.post("/shoots", input);
  triggerDataRefresh();
  return res.data.id;
}
async function updateShootBooking(_actor, shoot, input) {
  await apiClient.patch(`/shoots/${shoot.id}`, input);
  triggerDataRefresh();
}
async function fetchWhatsAppReminders() {
  const res = await apiClient.get("/admin/whatsapp-reminders");
  return res.data.reminders;
}
async function retryWhatsAppReminder(reminderId) {
  const res = await apiClient.post(
    `/admin/whatsapp-reminders/${encodeURIComponent(reminderId)}/retry`
  );
  return res.data.reminder;
}
async function createRoomType(_actor, input) {
  const res = await apiClient.post("/room-types", input);
  triggerDataRefresh();
  return res.data.id;
}
async function updateRoomType(_actor, roomType, input) {
  await apiClient.patch(`/room-types/${roomType.id}`, input);
  triggerDataRefresh();
}
async function createRoomBooking(_actor, roomType, input) {
  const res = await apiClient.post("/room-bookings", {
    ...input,
    roomTypeId: roomType.id
  });
  triggerDataRefresh();
  return res.data.id;
}
async function updateRoomBooking(_actor, booking, roomType, input) {
  await apiClient.patch(`/room-bookings/${booking.id}`, {
    ...input,
    roomTypeId: roomType.id
  });
  triggerDataRefresh();
}
async function archiveBooking(_actor, category, id, _bookingCode) {
  await apiClient.post(`/bookings/${category}/${id}/archive`, {});
  triggerDataRefresh();
}
async function restoreBooking(_actor, category, id, _bookingCode) {
  await apiClient.post(`/bookings/${category}/${id}/restore`, {});
  triggerDataRefresh();
}
async function permanentlyDeleteBooking(_actor, category, id, _bookingCode) {
  await apiClient.delete(`/bookings/${category}/${id}`);
  triggerDataRefresh();
}
async function archiveOrRestoreRoomType(_actor, roomType, archive) {
  await apiClient.patch(`/room-types/${roomType.id}/archive`, { archive });
  triggerDataRefresh();
}
async function recordBookingPayment(_actor, params) {
  await apiClient.post("/payments", {
    bookingId: params.bookingId,
    bookingType: params.bookingType,
    amount: params.amount,
    paymentMethod: params.paymentMethod,
    paymentDate: params.paymentDate,
    referenceNumber: params.referenceNumber,
    notes: params.notes,
    isAdjustment: params.isAdjustment,
    adjustmentReason: params.adjustmentReason,
    allowOverpayment: params.allowOverpayment
  });
  triggerDataRefresh();
}
async function voidPaymentWithAudit(_actor, payment, reason, _allPaymentsForBooking) {
  await apiClient.post(`/payments/${payment.id}/void`, { reason });
  triggerDataRefresh();
}
async function createBlockedSchedule(_actor, input) {
  await apiClient.post("/calendar/blocks", input);
  triggerDataRefresh();
}
async function deleteBlockedSchedule(_actor, block) {
  await apiClient.delete(`/calendar/blocks/${block.id}`);
  triggerDataRefresh();
}
async function updateVillaSettings(_actor, _currentSettings, input) {
  await apiClient.patch("/settings", input);
  triggerDataRefresh();
}
export {
  SUPER_ADMIN_EMAIL,
  archiveBooking,
  archiveOrRestoreRoomType,
  createBlockedSchedule,
  createEventBooking,
  createRoomBooking,
  createRoomType,
  createShootBooking,
  createStaffAccount,
  deleteBlockedSchedule,
  deleteStaffAccount,
  establishStaffSession,
  fetchBootstrapData,
  fetchExcelBackup,
  fetchOperationalBackup,
  fetchWhatsAppReminders,
  logStaffLogout,
  permanentlyDeleteBooking,
  recordBookingPayment,
  restoreBooking,
  retryWhatsAppReminder,
  subscribeDataRefresh,
  updateEventBooking,
  updateRoomBooking,
  updateRoomType,
  updateShootBooking,
  updateStaffAccount,
  updateVillaSettings,
  voidPaymentWithAudit
};
