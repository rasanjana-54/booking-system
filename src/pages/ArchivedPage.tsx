import React, { useMemo, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useVillaData } from '../contexts/VillaDataContext';
import { useToast } from '../contexts/ToastContext';
import { BookingCategory, RoomType } from '../types/villa';
import { formatColomboDate, formatCurrency } from '../utils/colomboTime';
import {
  archiveOrRestoreRoomType,
  permanentlyDeleteBooking,
  restoreBooking,
} from '../services/villaService';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';

type ArchivedRow =
  | {
      kind: 'BOOKING';
      category: BookingCategory;
      id: string;
      code: string;
      title: string;
      customer: string;
      date: string;
      amount: number;
      status: string;
    }
  | {
      kind: 'ROOM_TYPE';
      id: string;
      code: string;
      title: string;
      roomType: RoomType;
    };

export const ArchivedPage: React.FC = () => {
  const { currentStaff, buildActorContext } = useAuth();
  const { events, shoots, roomBookings, roomTypes, currency, authorizedEmails, adminEmails } =
    useVillaData();
  const { notify } = useToast();

  const [deleteTarget, setDeleteTarget] = useState<ArchivedRow | null>(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = currentStaff?.role === 'ADMIN';

  const archivedItems = useMemo<ArchivedRow[]>(() => {
    const list: ArchivedRow[] = [
      ...events
        .filter((e) => e.isArchived)
        .map((e) => ({
          kind: 'BOOKING' as const,
          category: 'EVENT' as const,
          id: e.id,
          code: e.bookingCode,
          title: `${e.eventType} (${e.venueResource})`,
          customer: e.customerName,
          date: e.eventDate,
          amount: e.totalPayment,
          status: e.status,
        })),
      ...shoots
        .filter((s) => s.isArchived)
        .map((s) => ({
          kind: 'BOOKING' as const,
          category: 'SHOOT' as const,
          id: s.id,
          code: s.bookingCode,
          title: `${s.shootType} (${s.venueResource})`,
          customer: s.customerName,
          date: s.shootDate,
          amount: s.totalPayment,
          status: s.status,
        })),
      ...roomBookings
        .filter((r) => r.isArchived)
        .map((r) => ({
          kind: 'BOOKING' as const,
          category: 'ROOM' as const,
          id: r.id,
          code: r.bookingCode,
          title: r.roomTypeName,
          customer: r.customerName,
          date: r.checkInDate,
          amount: r.totalPayment,
          status: r.status,
        })),
      ...roomTypes
        .filter((rt) => rt.isArchived)
        .map((rt) => ({
          kind: 'ROOM_TYPE' as const,
          id: rt.id,
          code: rt.roomCode,
          title: rt.name,
          roomType: rt,
        })),
    ];
    return list;
  }, [events, shoots, roomBookings, roomTypes]);

  const handleRestore = async (row: ArchivedRow) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    try {
      if (row.kind === 'BOOKING') {
        await restoreBooking(actor, row.category, row.id, row.code);
      } else {
        await archiveOrRestoreRoomType(actor, row.roomType, false);
      }
      notify('Record restored', 'success', row.code);
    } catch (err) {
      notify('Restore failed', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget || deleteTarget.kind !== 'BOOKING') return;
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setBusy(true);
    try {
      await permanentlyDeleteBooking(
        actor,
        deleteTarget.category,
        deleteTarget.id,
        deleteTarget.code
      );
      notify('Record permanently deleted', 'success', deleteTarget.code);
      setDeleteTarget(null);
    } catch (err) {
      notify('Delete failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-2xl sm:text-3xl font-semibold text-[#1C2420]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Archived Records
        </h2>
        <p className="text-sm text-[#6E6C63] mt-0.5">
          Recoverable archive. Only administrators can restore or permanently delete archived
          records.
        </p>
      </div>

      <div className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden">
        {archivedItems.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-[#1C2420]">No archived records</p>
            <p className="text-xs text-[#6E6C63] mt-1">
              Archived bookings and room types will appear here safely.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F7F6F2] text-xs text-[#6E6C63] border-b border-[#E2DFD5]">
                <tr>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Type &amp; Details</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  {isAdmin && <th className="px-5 py-3 font-medium text-right">Admin Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD5]">
                {archivedItems.map((row) => (
                  <tr key={`${row.kind}_${row.id}`} className="hover:bg-[#F7F6F2]/70">
                    <td className="px-5 py-3 font-mono text-xs font-medium text-[#183D2D]">
                      {row.code}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-xs font-semibold text-[#1C2420]">
                        {row.kind === 'BOOKING' ? row.category : 'ROOM TYPE'}
                      </p>
                      <p className="text-xs text-[#6E6C63]">{row.title}</p>
                    </td>
                    <td className="px-5 py-3 text-sm">
                      {row.kind === 'BOOKING' ? row.customer : '—'}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono">
                      {row.kind === 'BOOKING' ? formatColomboDate(row.date) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-xs">
                      {row.kind === 'BOOKING' ? formatCurrency(row.amount, currency) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      {row.kind === 'BOOKING' ? (
                        <StatusBadge status={row.status} />
                      ) : (
                        <StatusBadge status={row.roomType.status} />
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRestore(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#183D2D] bg-[#EEF3F0] hover:bg-[#dce7df] rounded-lg"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Restore
                          </button>
                          {row.kind === 'BOOKING' && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(row)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Permanently Delete Record"
        message={`Permanently delete ${deleteTarget?.code}? This action cannot be undone.`}
        confirmLabel="Delete Permanently"
        danger
        loading={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handlePermanentDelete}
      />
    </div>
  );
};
