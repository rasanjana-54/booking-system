import type {
  BlockedSchedule,
  CurrencyCode,
  EventBooking,
  FirestoreTimestampLike,
  PaymentStatus,
  RoomBooking,
  ShootBooking,
  VenueResource,
} from '../types/villa.ts';

export const VILLA_TIMEZONE = 'Asia/Colombo';

/**
 * Returns YYYY-MM-DD in Asia/Colombo timezone for a given Date (default: now).
 */
export function getColomboDateStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VILLA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Returns HH:mm (24h) in Asia/Colombo timezone for a given Date (default: now).
 */
export function getColomboTimeStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: VILLA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Converts a Firestore Timestamp or ISO string to epoch milliseconds.
 */
export function timestampToMs(ts?: FirestoreTimestampLike): number {
  if (!ts) return 0;
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof ts === 'object' && typeof ts.toMillis === 'function') {
    return ts.toMillis();
  }
  return 0;
}

/**
 * Formats YYYY-MM-DD into a human-readable date string in Asia/Colombo context.
 */
export function formatColomboDate(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: VILLA_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dt);
}

/**
 * Formats a Firestore Timestamp or ISO date string in Asia/Colombo timezone.
 */
export function formatColomboTimestamp(ts?: FirestoreTimestampLike): string {
  if (!ts) return '—';
  const dt =
    typeof ts === 'string'
      ? new Date(ts)
      : typeof ts === 'object' && typeof ts.toDate === 'function'
      ? ts.toDate()
      : null;
  if (!dt || Number.isNaN(dt.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: VILLA_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
}

/**
 * Adds days to a YYYY-MM-DD date string safely.
 */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * Returns start/end YYYY-MM-DD strings for Today, This Week (Mon-Sun), or This Month in Asia/Colombo.
 */
export function getColomboPeriodRange(
  period: 'today' | 'week' | 'month'
): { start: string; end: string } {
  const today = getColomboDateStr();
  if (period === 'today') {
    return { start: today, end: today };
  }
  const [y, m, d] = today.split('-').map(Number);
  if (period === 'week') {
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dt.getUTCDay(); // 0 Sun..6 Sat
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = addDaysToDateStr(today, mondayOffset);
    const end = addDaysToDateStr(start, 6);
    return { start, end };
  }
  const monthStr = String(m).padStart(2, '0');
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${y}-${monthStr}-01`,
    end: `${y}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Formats currency with tabular-friendly alignment.
 */
export function formatCurrency(amount: number, currency: CurrencyCode = 'LKR'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  }
  return `LKR ${new Intl.NumberFormat('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe)}`;
}

/**
 * Computes payment status & due balance consistently across frontend & transactions.
 */
export function computePaymentSummary(
  totalPayment: number,
  totalPaid: number
): { duePayment: number; paymentStatus: PaymentStatus } {
  const cleanTotal = Math.max(0, Number(totalPayment) || 0);
  const cleanPaid = Math.max(0, Number(totalPaid) || 0);
  const duePayment = Math.max(0, Number((cleanTotal - cleanPaid).toFixed(2)));

  let paymentStatus: PaymentStatus = 'UNPAID';
  if (cleanPaid <= 0) {
    paymentStatus = cleanTotal === 0 ? 'FULLY_PAID' : 'UNPAID';
  } else if (cleanPaid < cleanTotal) {
    paymentStatus = 'PARTIALLY_PAID';
  } else if (Math.abs(cleanPaid - cleanTotal) < 0.01) {
    paymentStatus = 'FULLY_PAID';
  } else {
    paymentStatus = 'OVERPAID';
  }

  return { duePayment, paymentStatus };
}

/**
 * Converts YYYY-MM-DD and HH:mm (Asia/Colombo UTC+05:30) to epoch ms for exact interval comparison.
 */
export function colomboDateTimeToMs(dateStr: string, timeStr: string): number {
  const iso = `${dateStr}T${timeStr}:00+05:30`;
  return new Date(iso).getTime();
}

export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function venuesConflict(a: VenueResource, b: VenueResource): boolean {
  return a === 'Full Estate' || b === 'Full Estate' || a === b;
}

/**
 * Checks whether a candidate Event or Shoot conflicts with existing active Events, Shoots, or Blocked Schedules.
 */
export function findVenueScheduleConflict(params: {
  date: string;
  startTime: string;
  endTime: string;
  venueResource: VenueResource;
  bookingKind: 'EVENT' | 'SHOOT';
  excludeId?: string;
  events: EventBooking[];
  shoots: ShootBooking[];
  blocks: BlockedSchedule[];
}): string | null {
  const startMs = colomboDateTimeToMs(params.date, params.startTime);
  const endMs = colomboDateTimeToMs(params.date, params.endTime);

  if (endMs <= startMs) {
    return 'End time must be strictly after start time.';
  }

  for (const evt of params.events) {
    if (evt.isArchived || evt.status === 'Cancelled') continue;
    if (params.bookingKind === 'EVENT' && evt.id === params.excludeId) continue;
    if (evt.eventDate !== params.date) continue;
    if (!venuesConflict(params.venueResource, evt.venueResource)) continue;
    const oStart = colomboDateTimeToMs(evt.eventDate, evt.startTime);
    const oEnd = colomboDateTimeToMs(evt.eventDate, evt.endTime);
    if (intervalsOverlap(startMs, endMs, oStart, oEnd)) {
      return `Conflicts with Event ${evt.bookingCode} (${evt.customerName}, ${evt.startTime}–${evt.endTime} at ${evt.venueResource}).`;
    }
  }

  for (const sht of params.shoots) {
    if (sht.isArchived || sht.status === 'Cancelled') continue;
    if (params.bookingKind === 'SHOOT' && sht.id === params.excludeId) continue;
    if (sht.shootDate !== params.date) continue;
    if (!venuesConflict(params.venueResource, sht.venueResource)) continue;
    const oStart = colomboDateTimeToMs(sht.shootDate, sht.startTime);
    const oEnd = colomboDateTimeToMs(sht.shootDate, sht.endTime);
    if (intervalsOverlap(startMs, endMs, oStart, oEnd)) {
      return `Conflicts with Shoot ${sht.bookingCode} (${sht.customerName}, ${sht.startTime}–${sht.endTime} at ${sht.venueResource}).`;
    }
  }

  for (const blk of params.blocks) {
    const applies =
      blk.scope === 'FULL_VILLA' ||
      (params.bookingKind === 'EVENT' && blk.scope === 'EVENT_GROUNDS') ||
      (params.bookingKind === 'SHOOT' && blk.scope === 'SHOOT_GROUNDS');
    if (!applies) continue;
    const bStart = colomboDateTimeToMs(blk.startDate, blk.startTime);
    const bEnd = colomboDateTimeToMs(blk.endDate, blk.endTime);
    if (intervalsOverlap(startMs, endMs, bStart, bEnd)) {
      return `Schedule is blocked (${blk.reason}: ${blk.startDate} ${blk.startTime} – ${blk.endDate} ${blk.endTime}).`;
    }
  }

  return null;
}

/**
 * Checks whether a candidate Room Booking conflicts with existing active Room Bookings or Blocked Schedules.
 */
export function findRoomBookingConflict(params: {
  roomTypeId: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  excludeId?: string;
  roomBookings: RoomBooking[];
  blocks: BlockedSchedule[];
}): string | null {
  const startMs = colomboDateTimeToMs(params.checkInDate, params.checkInTime);
  const endMs = colomboDateTimeToMs(params.checkOutDate, params.checkOutTime);

  if (endMs <= startMs) {
    return 'Check-out date and time must be strictly after check-in date and time.';
  }

  for (const rb of params.roomBookings) {
    if (rb.isArchived || rb.status === 'Cancelled' || rb.status === 'Checked-out') continue;
    if (rb.id === params.excludeId) continue;
    if (rb.roomTypeId !== params.roomTypeId) continue;

    const rStart = colomboDateTimeToMs(rb.checkInDate, rb.checkInTime);
    const rEnd = colomboDateTimeToMs(rb.checkOutDate, rb.checkOutTime);
    if (intervalsOverlap(startMs, endMs, rStart, rEnd)) {
      return `Room unavailable: overlaps with ${rb.bookingCode} (${rb.customerName}, ${rb.checkInDate} to ${rb.checkOutDate}).`;
    }
  }

  for (const blk of params.blocks) {
    const applies =
      blk.scope === 'FULL_VILLA' ||
      (blk.scope === 'ROOM' && blk.roomTypeId === params.roomTypeId);
    if (!applies) continue;
    const bStart = colomboDateTimeToMs(blk.startDate, blk.startTime);
    const bEnd = colomboDateTimeToMs(blk.endDate, blk.endTime);
    if (intervalsOverlap(startMs, endMs, bStart, bEnd)) {
      return `Room blocked (${blk.reason}: ${blk.startDate} to ${blk.endDate}).`;
    }
  }

  return null;
}
