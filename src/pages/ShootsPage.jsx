import { useMemo, useState } from "react";
import { Archive, Edit3, Eye, Plus, Search } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useVillaData } from "../contexts/VillaDataContext";
import { useToast } from "../contexts/ToastContext";
import { formatColomboDate } from "../utils/colomboTime";
import { archiveBooking } from "../services/villaService";
import { StatusBadge } from "../components/StatusBadge";
import { ShootFormModal } from "../components/ShootFormModal";
import { BookingDetailModal } from "../components/BookingDetailModal";
import { ConfirmModal } from "../components/ConfirmModal";
const ShootsPage = () => {
  const { currentStaff, buildActorContext } = useAuth();
  const { shoots, authorizedEmails, adminEmails } = useVillaData();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingShoot, setEditingShoot] = useState(null);
  const [detailShoot, setDetailShoot] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const isAdmin = currentStaff?.role === "ADMIN";
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shoots.filter((s) => {
      if (s.isArchived) return false;
      if (typeFilter !== "ALL" && s.shootType !== typeFilter) return false;
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (dateFilter && s.shootDate !== dateFilter) return false;
      if (q) {
        const hay = `${s.bookingCode} ${s.customerName} ${s.customerPhone} ${s.shootType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [shoots, search, typeFilter, statusFilter, dateFilter]);
  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setArchiving(true);
    try {
      await archiveBooking(actor, "SHOOT", archiveTarget.id, archiveTarget.bookingCode);
      notify("Shoot booking archived", "success", archiveTarget.bookingCode);
      setArchiveTarget(null);
    } catch (err) {
      notify("Archive failed", "error", err instanceof Error ? err.message : void 0);
    } finally {
      setArchiving(false);
    }
  };
  const activeDetailShoot = useMemo(
    () => (detailShoot ? shoots.find((s) => s.id === detailShoot.id) || detailShoot : null),
    [detailShoot, shoots]
  );
  return <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2
    className="text-2xl sm:text-3xl font-semibold text-[#1C2420]"
    style={{ fontFamily: "var(--font-display)" }}
  >
            Photoshoot &amp; Video Shoot Bookings
          </h2>
          <p className="text-sm text-[#6E6C63] mt-0.5">
            Editorial, bridal, fashion, and commercial shoots across villa grounds.
          </p>
        </div>

        <button
    type="button"
    onClick={() => {
      setEditingShoot(null);
      setFormOpen(true);
    }}
    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
  >
          <Plus className="w-4 h-4" />
          <span>New Shoot Booking</span>
        </button>
      </div>

      {
    /* Filters */
  }
      <div className="bg-white border border-[#E2DFD5] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#6E6C63] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
    type="text"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Search client, phone, ID..."
    className="w-full rounded-lg border border-[#CDC9BC] pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  />
        </div>

        <select
    value={typeFilter}
    onChange={(e) => setTypeFilter(e.target.value)}
    className="rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  >
          <option value="ALL">All Shoot Types</option>
          <option value="Photography">Photography</option>
          <option value="Videography">Videography</option>
          <option value="Wedding Shoot">Wedding Shoot</option>
          <option value="Fashion Shoot">Fashion Shoot</option>
          <option value="Commercial Shoot">Commercial Shoot</option>
          <option value="Other">Other</option>
        </select>

        <select
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
    className="rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  >
          <option value="ALL">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <div className="flex items-center gap-2">
          <input
    type="date"
    value={dateFilter}
    onChange={(e) => setDateFilter(e.target.value)}
    className="flex-1 rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
  />
          {dateFilter && <button
    type="button"
    onClick={() => setDateFilter("")}
    className="text-xs text-[#183D2D] hover:underline"
  >
              Clear
            </button>}
        </div>
      </div>

      {
    /* Table */
  }
      <div className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden">
        {filtered.length === 0 ? <div className="p-12 text-center">
            <p className="text-sm font-medium text-[#1C2420]">No photoshoot bookings found</p>
            <p className="text-xs text-[#6E6C63] mt-1 mb-4">
              Create a photoshoot or commercial video booking to reserve villa locations.
            </p>
            <button
    type="button"
    onClick={() => {
      setEditingShoot(null);
      setFormOpen(true);
    }}
    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#183D2D] rounded-lg"
  >
              <Plus className="w-3.5 h-3.5" /> Add First Shoot
            </button>
          </div> : <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F7F6F2] text-xs text-[#6E6C63] border-b border-[#E2DFD5]">
                <tr>
                  <th className="px-5 py-3 font-medium">Shoot ID</th>
                  <th className="px-5 py-3 font-medium">Type &amp; Venue</th>
                  <th className="px-5 py-3 font-medium">Date &amp; Time</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD5]">
                {filtered.map((sht) => {
    const lockedForStaff = !isAdmin && (sht.status === "Completed" || sht.status === "Cancelled");
    return <tr key={sht.id} className="hover:bg-[#F7F6F2]/70">
                      <td className="px-5 py-3 font-mono text-xs font-medium text-[#183D2D]">
                        {sht.bookingCode}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-[#1C2420]">{sht.shootType}</p>
                        <p className="text-xs text-[#6E6C63]">{sht.venueResource}</p>
                      </td>
                      <td className="px-5 py-3 text-xs font-mono">
                        <p>{formatColomboDate(sht.shootDate)}</p>
                        <p className="text-[#6E6C63]">
                          {sht.startTime} – {sht.endTime}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-[#1C2420]">{sht.customerName}</p>
                        <p className="text-xs text-[#6E6C63] font-mono">{sht.customerPhone}</p>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={sht.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
      type="button"
      onClick={() => setDetailShoot(sht)}
      className="p-1.5 rounded-lg text-[#3D3F3A] hover:bg-[#EFEDE6]"
      title="View Details"
    >
                            <Eye className="w-4 h-4" />
                          </button>
                          {!lockedForStaff && <button
      type="button"
      onClick={() => {
        setEditingShoot(sht);
        setFormOpen(true);
      }}
      className="p-1.5 rounded-lg text-[#3D3F3A] hover:bg-[#EFEDE6]"
      title="Edit Shoot"
    >
                              <Edit3 className="w-4 h-4" />
                            </button>}
                          {!lockedForStaff && <button
      type="button"
      onClick={() => setArchiveTarget(sht)}
      className="p-1.5 rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"
      title="Archive Shoot"
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

      <ShootFormModal
    open={formOpen}
    editingShoot={editingShoot}
    onClose={() => {
      setFormOpen(false);
      setEditingShoot(null);
    }}
  />

      <BookingDetailModal
    booking={activeDetailShoot ? { category: "SHOOT", data: activeDetailShoot } : null}
    onClose={() => setDetailShoot(null)}
    onEdit={activeDetailShoot && (isAdmin || activeDetailShoot.status !== "Completed" && activeDetailShoot.status !== "Cancelled") ? () => {
      setEditingShoot(activeDetailShoot);
      setDetailShoot(null);
      setFormOpen(true);
    } : void 0}
    onArchive={activeDetailShoot && (isAdmin || activeDetailShoot.status !== "Completed" && activeDetailShoot.status !== "Cancelled") ? () => {
      setArchiveTarget(activeDetailShoot);
      setDetailShoot(null);
    } : void 0}
  />

      <ConfirmModal
    open={Boolean(archiveTarget)}
    title="Archive Shoot Booking"
    message={`Archive ${archiveTarget?.bookingCode} (${archiveTarget?.customerName})?`}
    confirmLabel="Archive Booking"
    danger
    loading={archiving}
    onCancel={() => setArchiveTarget(null)}
    onConfirm={handleConfirmArchive}
  />
    </div>;
};
export {
  ShootsPage
};
