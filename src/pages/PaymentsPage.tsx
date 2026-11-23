import React, { useMemo, useState } from 'react';
import { Ban, Plus, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useVillaData } from '../contexts/VillaDataContext';
import { useToast } from '../contexts/ToastContext';
import { BookingCategory, Payment } from '../types/villa';
import { formatColomboDate, formatCurrency } from '../utils/colomboTime';
import { voidPaymentWithAudit } from '../services/villaService';
import { StatusBadge } from '../components/StatusBadge';
import { PaymentModal } from '../components/PaymentModal';
import { ConfirmModal } from '../components/ConfirmModal';

export const PaymentsPage: React.FC = () => {
  const { currentStaff, buildActorContext } = useAuth();
  const {
    payments,
    events,
    shoots,
    roomBookings,
    currency,
    authorizedEmails,
    adminEmails,
  } = useVillaData();
  const { notify } = useToast();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | BookingCategory>('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [showVoided, setShowVoided] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedBookingForPay, setSelectedBookingForPay] = useState<{
    id: string;
    bookingCode: string;
    bookingType: BookingCategory;
    customerName: string;
    totalPayment: number;
    advancePayment: number;
    duePayment: number;
  } | null>(null);

  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  const [voiding, setVoiding] = useState(false);

  const isAdmin = currentStaff?.role === 'ADMIN';

  const allPayableBookings = useMemo(() => {
    const list: {
      id: string;
      bookingCode: string;
      bookingType: BookingCategory;
      customerName: string;
      totalPayment: number;
      advancePayment: number;
      duePayment: number;
      status: string;
    }[] = [
      ...events
        .filter((e) => !e.isArchived && e.status !== 'Cancelled')
        .map((e) => ({
          id: e.id,
          bookingCode: e.bookingCode,
          bookingType: 'EVENT' as const,
          customerName: e.customerName,
          totalPayment: e.totalPayment,
          advancePayment: e.advancePayment,
          duePayment: e.duePayment,
          status: e.status,
        })),
      ...shoots
        .filter((s) => !s.isArchived && s.status !== 'Cancelled')
        .map((s) => ({
          id: s.id,
          bookingCode: s.bookingCode,
          bookingType: 'SHOOT' as const,
          customerName: s.customerName,
          totalPayment: s.totalPayment,
          advancePayment: s.advancePayment,
          duePayment: s.duePayment,
          status: s.status,
        })),
      ...roomBookings
        .filter((r) => !r.isArchived && r.status !== 'Cancelled')
        .map((r) => ({
          id: r.id,
          bookingCode: r.bookingCode,
          bookingType: 'ROOM' as const,
          customerName: r.customerName,
          totalPayment: r.totalPayment,
          advancePayment: r.advancePayment,
          duePayment: r.duePayment,
          status: r.status,
        })),
    ];
    return list;
  }, [events, shoots, roomBookings]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (!showVoided && p.isVoided) return false;
      if (typeFilter !== 'ALL' && p.bookingType !== typeFilter) return false;
      if (methodFilter !== 'ALL' && p.paymentMethod !== methodFilter) return false;
      if (q) {
        const hay = `${p.paymentCode} ${p.bookingCode} ${p.customerName} ${p.referenceNumber || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [payments, showVoided, typeFilter, methodFilter, search]);

  const totals = useMemo(() => {
    const valid = payments.filter((p) => !p.isVoided);
    const totalCollected = valid.reduce((s, p) => s + Number(p.amount), 0);
    const totalDue = allPayableBookings.reduce((s, b) => s + b.duePayment, 0);
    return {
      totalCollected,
      totalDue,
      count: valid.length,
    };
  }, [payments, allPayableBookings]);

  const handleConfirmVoid = async (reason?: string) => {
    if (!voidTarget || !reason) return;
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setVoiding(true);
    try {
      const siblingPayments = payments.filter((p) => p.bookingId === voidTarget.bookingId);
      await voidPaymentWithAudit(actor, voidTarget, reason, siblingPayments);
      notify('Payment voided with audit log', 'success', voidTarget.paymentCode);
      setVoidTarget(null);
    } catch (err) {
      notify('Void failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2
            className="text-2xl sm:text-3xl font-semibold text-[#1C2420]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Centralized Payments Ledger
          </h2>
          <p className="text-sm text-[#6E6C63] mt-0.5">
            Multi-payment tracking, automatic due calculation, and auditable admin adjustments.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record Payment</span>
        </button>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E2DFD5] rounded-xl p-5">
          <p className="text-xs font-medium text-[#6E6C63]">Valid Transactions</p>
          <p className="text-2xl font-semibold text-[#1C2420] font-mono tabular-nums mt-1.5">
            {totals.count}
          </p>
        </div>
        <div className="bg-white border border-[#E2DFD5] rounded-xl p-5">
          <p className="text-xs font-medium text-[#6E6C63]">Total Collected</p>
          <p className="text-2xl font-semibold text-[#15803D] font-mono tabular-nums mt-1.5">
            {formatCurrency(totals.totalCollected, currency)}
          </p>
        </div>
        <div className="bg-white border border-[#E2DFD5] rounded-xl p-5">
          <p className="text-xs font-medium text-[#6E6C63]">Outstanding Balances</p>
          <p className="text-2xl font-semibold text-[#B45309] font-mono tabular-nums mt-1.5">
            {formatCurrency(totals.totalDue, currency)}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#E2DFD5] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-[#6E6C63] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payment, booking ID, customer..."
            className="w-full rounded-lg border border-[#CDC9BC] pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'ALL' | BookingCategory)}
          className="rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
        >
          <option value="ALL">All Booking Categories</option>
          <option value="EVENT">Events</option>
          <option value="SHOOT">Photoshoots</option>
          <option value="ROOM">Rooms</option>
        </select>

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
        >
          <option value="ALL">All Payment Methods</option>
          <option value="Cash">Cash</option>
          <option value="Bank Transfer">Bank Transfer</option>
          <option value="Card">Card</option>
          <option value="Other">Other</option>
        </select>

        <label className="flex items-center gap-2 text-xs text-[#3D3F3A] cursor-pointer px-2">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(e) => setShowVoided(e.target.checked)}
            className="rounded border-[#CDC9BC]"
          />
          Show voided entries
        </label>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-[#1C2420]">No payment records found</p>
            <p className="text-xs text-[#6E6C63] mt-1">
              Payments recorded on bookings will appear here with full audit attribution.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F7F6F2] text-xs text-[#6E6C63] border-b border-[#E2DFD5]">
                <tr>
                  <th className="px-5 py-3 font-medium">Payment ID</th>
                  <th className="px-5 py-3 font-medium">Booking</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Method &amp; Ref</th>
                  <th className="px-5 py-3 font-medium text-right">Amount</th>
                  <th className="px-5 py-3 font-medium">Recorded By</th>
                  {isAdmin && <th className="px-5 py-3 font-medium text-right">Admin</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD5]">
                {filteredPayments.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-[#F7F6F2]/70 ${p.isVoided ? 'opacity-55' : ''}`}
                  >
                    <td className="px-5 py-3 font-mono text-xs">
                      <span className="font-medium text-[#183D2D]">{p.paymentCode}</span>
                      {p.isVoided && (
                        <span className="block text-[11px] text-[#B91C1C]">VOIDED</span>
                      )}
                      {p.isAdjustment && !p.isVoided && (
                        <span className="block text-[11px] text-[#1D4ED8]">ADJUSTMENT</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <span className="font-mono font-medium">{p.bookingCode}</span>
                      <span className="block text-[#6E6C63]">{p.bookingType}</span>
                    </td>
                    <td className="px-5 py-3 font-medium text-[#1C2420]">{p.customerName}</td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {formatColomboDate(p.paymentDate)}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <p>{p.paymentMethod}</p>
                      {p.referenceNumber && (
                        <p className="font-mono text-[#6E6C63]">{p.referenceNumber}</p>
                      )}
                      {p.adjustmentReason && (
                        <p className="text-[11px] text-[#6E6C63] mt-0.5">
                          {p.adjustmentReason}
                        </p>
                      )}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono tabular-nums text-xs font-semibold ${
                        p.isVoided
                          ? 'line-through text-[#6E6C63]'
                          : p.amount < 0
                          ? 'text-[#B91C1C]'
                          : 'text-[#15803D]'
                      }`}
                    >
                      {formatCurrency(p.amount, currency)}
                    </td>
                    <td className="px-5 py-3 text-xs text-[#3D3F3A]">{p.recordedByName}</td>
                    {isAdmin && (
                      <td className="px-5 py-3 text-right">
                        {!p.isVoided && (
                          <button
                            type="button"
                            onClick={() => setVoidTarget(p)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#B91C1C] hover:underline"
                          >
                            <Ban className="w-3.5 h-3.5" /> Void
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Booking Picker Modal to initiate a new payment */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#E2DFD5] rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD5]">
              <h3 className="text-base font-semibold text-[#1C2420]">
                Select Booking to Record Payment
              </h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-xs text-[#6E6C63] hover:text-[#1C2420]"
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-[#E2DFD5] mt-2 flex-1">
              {allPayableBookings.length === 0 ? (
                <p className="text-xs text-[#6E6C63] py-8 text-center">
                  No active bookings available for payment.
                </p>
              ) : (
                allPayableBookings.map((b) => (
                  <button
                    key={`${b.bookingType}_${b.id}`}
                    type="button"
                    onClick={() => {
                      setSelectedBookingForPay(b);
                      setPickerOpen(false);
                    }}
                    className="w-full text-left py-3 px-2 hover:bg-[#F7F6F2] flex items-center justify-between gap-3 rounded-lg"
                  >
                    <div>
                      <p className="text-xs font-mono text-[#183D2D] font-medium">
                        {b.bookingCode} · {b.bookingType}
                      </p>
                      <p className="text-sm font-medium text-[#1C2420]">{b.customerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono tabular-nums text-[#B45309] font-semibold">
                        Due: {formatCurrency(b.duePayment, currency)}
                      </p>
                      <StatusBadge status={b.status} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <PaymentModal
        open={Boolean(selectedBookingForPay)}
        booking={selectedBookingForPay}
        onClose={() => setSelectedBookingForPay(null)}
      />

      <ConfirmModal
        open={Boolean(voidTarget)}
        title="Void Payment Record"
        message={`Void payment ${voidTarget?.paymentCode} (${formatCurrency(voidTarget?.amount || 0, currency)}) on ${voidTarget?.bookingCode}? The booking's due balance will automatically recalculate.`}
        confirmLabel="Void Payment"
        danger
        requireReason
        reasonLabel="Audit reason for voiding payment"
        loading={voiding}
        onCancel={() => setVoidTarget(null)}
        onConfirm={handleConfirmVoid}
      />
    </div>
  );
};
