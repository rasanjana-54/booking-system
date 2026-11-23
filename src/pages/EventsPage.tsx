import React, { useMemo, useState } from 'react';
import { Archive, CreditCard, Edit3, Eye, Plus, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useVillaData } from '../contexts/VillaDataContext';
import { useToast } from '../contexts/ToastContext';
import { EventBooking } from '../types/villa';
import { formatColomboDate, formatCurrency } from '../utils/colomboTime';
import { archiveBooking } from '../services/villaService';
import { StatusBadge } from '../components/StatusBadge';
import { EventFormModal } from '../components/EventFormModal';
import { BookingDetailModal } from '../components/BookingDetailModal';
import { PaymentModal } from '../components/PaymentModal';
import { ConfirmModal } from '../components/ConfirmModal';

export const EventsPage: React.FC = () => {
  const { currentStaff, buildActorContext } = useAuth();
  const { events, currency, authorizedEmails, adminEmails } = useVillaData();
  const { notify } = useToast();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventBooking | null>(null);
  const [detailEvent, setDetailEvent] = useState<EventBooking | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<EventBooking | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<EventBooking | null>(null);
  const [archiving, setArchiving] = useState(false);

  const isAdmin = currentStaff?.role === 'ADMIN';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (e.isArchived) return false;
      if (typeFilter !== 'ALL' && e.eventType !== typeFilter) return false;
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (dateFilter && e.eventDate !== dateFilter) return false;
      if (q) {
        const hay = `${e.bookingCode} ${e.customerName} ${e.customerPhone} ${e.eventType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, typeFilter, statusFilter, dateFilter]);

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setArchiving(true);
    try {
      await archiveBooking(actor, 'EVENT', archiveTarget.id, archiveTarget.bookingCode);
      notify('Event archived', 'success', archiveTarget.bookingCode);
      setArchiveTarget(null);
    } catch (err) {
      notify('Archive failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setArchiving(false);
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
            Event Bookings
          </h2>
          <p className="text-sm text-[#6E6C63] mt-0.5">
            Weddings, engagements, private parties, and corporate villa buyouts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingEvent(null);
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Event Booking</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-[#E2DFD5] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#6E6C63] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, phone, ID..."
            className="w-full rounded-lg border border-[#CDC9BC] pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
        >
          <option value="ALL">All Event Types</option>
          <option value="Wedding">Wedding</option>
          <option value="Birthday">Birthday</option>
          <option value="Engagement">Engagement</option>
          <option value="Corporate Event">Corporate Event</option>
          <option value="Private Party">Private Party</option>
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
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-xs text-[#183D2D] hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-[#1C2420]">No event bookings found</p>
            <p className="text-xs text-[#6E6C63] mt-1 mb-4">
              Add a new event booking to start managing schedules and payments.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingEvent(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#183D2D] rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" /> Add First Event
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F7F6F2] text-xs text-[#6E6C63] border-b border-[#E2DFD5]">
                <tr>
                  <th className="px-5 py-3 font-medium">Event ID</th>
                  <th className="px-5 py-3 font-medium">Event &amp; Venue</th>
                  <th className="px-5 py-3 font-medium">Date &amp; Time</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium text-right">Pax</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium text-right">Due</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD5]">
                {filtered.map((evt) => {
                  const lockedForStaff =
                    !isAdmin && (evt.status === 'Completed' || evt.status === 'Cancelled');
                  return (
                    <tr key={evt.id} className="hover:bg-[#F7F6F2]/70">
                      <td className="px-5 py-3 font-mono text-xs font-medium text-[#183D2D]">
                        {evt.bookingCode}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-[#1C2420]">{evt.eventType}</p>
                        <p className="text-xs text-[#6E6C63]">{evt.venueResource}</p>
                      </td>
                      <td className="px-5 py-3 text-xs font-mono">
                        <p>{formatColomboDate(evt.eventDate)}</p>
                        <p className="text-[#6E6C63]">
                          {evt.startTime} – {evt.endTime}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-[#1C2420]">{evt.customerName}</p>
                        <p className="text-xs text-[#6E6C63] font-mono">{evt.customerPhone}</p>
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-xs">
                        {evt.paxCount}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-xs">
                        {formatCurrency(evt.totalPayment, currency)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-xs font-medium text-[#B45309]">
                        {formatCurrency(evt.duePayment, currency)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={evt.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailEvent(evt)}
                            className="p-1.5 rounded-lg text-[#3D3F3A] hover:bg-[#EFEDE6]"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {!lockedForStaff && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEvent(evt);
                                setFormOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-[#3D3F3A] hover:bg-[#EFEDE6]"
                              title="Edit Event"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {evt.status !== 'Cancelled' && (
                            <button
                              type="button"
                              onClick={() => setPaymentTarget(evt)}
                              className="p-1.5 rounded-lg text-[#183D2D] hover:bg-[#EEF3F0]"
                              title="Record Payment"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}
                          {!lockedForStaff && (
                            <button
                              type="button"
                              onClick={() => setArchiveTarget(evt)}
                              className="p-1.5 rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"
                              title="Archive Event"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EventFormModal
        open={formOpen}
        editingEvent={editingEvent}
        onClose={() => {
          setFormOpen(false);
          setEditingEvent(null);
        }}
      />

      <BookingDetailModal
        booking={detailEvent ? { category: 'EVENT', data: detailEvent } : null}
        onClose={() => setDetailEvent(null)}
        onEdit={
          detailEvent &&
          (isAdmin ||
            (detailEvent.status !== 'Completed' && detailEvent.status !== 'Cancelled'))
            ? () => {
                setEditingEvent(detailEvent);
                setDetailEvent(null);
                setFormOpen(true);
              }
            : undefined
        }
        onRecordPayment={
          detailEvent && detailEvent.status !== 'Cancelled'
            ? () => {
                setPaymentTarget(detailEvent);
                setDetailEvent(null);
              }
            : undefined
        }
        onArchive={
          detailEvent &&
          (isAdmin ||
            (detailEvent.status !== 'Completed' && detailEvent.status !== 'Cancelled'))
            ? () => {
                setArchiveTarget(detailEvent);
                setDetailEvent(null);
              }
            : undefined
        }
      />

      <PaymentModal
        open={Boolean(paymentTarget)}
        booking={
          paymentTarget
            ? {
                id: paymentTarget.id,
                bookingCode: paymentTarget.bookingCode,
                bookingType: 'EVENT',
                customerName: paymentTarget.customerName,
                totalPayment: paymentTarget.totalPayment,
                advancePayment: paymentTarget.advancePayment,
                duePayment: paymentTarget.duePayment,
              }
            : null
        }
        onClose={() => setPaymentTarget(null)}
      />

      <ConfirmModal
        open={Boolean(archiveTarget)}
        title="Archive Event Booking"
        message={`Archive ${archiveTarget?.bookingCode} (${archiveTarget?.customerName})? Archived records remain recoverable by an administrator.`}
        confirmLabel="Archive Booking"
        danger
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={handleConfirmArchive}
      />
    </div>
  );
};
