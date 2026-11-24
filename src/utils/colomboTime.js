const VILLA_TIMEZONE = "Asia/Colombo";
function getColomboDateStr(date = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VILLA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
function getColomboTimeStr(date = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: VILLA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
function timestampToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === "string") {
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof ts === "object" && typeof ts.toMillis === "function") {
    return ts.toMillis();
  }
  return 0;
}
function formatColomboDate(dateStr) {
  if (!dateStr) return "\u2014";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: VILLA_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(dt);
}
function formatColomboTimestamp(ts) {
  if (!ts) return "\u2014";
  const dt = typeof ts === "string" ? new Date(ts) : typeof ts === "object" && typeof ts.toDate === "function" ? ts.toDate() : null;
  if (!dt || Number.isNaN(dt.getTime())) return "\u2014";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: VILLA_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(dt);
}
function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}
function getColomboPeriodRange(period) {
  const today = getColomboDateStr();
  if (period === "today") {
    return { start: today, end: today };
  }
  const [y, m, d] = today.split("-").map(Number);
  if (period === "week") {
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dt.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = addDaysToDateStr(today, mondayOffset);
    const end = addDaysToDateStr(start, 6);
    return { start, end };
  }
  const monthStr = String(m).padStart(2, "0");
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${y}-${monthStr}-01`,
    end: `${y}-${monthStr}-${String(lastDay).padStart(2, "0")}`
  };
}
function getColomboShootPeriodRange(dateStr = getColomboDateStr()) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const startMonthOffset = day >= 15 ? 0 : -1;
  const endMonthOffset = day >= 15 ? 1 : 0;
  const start = new Date(Date.UTC(year, month - 1 + startMonthOffset, 15, 12));
  const end = new Date(Date.UTC(year, month - 1 + endMonthOffset, 14, 12));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}
function formatCurrency(amount, currency = "LKR") {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(safe);
  }
  return `LKR ${new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(safe)}`;
}
function computePaymentSummary(totalPayment, totalPaid) {
  const cleanTotal = Math.max(0, Number(totalPayment) || 0);
  const cleanPaid = Math.max(0, Number(totalPaid) || 0);
  const duePayment = Math.max(0, Number((cleanTotal - cleanPaid).toFixed(2)));
  let paymentStatus = "UNPAID";
  if (cleanPaid <= 0) {
    paymentStatus = cleanTotal === 0 ? "FULLY_PAID" : "UNPAID";
  } else if (cleanPaid < cleanTotal) {
    paymentStatus = "PARTIALLY_PAID";
  } else if (Math.abs(cleanPaid - cleanTotal) < 0.01) {
    paymentStatus = "FULLY_PAID";
  } else {
    paymentStatus = "OVERPAID";
  }
  return { duePayment, paymentStatus };
}
function colomboDateTimeToMs(dateStr, timeStr) {
  const iso = `${dateStr}T${timeStr}:00+05:30`;
  return new Date(iso).getTime();
}
function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function venuesConflict(a, b) {
  return a === "Full Estate" || b === "Full Estate" || a === b;
}
function findVenueScheduleConflict(params) {
  const startMs = colomboDateTimeToMs(params.date, params.startTime);
  const endMs = colomboDateTimeToMs(params.date, params.endTime);
  if (endMs <= startMs) {
    return "End time must be strictly after start time.";
  }
  for (const evt of params.events) {
    if (evt.isArchived || evt.status === "Cancelled") continue;
    if (params.bookingKind === "EVENT" && evt.id === params.excludeId) continue;
    if (evt.eventDate !== params.date) continue;
    if (!venuesConflict(params.venueResource, evt.venueResource)) continue;
    const oStart = colomboDateTimeToMs(evt.eventDate, evt.startTime);
    const oEnd = colomboDateTimeToMs(evt.eventDate, evt.endTime);
    if (intervalsOverlap(startMs, endMs, oStart, oEnd)) {
      return `Conflicts with Event ${evt.bookingCode} (${evt.customerName}, ${evt.startTime}\u2013${evt.endTime} at ${evt.venueResource}).`;
    }
  }
  for (const sht of params.shoots) {
    if (sht.isArchived || sht.status === "Cancelled") continue;
    if (params.bookingKind === "SHOOT" && sht.id === params.excludeId) continue;
    if (sht.shootDate !== params.date) continue;
    if (!venuesConflict(params.venueResource, sht.venueResource)) continue;
    const oStart = colomboDateTimeToMs(sht.shootDate, sht.startTime);
    const oEnd = colomboDateTimeToMs(sht.shootDate, sht.endTime);
    if (intervalsOverlap(startMs, endMs, oStart, oEnd)) {
      return `Conflicts with Shoot ${sht.bookingCode} (${sht.customerName}, ${sht.startTime}\u2013${sht.endTime} at ${sht.venueResource}).`;
    }
  }
  for (const blk of params.blocks) {
    const applies = blk.scope === "FULL_VILLA" || params.bookingKind === "EVENT" && blk.scope === "EVENT_GROUNDS" || params.bookingKind === "SHOOT" && blk.scope === "SHOOT_GROUNDS";
    if (!applies) continue;
    const bStart = colomboDateTimeToMs(blk.startDate, blk.startTime);
    const bEnd = colomboDateTimeToMs(blk.endDate, blk.endTime);
    if (intervalsOverlap(startMs, endMs, bStart, bEnd)) {
      return `Schedule is blocked (${blk.reason}: ${blk.startDate} ${blk.startTime} \u2013 ${blk.endDate} ${blk.endTime}).`;
    }
  }
  return null;
}
function findRoomBookingConflict(params) {
  const startMs = colomboDateTimeToMs(params.checkInDate, params.checkInTime);
  const endMs = colomboDateTimeToMs(params.checkOutDate, params.checkOutTime);
  if (endMs <= startMs) {
    return "Check-out date and time must be strictly after check-in date and time.";
  }
  for (const rb of params.roomBookings) {
    if (rb.isArchived || rb.status === "Cancelled" || rb.status === "Checked-out") continue;
    if (rb.id === params.excludeId) continue;
    if (rb.roomTypeId !== params.roomTypeId) continue;
    const rStart = colomboDateTimeToMs(rb.checkInDate, rb.checkInTime);
    const rEnd = colomboDateTimeToMs(rb.checkOutDate, rb.checkOutTime);
    if (intervalsOverlap(startMs, endMs, rStart, rEnd)) {
      return `Room unavailable: overlaps with ${rb.bookingCode} (${rb.customerName}, ${rb.checkInDate} to ${rb.checkOutDate}).`;
    }
  }
  for (const blk of params.blocks) {
    const applies = blk.scope === "FULL_VILLA" || blk.scope === "ROOM" && blk.roomTypeId === params.roomTypeId;
    if (!applies) continue;
    const bStart = colomboDateTimeToMs(blk.startDate, blk.startTime);
    const bEnd = colomboDateTimeToMs(blk.endDate, blk.endTime);
    if (intervalsOverlap(startMs, endMs, bStart, bEnd)) {
      return `Room blocked (${blk.reason}: ${blk.startDate} to ${blk.endDate}).`;
    }
  }
  return null;
}
export {
  VILLA_TIMEZONE,
  addDaysToDateStr,
  colomboDateTimeToMs,
  computePaymentSummary,
  findRoomBookingConflict,
  findVenueScheduleConflict,
  formatColomboDate,
  formatColomboTimestamp,
  formatCurrency,
  getColomboDateStr,
  getColomboPeriodRange,
  getColomboShootPeriodRange,
  getColomboTimeStr,
  intervalsOverlap,
  timestampToMs,
  venuesConflict
};
