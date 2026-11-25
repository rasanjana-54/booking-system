import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  Camera,
  PartyPopper
} from "lucide-react";
import { useVillaData } from "../contexts/VillaDataContext";
import {
  formatColomboDate,
  getColomboDateStr,
  getColomboPeriodRange,
  getColomboShootPeriodRange,
  timestampToMs
} from "../utils/colomboTime";
import { StatusBadge } from "../components/StatusBadge";
import { BookingDetailModal } from "../components/BookingDetailModal";
const DashboardPage = () => {
  const { events, shoots, roomBookings, loading } = useVillaData();
  const [preset, setPreset] = useState("month");
  const [customStart, setCustomStart] = useState(getColomboPeriodRange("month").start);
  const [customEnd, setCustomEnd] = useState(getColomboPeriodRange("month").end);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const todayStr = getColomboDateStr();
  const activeEvents = useMemo(() => events.filter((e) => !e.isArchived), [events]);
  const activeShoots = useMemo(() => shoots.filter((s) => !s.isArchived), [shoots]);
  const activeRooms = useMemo(() => roomBookings.filter((r) => !r.isArchived), [roomBookings]);
  const dateBounds = useMemo(() => {
    if (preset === "all") return null;
    if (preset === "custom") return { start: customStart, end: customEnd };
    return getColomboPeriodRange(preset);
  }, [preset, customStart, customEnd]);
  const shootDateBounds = useMemo(
    () => preset === "month" ? getColomboShootPeriodRange() : dateBounds,
    [preset, dateBounds]
  );
  const inRange = (dateStr) => {
    if (!dateBounds) return true;
    return dateStr >= dateBounds.start && dateStr <= dateBounds.end;
  };
  const filteredEvents = useMemo(
    () => activeEvents.filter((e) => inRange(e.eventDate)),
    [activeEvents, dateBounds]
  );
  const filteredShoots = useMemo(
    () => activeShoots.filter(
      (s) => !shootDateBounds || s.shootDate >= shootDateBounds.start && s.shootDate <= shootDateBounds.end
    ),
    [activeShoots, shootDateBounds]
  );
  const filteredRooms = useMemo(
    () => activeRooms.filter((r) => {
      if (!dateBounds) return true;
      return r.checkInDate <= dateBounds.end && r.checkOutDate >= dateBounds.start;
    }),
    [activeRooms, dateBounds]
  );
  const metrics = useMemo(() => {
    const todaysBookings = activeEvents.filter((e) => e.eventDate === todayStr && e.status !== "Cancelled").length + activeShoots.filter((s) => s.shootDate === todayStr && s.status !== "Cancelled").length + activeRooms.filter(
      (r) => r.checkInDate <= todayStr && r.checkOutDate >= todayStr && r.status !== "Cancelled"
    ).length;
    const upcomingBookings = activeEvents.filter((e) => e.eventDate > todayStr && e.status !== "Cancelled").length + activeShoots.filter((s) => s.shootDate > todayStr && s.status !== "Cancelled").length + activeRooms.filter((r) => r.checkInDate > todayStr && r.status !== "Cancelled").length;
    return {
      totalEvents: filteredEvents.length,
      totalShoots: filteredShoots.length,
      totalRooms: filteredRooms.length,
      todaysBookings,
      upcomingBookings
    };
  }, [filteredEvents, filteredShoots, filteredRooms, activeEvents, activeShoots, activeRooms, todayStr]);
  const recentBookings = useMemo(() => {
    const all = [
      ...activeEvents.map((e) => ({
        item: { category: "EVENT", data: e },
        createdMs: timestampToMs(e.createdAt),
        sortDate: e.eventDate
      })),
      ...activeShoots.map((s) => ({
        item: { category: "SHOOT", data: s },
        createdMs: timestampToMs(s.createdAt),
        sortDate: s.shootDate
      })),
      ...activeRooms.map((r) => ({
        item: { category: "ROOM", data: r },
        createdMs: timestampToMs(r.createdAt),
        sortDate: r.checkInDate
      }))
    ];
    all.sort((a, b) => b.createdMs - a.createdMs);
    return all.slice(0, 6);
  }, [activeEvents, activeShoots, activeRooms]);
  const upcomingSchedule = useMemo(() => {
    const list = [
      ...activeEvents.filter((e) => e.eventDate >= todayStr && e.status !== "Cancelled").map((e) => ({
        id: e.id,
        date: e.eventDate,
        time: `${e.startTime}\u2013${e.endTime}`,
        title: `${e.eventType} \xB7 ${e.customerName}`,
        subtitle: `${e.bookingCode} \xB7 ${e.venueResource}`,
        category: "EVENT",
        status: e.status,
        item: { category: "EVENT", data: e }
      })),
      ...activeShoots.filter((s) => s.shootDate >= todayStr && s.status !== "Cancelled").map((s) => ({
        id: s.id,
        date: s.shootDate,
        time: `${s.startTime}\u2013${s.endTime}`,
        title: `${s.shootType} \xB7 ${s.customerName}`,
        subtitle: `${s.bookingCode} \xB7 ${s.venueResource}`,
        category: "SHOOT",
        status: s.status,
        item: { category: "SHOOT", data: s }
      })),
      ...activeRooms.filter((r) => r.checkOutDate >= todayStr && r.status !== "Cancelled").map((r) => ({
        id: r.id,
        date: r.checkInDate,
        time: `In ${r.checkInTime}`,
        title: `${r.roomTypeName} \xB7 ${r.customerName}`,
        subtitle: `${r.bookingCode} \xB7 Until ${formatColomboDate(r.checkOutDate)}`,
        category: "ROOM",
        status: r.status,
        item: { category: "ROOM", data: r }
      }))
    ];
    list.sort((a, b) => a.date.localeCompare(b.date));
    return list.slice(0, 8);
  }, [activeEvents, activeShoots, activeRooms, todayStr]);
  const activeSelectedBooking = useMemo(() => {
    if (!selectedBooking) return null;
    const list = selectedBooking.category === "EVENT" ? events : selectedBooking.category === "SHOOT" ? shoots : roomBookings;
    const latest = list.find((item) => item.id === selectedBooking.data.id);
    return latest ? { category: selectedBooking.category, data: latest } : selectedBooking;
  }, [selectedBooking, events, shoots, roomBookings]);
  if (loading) {
    return <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div
      key={i}
      className="h-28 rounded-xl bg-white border border-[#E2DFD5] animate-pulse"
    />)}
        </div>
      </div>;
  }
  return <div className="space-y-6">
      {
    /* Header & Date Filter Bar */
  }
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2
    className="text-2xl sm:text-3xl font-semibold text-[#1C2420] tracking-tight"
    style={{ fontFamily: "var(--font-display)" }}
  >
            Estate Operations Overview
          </h2>
          <p className="text-sm text-[#6E6C63] mt-0.5">
            Live bookings and upcoming calendar schedule ({todayStr})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-1 bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg">
            {[
    ["today", "Today"],
    ["week", "This Week"],
    ["month", "This Month"],
    ["all", "All Time"],
    ["custom", "Custom"]
  ].map(([key, label]) => <button
    key={key}
    type="button"
    onClick={() => setPreset(key)}
    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${preset === key ? "bg-white text-[#1C2420] shadow-xs" : "text-[#6E6C63] hover:text-[#1C2420]"}`}
  >
                {label}
              </button>)}
          </div>

          {preset === "custom" && <div className="flex items-center gap-2">
              <input
    type="date"
    value={customStart}
    onChange={(e) => setCustomStart(e.target.value)}
    className="rounded-lg border border-[#CDC9BC] bg-white px-2.5 py-1.5 text-xs font-mono"
  />
              <span className="text-xs text-[#6E6C63]">to</span>
              <input
    type="date"
    value={customEnd}
    onChange={(e) => setCustomEnd(e.target.value)}
    className="rounded-lg border border-[#CDC9BC] bg-white px-2.5 py-1.5 text-xs font-mono"
  />
            </div>}
        </div>
      </div>

      {
    /* Booking Overview */
  }
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2DFD5] rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6E6C63]">Event Bookings</span>
            <PartyPopper className="w-4 h-4 text-[#183D2D]" />
          </div>
          <p className="text-2xl font-semibold text-[#1C2420] font-mono tabular-nums mt-2">
            {metrics.totalEvents}
          </p>
          <p className="text-xs text-[#6E6C63] mt-1">In selected period</p>
        </div>

        <div className="bg-white border border-[#E2DFD5] rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6E6C63]">Photoshoot Bookings</span>
            <Camera className="w-4 h-4 text-[#B45309]" />
          </div>
          <p className="text-2xl font-semibold text-[#1C2420] font-mono tabular-nums mt-2">
            {metrics.totalShoots}
          </p>
          <p className="text-xs text-[#6E6C63] mt-1">
            {preset === "month" && shootDateBounds ? `${formatColomboDate(shootDateBounds.start)} \u2013 ${formatColomboDate(shootDateBounds.end)}` : "In selected period"}
          </p>
        </div>

        <div className="bg-white border border-[#E2DFD5] rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6E6C63]">Room Bookings</span>
            <BedDouble className="w-4 h-4 text-[#1D4ED8]" />
          </div>
          <p className="text-2xl font-semibold text-[#1C2420] font-mono tabular-nums mt-2">
            {metrics.totalRooms}
          </p>
          <p className="text-xs text-[#6E6C63] mt-1">In selected period</p>
        </div>

        <div className="bg-white border border-[#E2DFD5] rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6E6C63]">Today / Upcoming</span>
            <CalendarDays className="w-4 h-4 text-[#183D2D]" />
          </div>
          <p className="text-2xl font-semibold text-[#1C2420] font-mono tabular-nums mt-2">
            {metrics.todaysBookings} <span className="text-sm font-normal text-[#6E6C63]">today</span>{" "}
            · {metrics.upcomingBookings}{" "}
            <span className="text-sm font-normal text-[#6E6C63]">upcoming</span>
          </p>
          <p className="text-xs text-[#6E6C63] mt-1">Active non-cancelled schedule</p>
        </div>

      </div>

      {
    /* Booking Overview + Upcoming Schedule */
  }
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-[#E2DFD5] rounded-xl p-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#E2DFD5]">
            <div>
              <h3 className="text-base font-semibold text-[#1C2420]">
                Bookings by Category
              </h3>
              <p className="text-xs text-[#6E6C63] mt-0.5">
                Booking counts in the selected period
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
    { label: "Events", count: metrics.totalEvents, color: "#183D2D" },
    { label: "Photoshoots", count: metrics.totalShoots, color: "#B45309" },
    { label: "Rooms", count: metrics.totalRooms, color: "#1D4ED8" }
  ].map((row) => <div
    key={row.label}
    className="rounded-lg border border-[#E2DFD5] bg-[#F7F6F2] p-4"
  >
                <p className="text-xs font-medium text-[#6E6C63]">{row.label}</p>
                <p className="mt-2 text-2xl font-semibold font-mono tabular-nums" style={{ color: row.color }}>
                  {row.count}
                </p>
              </div>)}
          </div>
        </section>

        {
    /* Upcoming Booking Calendar Strip */
  }
        <section className="lg:col-span-5 bg-white border border-[#E2DFD5] rounded-xl p-6 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-[#E2DFD5]">
            <div>
              <h3 className="text-base font-semibold text-[#1C2420]">Upcoming Schedule</h3>
              <p className="text-xs text-[#6E6C63] mt-0.5">Next bookings from today forward</p>
            </div>
            <Link
    to="/calendar"
    className="text-xs font-medium text-[#183D2D] hover:underline inline-flex items-center gap-1"
  >
              Open Calendar <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {upcomingSchedule.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <CalendarDays className="w-8 h-8 text-[#CDC9BC] mb-2" />
              <p className="text-sm font-medium text-[#1C2420]">No upcoming bookings</p>
              <p className="text-xs text-[#6E6C63] mt-1">
                Create an event, photoshoot, or room reservation to see it here.
              </p>
            </div> : <div className="divide-y divide-[#E2DFD5] mt-2">
              {upcomingSchedule.map((u) => <button
    key={`${u.category}_${u.id}`}
    type="button"
    onClick={() => setSelectedBooking(u.item)}
    className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-[#F7F6F2] px-2 -mx-2 rounded-lg transition-colors"
  >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-[#6E6C63] font-mono">
                      <span>{formatColomboDate(u.date)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{u.time}</span>
                    </div>
                    <p className="text-sm font-medium text-[#1C2420] truncate mt-0.5">
                      {u.title}
                    </p>
                    <p className="text-xs text-[#6E6C63] truncate">{u.subtitle}</p>
                  </div>
                  <StatusBadge status={u.status} />
                </button>)}
            </div>}
        </section>
      </div>

      {
    /* Recent Booking Activities */
  }
      <section className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2DFD5] flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#1C2420]">
              Recent Booking Activities
            </h3>
            <p className="text-xs text-[#6E6C63] mt-0.5">
              Latest bookings recorded across all villa categories
            </p>
          </div>
          <Link
    to="/bookings"
    className="text-xs font-medium text-[#183D2D] hover:underline inline-flex items-center gap-1"
  >
            View All Bookings <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentBookings.length === 0 ? <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#1C2420]">No bookings recorded yet</p>
            <p className="text-xs text-[#6E6C63] mt-1 mb-4">
              Start by adding an Event, Photoshoot, or Room Reservation.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
    to="/events"
    className="px-4 py-2 text-xs font-medium text-white bg-[#183D2D] rounded-lg"
  >
                New Event
              </Link>
              <Link
    to="/shoots"
    className="px-4 py-2 text-xs font-medium text-[#1C2420] bg-[#F7F6F2] border border-[#E2DFD5] rounded-lg"
  >
                New Photoshoot
              </Link>
              <Link
    to="/rooms"
    className="px-4 py-2 text-xs font-medium text-[#1C2420] bg-[#F7F6F2] border border-[#E2DFD5] rounded-lg"
  >
                New Room Booking
              </Link>
            </div>
          </div> : <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F7F6F2] text-xs text-[#6E6C63] border-b border-[#E2DFD5]">
                <tr>
                  <th className="px-6 py-3 font-medium">Booking ID</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">Customer</th>
                  <th className="px-6 py-3 font-medium">Schedule Date</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD5]">
                {recentBookings.map(({ item }) => {
    const d = item.data;
    const scheduleDate = item.category === "EVENT" ? item.data.eventDate : item.category === "SHOOT" ? item.data.shootDate : item.data.checkInDate;
    return <tr
      key={`${item.category}_${d.id}`}
      className="hover:bg-[#F7F6F2]/70 transition-colors"
    >
                      <td className="px-6 py-3 font-mono text-xs font-medium text-[#183D2D]">
                        {d.bookingCode}
                      </td>
                      <td className="px-6 py-3 text-xs text-[#3D3F3A]">{item.category}</td>
                      <td className="px-6 py-3">
                        <p className="font-medium text-[#1C2420]">{d.customerName}</p>
                        <p className="text-xs text-[#6E6C63] font-mono">{d.customerPhone}</p>
                      </td>
                      <td className="px-6 py-3 text-xs font-mono">
                        {formatColomboDate(scheduleDate)}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
      type="button"
      onClick={() => setSelectedBooking(item)}
      className="text-xs font-medium text-[#183D2D] hover:underline"
    >
                          View
                        </button>
                      </td>
                    </tr>;
  })}
              </tbody>
            </table>
          </div>}
      </section>

      <BookingDetailModal
    booking={activeSelectedBooking}
    onClose={() => setSelectedBooking(null)}
  />
    </div>;
};
export {
  DashboardPage
};
