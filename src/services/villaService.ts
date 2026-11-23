import { apiClient } from '../lib/apiClient';
import {
  AuditLog,
  BlockedSchedule,
  BookingCategory,
  CurrencyCode,
  EventBooking,
  Payment,
  PaymentMethod,
  RoomBooking,
  RoomType,
  ShootBooking,
  StaffMember,
  StaffRole,
  VillaSettings,
} from '../types/villa';

export const SUPER_ADMIN_EMAIL = 'rnimsara54@gmail.com';

export interface ActorContext {
  uid: string;
  email: string;
  name: string;
  role: StaffRole;
  authorizedEmails: string[];
  adminEmails: string[];
}

export interface BootstrapResponse {
  events: EventBooking[];
  shoots: ShootBooking[];
  roomTypes: RoomType[];
  roomBookings: RoomBooking[];
  payments: Payment[];
  blockedSchedules: BlockedSchedule[];
  staffMembers: StaffMember[];
  auditLogs: AuditLog[];
  settings: VillaSettings | null;
}

type RefreshListener = () => void;
const refreshListeners = new Set<RefreshListener>();

export function subscribeDataRefresh(listener: RefreshListener): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

function triggerDataRefresh(): void {
  refreshListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

// ==========================================
// SESSION & BOOTSTRAP (NODE.JS REST API)
// ==========================================

export async function establishStaffSession(logLogin: boolean): Promise<StaffMember> {
  const res = await apiClient.post<{ staff: StaffMember }>('/auth/session', { logLogin });
  return res.data.staff;
}

export async function logStaffLogout(
  reason: 'manual' | 'timeout',
  timeoutMinutes: number
): Promise<void> {
  await apiClient.post('/auth/logout', { reason, timeoutMinutes });
}

export async function fetchBootstrapData(): Promise<BootstrapResponse> {
  const res = await apiClient.get<BootstrapResponse>('/bootstrap');
  return res.data;
}

export async function fetchOperationalBackup(): Promise<Record<string, unknown>> {
  const res = await apiClient.get<Record<string, unknown>>('/backup');
  return res.data;
}

export async function fetchExcelBackup(): Promise<Blob> {
  const res = await apiClient.get<Blob>('/backup/excel', {
    responseType: 'blob',
  });
  return res.data;
}

// ==========================================
// STAFF MANAGEMENT (4-ACCOUNT CAP)
// ==========================================

export async function createStaffAccount(
  _actor: ActorContext,
  _existingStaff: StaffMember[],
  input: { email: string; name: string; role: StaffRole; phone?: string; isActive: boolean }
): Promise<void> {
  await apiClient.post('/staff', input);
  triggerDataRefresh();
}

export async function updateStaffAccount(
  _actor: ActorContext,
  _existingStaff: StaffMember[],
  staffId: string,
  input: { name: string; role: StaffRole; phone?: string; isActive: boolean }
): Promise<void> {
  await apiClient.patch(`/staff/${staffId}`, input);
  triggerDataRefresh();
}

export async function deleteStaffAccount(
  _actor: ActorContext,
  _existingStaff: StaffMember[],
  staffId: string
): Promise<void> {
  await apiClient.delete(`/staff/${staffId}`);
  triggerDataRefresh();
}

// ==========================================
// EVENT BOOKINGS CRUD
// ==========================================

export async function createEventBooking(
  _actor: ActorContext,
  input: {
    eventType: EventBooking['eventType'];
    venueResource: EventBooking['venueResource'];
    eventDate: string;
    startTime: string;
    endTime: string;
    paxCount: number;
    customerName: string;
    customerPhone: string;
    totalPayment: number;
    advancePayment: number;
    paymentMethod: PaymentMethod;
    referenceNumber?: string;
    specialNotes?: string;
    status: EventBooking['status'];
  }
): Promise<string> {
  const res = await apiClient.post<{ id: string; bookingCode: string }>('/events', input);
  triggerDataRefresh();
  return res.data.id;
}

export async function updateEventBooking(
  _actor: ActorContext,
  event: EventBooking,
  input: {
    eventType: EventBooking['eventType'];
    venueResource: EventBooking['venueResource'];
    eventDate: string;
    startTime: string;
    endTime: string;
    paxCount: number;
    customerName: string;
    customerPhone: string;
    totalPayment: number;
    specialNotes?: string;
    status: EventBooking['status'];
  }
): Promise<void> {
  await apiClient.patch(`/events/${event.id}`, input);
  triggerDataRefresh();
}

// ==========================================
// PHOTOSHOOT BOOKINGS CRUD
// ==========================================

export async function createShootBooking(
  _actor: ActorContext,
  input: {
    shootDate: string;
    shootType: ShootBooking['shootType'];
    venueResource: ShootBooking['venueResource'];
    startTime: string;
    endTime: string;
    customerName: string;
    customerPhone: string;
    totalPayment: number;
    advancePayment: number;
    paymentMethod: PaymentMethod;
    referenceNumber?: string;
    specialNotes?: string;
    status: ShootBooking['status'];
  }
): Promise<string> {
  const res = await apiClient.post<{ id: string; bookingCode: string }>('/shoots', input);
  triggerDataRefresh();
  return res.data.id;
}

export async function updateShootBooking(
  _actor: ActorContext,
  shoot: ShootBooking,
  input: {
    shootDate: string;
    shootType: ShootBooking['shootType'];
    venueResource: ShootBooking['venueResource'];
    startTime: string;
    endTime: string;
    customerName: string;
    customerPhone: string;
    totalPayment: number;
    specialNotes?: string;
    status: ShootBooking['status'];
  }
): Promise<void> {
  await apiClient.patch(`/shoots/${shoot.id}`, input);
  triggerDataRefresh();
}

// ==========================================
// ROOM TYPES & ROOM BOOKINGS CRUD
// ==========================================

export async function createRoomType(
  _actor: ActorContext,
  input: {
    roomCode: string;
    name: string;
    description: string;
    maxCapacity: number;
    price: number;
    status: RoomType['status'];
    imageUrl?: string;
  }
): Promise<string> {
  const res = await apiClient.post<{ id: string }>('/room-types', input);
  triggerDataRefresh();
  return res.data.id;
}

export async function updateRoomType(
  _actor: ActorContext,
  roomType: RoomType,
  input: {
    roomCode: string;
    name: string;
    description: string;
    maxCapacity: number;
    price: number;
    status: RoomType['status'];
    imageUrl?: string;
  }
): Promise<void> {
  await apiClient.patch(`/room-types/${roomType.id}`, input);
  triggerDataRefresh();
}

export async function createRoomBooking(
  _actor: ActorContext,
  roomType: RoomType,
  input: {
    customerName: string;
    customerPhone: string;
    foodStatus: RoomBooking['foodStatus'];
    checkInDate: string;
    checkInTime: string;
    checkOutDate: string;
    checkOutTime: string;
    totalPayment: number;
    advancePayment: number;
    paymentMethod: PaymentMethod;
    referenceNumber?: string;
    specialNotes?: string;
    status: RoomBooking['status'];
  }
): Promise<string> {
  const res = await apiClient.post<{ id: string; bookingCode: string }>('/room-bookings', {
    ...input,
    roomTypeId: roomType.id,
  });
  triggerDataRefresh();
  return res.data.id;
}

export async function updateRoomBooking(
  _actor: ActorContext,
  booking: RoomBooking,
  roomType: RoomType,
  input: {
    customerName: string;
    customerPhone: string;
    foodStatus: RoomBooking['foodStatus'];
    checkInDate: string;
    checkInTime: string;
    checkOutDate: string;
    checkOutTime: string;
    totalPayment: number;
    specialNotes?: string;
    status: RoomBooking['status'];
  }
): Promise<void> {
  await apiClient.patch(`/room-bookings/${booking.id}`, {
    ...input,
    roomTypeId: roomType.id,
  });
  triggerDataRefresh();
}

// ==========================================
// ARCHIVE, RESTORE, PERMANENT DELETE
// ==========================================

export async function archiveBooking(
  _actor: ActorContext,
  category: BookingCategory,
  id: string,
  _bookingCode: string
): Promise<void> {
  await apiClient.post(`/bookings/${category}/${id}/archive`, {});
  triggerDataRefresh();
}

export async function restoreBooking(
  _actor: ActorContext,
  category: BookingCategory,
  id: string,
  _bookingCode: string
): Promise<void> {
  await apiClient.post(`/bookings/${category}/${id}/restore`, {});
  triggerDataRefresh();
}

export async function permanentlyDeleteBooking(
  _actor: ActorContext,
  category: BookingCategory,
  id: string,
  _bookingCode: string
): Promise<void> {
  await apiClient.delete(`/bookings/${category}/${id}`);
  triggerDataRefresh();
}

export async function archiveOrRestoreRoomType(
  _actor: ActorContext,
  roomType: RoomType,
  archive: boolean
): Promise<void> {
  await apiClient.patch(`/room-types/${roomType.id}/archive`, { archive });
  triggerDataRefresh();
}

// ==========================================
// CENTRALIZED PAYMENT ENGINE
// ==========================================

export async function recordBookingPayment(
  _actor: ActorContext,
  params: {
    bookingId: string;
    bookingCode: string;
    bookingType: BookingCategory;
    customerName: string;
    amount: number;
    paymentMethod: PaymentMethod;
    paymentDate: string;
    referenceNumber?: string;
    notes?: string;
    isAdjustment: boolean;
    adjustmentReason?: string;
    allowOverpayment: boolean;
    existingPaymentsForBooking: Payment[];
  }
): Promise<void> {
  await apiClient.post('/payments', {
    bookingId: params.bookingId,
    bookingType: params.bookingType,
    amount: params.amount,
    paymentMethod: params.paymentMethod,
    paymentDate: params.paymentDate,
    referenceNumber: params.referenceNumber,
    notes: params.notes,
    isAdjustment: params.isAdjustment,
    adjustmentReason: params.adjustmentReason,
    allowOverpayment: params.allowOverpayment,
  });
  triggerDataRefresh();
}

export async function voidPaymentWithAudit(
  _actor: ActorContext,
  payment: Payment,
  reason: string,
  _allPaymentsForBooking: Payment[]
): Promise<void> {
  await apiClient.post(`/payments/${payment.id}/void`, { reason });
  triggerDataRefresh();
}

// ==========================================
// CALENDAR BLOCKED SCHEDULES
// ==========================================

export async function createBlockedSchedule(
  _actor: ActorContext,
  input: {
    scope: BlockedSchedule['scope'];
    roomTypeId?: string;
    roomTypeName?: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    reason: string;
  }
): Promise<void> {
  await apiClient.post('/calendar/blocks', input);
  triggerDataRefresh();
}

export async function deleteBlockedSchedule(
  _actor: ActorContext,
  block: BlockedSchedule
): Promise<void> {
  await apiClient.delete(`/calendar/blocks/${block.id}`);
  triggerDataRefresh();
}

// ==========================================
// SETTINGS
// ==========================================

export async function updateVillaSettings(
  _actor: ActorContext,
  _currentSettings: VillaSettings | null,
  input: {
    villaName: string;
    currency: CurrencyCode;
    inactivityTimeoutMinutes: number;
  }
): Promise<void> {
  await apiClient.patch('/settings', input);
  triggerDataRefresh();
}
