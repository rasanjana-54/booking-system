import { useMemo, useState } from "react";
import {
  Archive,
  BedDouble,
  CheckCircle2,
  Edit3,
  Eye,
  Plus,
  Search,
  Users
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useVillaData } from "../contexts/VillaDataContext";
import { useToast } from "../contexts/ToastContext";
import {
  addDaysToDateStr,
  findRoomBookingConflict,
  formatColomboDate,
  getColomboDateStr
} from "../utils/colomboTime";
import { archiveBooking, archiveOrRestoreRoomType } from "../services/villaService";
import { StatusBadge } from "../components/StatusBadge";
import { RoomTypeFormModal } from "../components/RoomTypeFormModal";
import { RoomBookingFormModal } from "../components/RoomBookingFormModal";
import { BookingDetailModal } from "../components/BookingDetailModal";
import { ConfirmModal } from "../components/ConfirmModal";
const RoomsPage = () => {
  const { currentStaff, buildActorContext } = useAuth();
  const { roomTypes, roomBookings, blockedSchedules, authorizedEmails, adminEmails } = useVillaData();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState("bookings");
  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [availCheckIn, setAvailCheckIn] = useState(getColomboDateStr());
  const [availCheckOut, setAvailCheckOut] = useState(
    addDaysToDateStr(getColomboDateStr(), 1)
  );
  const [roomTypeModalOpen, setRoomTypeModalOpen] = useState(false);
  const [editingRoomType, setEditingRoomType] = useState(null);
  const [archiveRoomTypeTarget, setArchiveRoomTypeTarget] = useState(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [defaultRoomId, setDefaultRoomId] = useState(void 0);
  const [detailBooking, setDetailBooking] = useState(null);
  const [archiveBookingTarget, setArchiveBookingTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = currentStaff?.role === "ADMIN";
  const activeRoomTypes = useMemo(
    () => roomTypes.filter((r) => !r.isArchived),
    [roomTypes]
  );
  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roomBookings.filter((b) => {
      if (b.isArchived) return false;
      if (roomFilter !== "ALL" && b.roomTypeId !== roomFilter) return false;
      if (statusFilter !== "ALL" && b.status !== statusFilter) return false;
      if (q) {
        const hay = `${b.bookingCode} ${b.customerName} ${b.customerPhone} ${b.roomTypeName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [roomBookings, search, roomFilter, statusFilter]);
  const handleArchiveBooking = async () => {
    if (!archiveBookingTarget) return;
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setBusy(true);
    try {
      await archiveBooking(actor, "ROOM", archiveBookingTarget.id, archiveBookingTarget.bookingCode);
      notify("Room booking archived", "success", archiveBookingTarget.bookingCode);
      setArchiveBookingTarget(null);
    } catch (err) {
      notify("Archive failed", "error", err instanceof Error ? err.message : void 0);
    } finally {
      setBusy(false);
    }
  };
  const handleArchiveRoomType = async () => {
    if (!archiveRoomTypeTarget) return;
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setBusy(true);
    try {
      await archiveOrRestoreRoomType(actor, archiveRoomTypeTarget, true);
      notify("Room type archived", "success", archiveRoomTypeTarget.name);
      setArchiveRoomTypeTarget(null);
    } catch (err) {
      notify("Archive failed", "error", err instanceof Error ? err.message : void 0);
    } finally {
      setBusy(false);
    }
  };
  const activeDetailBooking = useMemo(
    () => (detailBooking ? roomBookings.find((b) => b.id === detailBooking.id) || detailBooking : null),
    [detailBooking, roomBookings]
  );
  return <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2
    className="text-2xl sm:text-3xl font-semibold text-[#1C2420]"
    style={{ fontFamily: "var(--font-display)" }}
  >
            Rooms &amp; Suite Reservations
          </h2>
          <p className="text-sm text-[#6E6C63] mt-0.5">
            Manage suite inventory, live availability, food status, and guest reservations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex p-1 bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg">
            <button
    type="button"
    onClick={() => setActiveTab("bookings")}
    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === "bookings" ? "bg-white text-[#1C2420] shadow-xs" : "text-[#6E6C63] hover:text-[#1C2420]"}`}
  >
              Room Bookings ({filteredBookings.length})
            </button>
            <button
    type="button"
    onClick={() => setActiveTab("types")}
    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === "types" ? "bg-white text-[#1C2420] shadow-xs" : "text-[#6E6C63] hover:text-[#1C2420]"}`}
  >
              Room Types ({activeRoomTypes.length})
            </button>
          </div>

          {activeTab === "bookings" ? <button
    type="button"
    onClick={() => {
      setEditingBooking(null);
      setDefaultRoomId(void 0);
      setBookingModalOpen(true);
    }}
    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors whitespace-nowrap shrink-0"
  >
              <Plus className="w-4 h-4" />
              <span>New Room Booking</span>
            </button> : <button
    type="button"
    onClick={() => {
      setEditingRoomType(null);
      setRoomTypeModalOpen(true);
    }}
    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors whitespace-nowrap shrink-0"
  >
              <Plus className="w-4 h-4" />
              <span>Add Room Type</span>
            </button>}
        </div>
      </div>

      {
    /* Availability Quick-Check Bar */
  }
      <div className="bg-white border border-[#E2DFD5] rounded-xl p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#1C2420]">Room Availability Check</p>
            <p className="text-xs text-[#6E6C63]">
              Check which suites are open between check-in (14:00) and check-out (11:00).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
    type="date"
    value={availCheckIn}
    onChange={(e) => setAvailCheckIn(e.target.value)}
    className="rounded-lg border border-[#CDC9BC] px-2.5 py-1.5 font-mono"
  />
            <span className="text-[#6E6C63]">to</span>
            <input
    type="date"
    value={availCheckOut}
    onChange={(e) => setAvailCheckOut(e.target.value)}
    className="rounded-lg border border-[#CDC9BC] px-2.5 py-1.5 font-mono"
  />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#E2DFD5]">
          {activeRoomTypes.map((rt) => {
    const conflict = rt.status !== "Available" ? `Status: ${rt.status}` : findRoomBookingConflict({
      roomTypeId: rt.id,
      checkInDate: availCheckIn,
      checkInTime: "14:00",
      checkOutDate: availCheckOut,
      checkOutTime: "11:00",
      roomBookings,
      blocks: blockedSchedules
    });
    const available = !conflict;
    return <div
      key={rt.id}
      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#F7F6F2] border border-[#E2DFD5]"
    >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#1C2420] truncate">
                    {rt.roomCode} · {rt.name}
                  </p>
                  <p
      className={`text-[11px] mt-0.5 truncate ${available ? "text-[#15803D]" : "text-[#B91C1C]"}`}
    >
                    {available ? "Available for dates" : "Unavailable / Reserved"}
                  </p>
                </div>
                {available ? <button
      type="button"
      onClick={() => {
        setEditingBooking(null);
        setDefaultRoomId(rt.id);
        setBookingModalOpen(true);
      }}
      className="px-2.5 py-1 text-xs font-medium text-white bg-[#183D2D] rounded-md whitespace-nowrap shrink-0"
    >
                    Reserve
                  </button> : <CheckCircle2 className="w-4 h-4 text-[#CDC9BC] shrink-0" />}
              </div>;
  })}
        </div>
      </div>

      {activeTab === "types" ? (
    /* TAB A: ROOM TYPE MANAGEMENT */
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeRoomTypes.map((rt) => <article
      key={rt.id}
      className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden flex flex-col"
    >
              <div className="aspect-[4/3] bg-[#EFEDE6] relative overflow-hidden">
                {rt.imageUrl ? <img
      src={rt.imageUrl}
      alt={rt.name}
      referrerPolicy="no-referrer"
      className="w-full h-full object-cover"
    /> : <div className="w-full h-full flex flex-col items-center justify-center text-[#6E6C63]">
                    <BedDouble className="w-8 h-8 mb-1 opacity-50" />
                    <span className="text-xs">{rt.name}</span>
                  </div>}
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono text-[#6E6C63]">{rt.roomCode}</span>
                    <StatusBadge status={rt.status} />
                  </div>
                  <h3 className="text-lg font-semibold text-[#1C2420]">{rt.name}</h3>
                  <p className="text-xs text-[#6E6C63] mt-1.5 leading-relaxed">
                    {rt.description}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between py-3 border-t border-[#E2DFD5] text-xs">
                    <span className="inline-flex items-center gap-1.5 text-[#6E6C63]">
                      <Users className="w-3.5 h-3.5" /> Max {rt.maxCapacity} Guests
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
      type="button"
      onClick={() => {
        setEditingRoomType(rt);
        setRoomTypeModalOpen(true);
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#3D3F3A] bg-[#F7F6F2] hover:bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg"
    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    {isAdmin && <button
      type="button"
      onClick={() => setArchiveRoomTypeTarget(rt)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-lg"
    >
                        <Archive className="w-3.5 h-3.5" /> Archive
                      </button>}
                  </div>
                </div>
              </div>
            </article>)}
        </div>
  ) : (
    /* TAB B: ROOM BOOKINGS MANAGEMENT */
    <div className="space-y-4">
          <div className="bg-white border border-[#E2DFD5] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#6E6C63] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
      type="text"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search guest, phone, ID..."
      className="w-full rounded-lg border border-[#CDC9BC] pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
    />
            </div>

            <select
      value={roomFilter}
      onChange={(e) => setRoomFilter(e.target.value)}
      className="rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
    >
              <option value="ALL">All Room Types</option>
              {activeRoomTypes.map((r) => <option key={r.id} value={r.id}>
                  {r.name}
                </option>)}
            </select>

            <select
      value={statusFilter}
      onChange={(e) => setStatusFilter(e.target.value)}
      className="rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
    >
              <option value="ALL">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Checked-in">Checked-in</option>
              <option value="Checked-out">Checked-out</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden">
            {filteredBookings.length === 0 ? <div className="p-12 text-center">
                <p className="text-sm font-medium text-[#1C2420]">No room reservations found</p>
                <p className="text-xs text-[#6E6C63] mt-1 mb-4">
                  Create a new suite reservation to track check-in and meals.
                </p>
                <button
      type="button"
      onClick={() => {
        setEditingBooking(null);
        setDefaultRoomId(void 0);
        setBookingModalOpen(true);
      }}
      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#183D2D] rounded-lg"
    >
                  <Plus className="w-3.5 h-3.5" /> New Room Booking
                </button>
              </div> : <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F7F6F2] text-xs text-[#6E6C63] border-b border-[#E2DFD5]">
                    <tr>
                      <th className="px-5 py-3 font-medium">Booking ID</th>
                      <th className="px-5 py-3 font-medium">Suite &amp; Meals</th>
                      <th className="px-5 py-3 font-medium">Guest</th>
                      <th className="px-5 py-3 font-medium">Check-in / Check-out</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2DFD5]">
                    {filteredBookings.map((rb) => {
      const lockedForStaff = !isAdmin && (rb.status === "Checked-out" || rb.status === "Cancelled");
      return <tr key={rb.id} className="hover:bg-[#F7F6F2]/70">
                          <td className="px-5 py-3 font-mono text-xs font-medium text-[#183D2D]">
                            {rb.bookingCode}
                          </td>
                          <td className="px-5 py-3">
                            <p className="font-medium text-[#1C2420]">{rb.roomTypeName}</p>
                            <p className="text-xs text-[#6E6C63]">Food: {rb.foodStatus}</p>
                          </td>
                          <td className="px-5 py-3">
                            <p className="font-medium text-[#1C2420]">{rb.customerName}</p>
                            <p className="text-xs text-[#6E6C63] font-mono">{rb.customerPhone}</p>
                          </td>
                          <td className="px-5 py-3 text-xs font-mono">
                            <p>
                              In: {formatColomboDate(rb.checkInDate)} ({rb.checkInTime})
                            </p>
                            <p className="text-[#6E6C63]">
                              Out: {formatColomboDate(rb.checkOutDate)} ({rb.checkOutTime})
                            </p>
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={rb.status} />
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
        type="button"
        onClick={() => setDetailBooking(rb)}
        className="p-1.5 rounded-lg text-[#3D3F3A] hover:bg-[#EFEDE6]"
        title="View Details"
      >
                                <Eye className="w-4 h-4" />
                              </button>
                              {!lockedForStaff && <button
        type="button"
        onClick={() => {
          setEditingBooking(rb);
          setBookingModalOpen(true);
        }}
        className="p-1.5 rounded-lg text-[#3D3F3A] hover:bg-[#EFEDE6]"
        title="Edit Booking"
      >
                                  <Edit3 className="w-4 h-4" />
                                </button>}
                              {!lockedForStaff && <button
        type="button"
        onClick={() => setArchiveBookingTarget(rb)}
        className="p-1.5 rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"
        title="Archive Booking"
      >
                                  <Archive className="w-4 h-4" />
                                </button>}
                            </div>
                          </td>
                        </tr>;
    })}
                  </tbody>
                </table>
              </div>}
          </div>
        </div>
  )}

      <RoomTypeFormModal
    open={roomTypeModalOpen}
    editingRoomType={editingRoomType}
    onClose={() => {
      setRoomTypeModalOpen(false);
      setEditingRoomType(null);
    }}
  />

      <RoomBookingFormModal
    open={bookingModalOpen}
    editingBooking={editingBooking}
    defaultRoomTypeId={defaultRoomId}
    onClose={() => {
      setBookingModalOpen(false);
      setEditingBooking(null);
      setDefaultRoomId(void 0);
    }}
  />

      <BookingDetailModal
    booking={activeDetailBooking ? { category: "ROOM", data: activeDetailBooking } : null}
    onClose={() => setDetailBooking(null)}
    onEdit={activeDetailBooking && (isAdmin || activeDetailBooking.status !== "Checked-out" && activeDetailBooking.status !== "Cancelled") ? () => {
      setEditingBooking(activeDetailBooking);
      setDetailBooking(null);
      setBookingModalOpen(true);
    } : void 0}
    onArchive={activeDetailBooking && (isAdmin || activeDetailBooking.status !== "Checked-out" && activeDetailBooking.status !== "Cancelled") ? () => {
      setArchiveBookingTarget(activeDetailBooking);
      setDetailBooking(null);
    } : void 0}
  />

      <ConfirmModal
    open={Boolean(archiveBookingTarget)}
    title="Archive Room Booking"
    message={`Archive ${archiveBookingTarget?.bookingCode} (${archiveBookingTarget?.customerName})?`}
    confirmLabel="Archive Booking"
    danger
    loading={busy}
    onCancel={() => setArchiveBookingTarget(null)}
    onConfirm={handleArchiveBooking}
  />

      <ConfirmModal
    open={Boolean(archiveRoomTypeTarget)}
    title="Archive Room Type"
    message={`Archive suite "${archiveRoomTypeTarget?.name}"? Existing bookings remain intact.`}
    confirmLabel="Archive Suite"
    danger
    loading={busy}
    onCancel={() => setArchiveRoomTypeTarget(null)}
    onConfirm={handleArchiveRoomType}
  />
    </div>;
};
export {
  RoomsPage
};
