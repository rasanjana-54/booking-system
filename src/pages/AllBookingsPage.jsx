import { useMemo, useState } from "react";
import { ArrowUpDown, Eye, Search } from "lucide-react";
import { useVillaData } from "../contexts/VillaDataContext";
import { formatColomboDate } from "../utils/colomboTime";
import { StatusBadge } from "../components/StatusBadge";
import { BookingDetailModal } from "../components/BookingDetailModal";
const AllBookingsPage = () => {
  const { events, shoots, roomBookings, roomTypes } = useVillaData();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roomTypeFilter, setRoomTypeFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailBooking, setDetailBooking] = useState(null);
  const combined = useMemo(() => {
    const list = [
      ...events.filter((e) => !e.isArchived).map((e) => ({
        item: { category: "EVENT", data: e },
        primaryDate: e.eventDate,
        subtitle: `${e.eventType} \xB7 ${e.venueResource} (${e.startTime}\u2013${e.endTime})`
      })),
      ...shoots.filter((s) => !s.isArchived).map((s) => ({
        item: { category: "SHOOT", data: s },
        primaryDate: s.shootDate,
        subtitle: `${s.shootType} \xB7 ${s.venueResource} (${s.startTime}\u2013${s.endTime})`
      })),
      ...roomBookings.filter((r) => !r.isArchived).map((r) => ({
        item: { category: "ROOM", data: r },
        primaryDate: r.checkInDate,
        subtitle: `${r.roomTypeName} (${r.checkInDate} \u2192 ${r.checkOutDate})`,
        roomTypeId: r.roomTypeId
      }))
    ];
    const q = searchTerm.trim().toLowerCase();
    const filtered = list.filter((entry) => {
      const d = entry.item.data;
      if (categoryFilter !== "ALL" && entry.item.category !== categoryFilter) return false;
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (roomTypeFilter !== "ALL" && entry.roomTypeId !== roomTypeFilter) return false;
      if (dateFrom && entry.primaryDate < dateFrom) return false;
      if (dateTo && entry.primaryDate > dateTo) return false;
      if (q) {
        const hay = `${d.bookingCode} ${d.customerName} ${d.customerPhone} ${entry.subtitle}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = a.primaryDate.localeCompare(b.primaryDate);
      } else {
        cmp = a.item.data.customerName.localeCompare(b.item.data.customerName);
      }
      return sortAsc ? cmp : -cmp;
    });
    return filtered;
  }, [
    events,
    shoots,
    roomBookings,
    searchTerm,
    categoryFilter,
    statusFilter,
    roomTypeFilter,
    dateFrom,
    dateTo,
    sortField,
    sortAsc
  ]);
  const totalPages = Math.max(1, Math.ceil(combined.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = combined.slice((safePage - 1) * pageSize, safePage * pageSize);
  const toggleSort = (field) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };
  const activeDetailBooking = useMemo(() => {
    if (!detailBooking) return null;
    const list = detailBooking.category === "EVENT" ? events : detailBooking.category === "SHOOT" ? shoots : roomBookings;
    const latest = list.find((item) => item.id === detailBooking.data.id);
    return latest ? { category: detailBooking.category, data: latest } : detailBooking;
  }, [detailBooking, events, shoots, roomBookings]);
  return <div className="space-y-6">
      <div>
        <h2
    className="text-2xl sm:text-3xl font-semibold text-[#1C2420]"
    style={{ fontFamily: "var(--font-display)" }}
  >
          All Villa Bookings
        </h2>
        <p className="text-sm text-[#6E6C63] mt-0.5">
          Unified search, filtering, and sorting across Events, Photoshoots, and Room Reservations.
        </p>
      </div>

      {
    /* Filter Panel */
  }
      <div className="bg-white border border-[#E2DFD5] rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 text-[#6E6C63] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
    type="text"
    value={searchTerm}
    onChange={(e) => {
      setSearchTerm(e.target.value);
      setPage(1);
    }}
    placeholder="Search customer, phone, or booking ID..."
    className="w-full rounded-lg border border-[#CDC9BC] pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  />
          </div>

          <div className="md:col-span-2">
            <select
    value={categoryFilter}
    onChange={(e) => {
      setCategoryFilter(e.target.value);
      setPage(1);
    }}
    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  >
              <option value="ALL">All Categories</option>
              <option value="EVENT">Events</option>
              <option value="SHOOT">Photoshoots</option>
              <option value="ROOM">Rooms</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
    value={statusFilter}
    onChange={(e) => {
      setStatusFilter(e.target.value);
      setPage(1);
    }}
    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  >
              <option value="ALL">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Checked-in">Checked-in</option>
              <option value="Checked-out">Checked-out</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
    value={roomTypeFilter}
    onChange={(e) => {
      setRoomTypeFilter(e.target.value);
      setPage(1);
    }}
    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  >
              <option value="ALL">All Room Types</option>
              {roomTypes.map((r) => <option key={r.id} value={r.id}>
                  {r.name}
                </option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E2DFD5]">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#6E6C63]">Date range:</span>
            <input
    type="date"
    value={dateFrom}
    onChange={(e) => {
      setDateFrom(e.target.value);
      setPage(1);
    }}
    className="rounded-lg border border-[#CDC9BC] px-2.5 py-1.5 font-mono text-xs"
  />
            <span className="text-[#6E6C63]">to</span>
            <input
    type="date"
    value={dateTo}
    onChange={(e) => {
      setDateTo(e.target.value);
      setPage(1);
    }}
    className="rounded-lg border border-[#CDC9BC] px-2.5 py-1.5 font-mono text-xs"
  />
            {(searchTerm || categoryFilter !== "ALL" || statusFilter !== "ALL" || roomTypeFilter !== "ALL" || dateFrom || dateTo) && <button
    type="button"
    onClick={() => {
      setSearchTerm("");
      setCategoryFilter("ALL");
      setStatusFilter("ALL");
      setRoomTypeFilter("ALL");
      setDateFrom("");
      setDateTo("");
      setPage(1);
    }}
    className="text-xs font-medium text-[#183D2D] hover:underline ml-2"
  >
                Reset Filters
              </button>}
          </div>

          <span className="text-xs text-[#6E6C63] font-mono tabular-nums">
            Showing {combined.length} matching records
          </span>
        </div>
      </div>

      {
    /* Results Table */
  }
      <div className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden">
        {paginated.length === 0 ? <div className="p-12 text-center">
            <p className="text-sm font-medium text-[#1C2420]">No bookings match your criteria</p>
            <p className="text-xs text-[#6E6C63] mt-1">
              Try adjusting your search query or clearing active filters.
            </p>
          </div> : <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F7F6F2] text-xs text-[#6E6C63] border-b border-[#E2DFD5]">
                <tr>
                  <th className="px-5 py-3 font-medium">Booking ID</th>
                  <th className="px-5 py-3 font-medium">Category &amp; Details</th>
                  <th className="px-5 py-3 font-medium">
                    <button
    type="button"
    onClick={() => toggleSort("customer")}
    className="inline-flex items-center gap-1 hover:text-[#1C2420]"
  >
                      Customer <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 font-medium">
                    <button
    type="button"
    onClick={() => toggleSort("date")}
    className="inline-flex items-center gap-1 hover:text-[#1C2420]"
  >
                      Date <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD5]">
                {paginated.map(({ item, primaryDate, subtitle }) => {
    const d = item.data;
    return <tr key={`${item.category}_${d.id}`} className="hover:bg-[#F7F6F2]/70">
                      <td className="px-5 py-3 font-mono text-xs font-medium text-[#183D2D]">
                        {d.bookingCode}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-xs font-semibold text-[#1C2420]">{item.category}</p>
                        <p className="text-xs text-[#6E6C63]">{subtitle}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-[#1C2420]">{d.customerName}</p>
                        <p className="text-xs text-[#6E6C63] font-mono">{d.customerPhone}</p>
                      </td>
                      <td className="px-5 py-3 text-xs font-mono">
                        {formatColomboDate(primaryDate)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
      type="button"
      onClick={() => setDetailBooking(item)}
      className="p-1.5 rounded-lg text-[#3D3F3A] hover:bg-[#EFEDE6]"
      title="View Details"
    >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>;
  })}
              </tbody>
            </table>
          </div>}

        {
    /* Pagination Controls */
  }
        <div className="px-5 py-3 bg-[#F7F6F2] border-t border-[#E2DFD5] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#6E6C63]">
            <span>Rows per page:</span>
            <select
    value={pageSize}
    onChange={(e) => {
      setPageSize(Number(e.target.value));
      setPage(1);
    }}
    className="rounded border border-[#CDC9BC] bg-white px-2 py-1 text-xs"
  >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
    type="button"
    disabled={safePage <= 1}
    onClick={() => setPage((p) => Math.max(1, p - 1))}
    className="px-3 py-1 rounded border border-[#CDC9BC] bg-white disabled:opacity-40"
  >
              Previous
            </button>
            <span className="font-mono tabular-nums text-[#3D3F3A]">
              Page {safePage} / {totalPages}
            </span>
            <button
    type="button"
    disabled={safePage >= totalPages}
    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
    className="px-3 py-1 rounded border border-[#CDC9BC] bg-white disabled:opacity-40"
  >
              Next
            </button>
          </div>
        </div>
      </div>

      <BookingDetailModal
    booking={activeDetailBooking}
    onClose={() => setDetailBooking(null)}
  />
    </div>;
};
export {
  AllBookingsPage
};
