import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, X } from 'lucide-react';
import { z } from 'zod';
import { eventBookingSchema, venueResources } from '../utils/validation';
import { EventBooking } from '../types/villa';
import { useAuth } from '../contexts/AuthContext';
import { useVillaData } from '../contexts/VillaDataContext';
import { useToast } from '../contexts/ToastContext';
import {
  findVenueScheduleConflict,
  getColomboDateStr,
} from '../utils/colomboTime';
import { createEventBooking, updateEventBooking } from '../services/villaService';

type EventFormValues = z.infer<typeof eventBookingSchema>;

interface EventFormModalProps {
  open: boolean;
  editingEvent: EventBooking | null;
  onClose: () => void;
}

export const EventFormModal: React.FC<EventFormModalProps> = ({
  open,
  editingEvent,
  onClose,
}) => {
  const { buildActorContext } = useAuth();
  const { events, shoots, blockedSchedules, authorizedEmails, adminEmails } =
    useVillaData();
  const { notify } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventBookingSchema) as never,
    defaultValues: {
      eventType: 'Wedding',
      venueResource: 'Main Lawn & Poolside',
      eventDate: getColomboDateStr(),
      startTime: '10:00',
      endTime: '18:00',
      paxCount: 50,
      customerName: '',
      customerPhone: '',
      totalPayment: 0,
      advancePayment: 0,
      paymentMethod: 'Bank Transfer',
      referenceNumber: '',
      specialNotes: '',
      status: 'Pending',
    },
  });

  useEffect(() => {
    if (open) {
      setConflictMsg(null);
      if (editingEvent) {
        reset({
          eventType: editingEvent.eventType,
          venueResource: editingEvent.venueResource,
          eventDate: editingEvent.eventDate,
          startTime: editingEvent.startTime,
          endTime: editingEvent.endTime,
          paxCount: editingEvent.paxCount,
          customerName: editingEvent.customerName,
          customerPhone: editingEvent.customerPhone,
          totalPayment: editingEvent.totalPayment,
          advancePayment: editingEvent.advancePayment,
          paymentMethod: 'Bank Transfer',
          referenceNumber: '',
          specialNotes: editingEvent.specialNotes || '',
          status: editingEvent.status,
        });
      } else {
        reset({
          eventType: 'Wedding',
          venueResource: 'Main Lawn & Poolside',
          eventDate: getColomboDateStr(),
          startTime: '10:00',
          endTime: '18:00',
          paxCount: 50,
          customerName: '',
          customerPhone: '',
          totalPayment: 0,
          advancePayment: 0,
          paymentMethod: 'Bank Transfer',
          referenceNumber: '',
          specialNotes: '',
          status: 'Pending',
        });
      }
    }
  }, [open, editingEvent, reset]);

  const wDate = watch('eventDate');
  const wStart = watch('startTime');
  const wEnd = watch('endTime');
  const wVenue = watch('venueResource');
  const wStatus = watch('status');
  const liveConflict = React.useMemo(() => {
    if (!open || !wDate || !wStart || !wEnd || wStatus === 'Cancelled') return null;
    return findVenueScheduleConflict({
      date: wDate,
      startTime: wStart,
      endTime: wEnd,
      venueResource: wVenue,
      bookingKind: 'EVENT',
      excludeId: editingEvent?.id,
      events,
      shoots,
      blocks: blockedSchedules,
    });
  }, [
    open,
    wDate,
    wStart,
    wEnd,
    wVenue,
    wStatus,
    editingEvent?.id,
    events,
    shoots,
    blockedSchedules,
  ]);

  if (!open) return null;

  const onSubmit = async (values: EventFormValues) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;

    if (values.status !== 'Cancelled') {
      const conflict = findVenueScheduleConflict({
        date: values.eventDate,
        startTime: values.startTime,
        endTime: values.endTime,
        venueResource: values.venueResource,
        bookingKind: 'EVENT',
        excludeId: editingEvent?.id,
        events,
        shoots,
        blocks: blockedSchedules,
      });
      if (conflict) {
        setConflictMsg(conflict);
        return;
      }
    }

    setSubmitting(true);
    setConflictMsg(null);
    try {
      if (editingEvent) {
        await updateEventBooking(actor, editingEvent, {
          eventType: values.eventType,
          venueResource: values.venueResource,
          eventDate: values.eventDate,
          startTime: values.startTime,
          endTime: values.endTime,
          paxCount: values.paxCount,
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          totalPayment: values.totalPayment,
          specialNotes: values.specialNotes,
          status: values.status,
        });
        notify('Event booking updated', 'success', editingEvent.bookingCode);
      } else {
        await createEventBooking(actor, {
          eventType: values.eventType,
          venueResource: values.venueResource,
          eventDate: values.eventDate,
          startTime: values.startTime,
          endTime: values.endTime,
          paxCount: values.paxCount,
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          totalPayment: values.totalPayment,
          advancePayment: values.advancePayment,
          paymentMethod: values.paymentMethod,
          referenceNumber: values.referenceNumber,
          specialNotes: values.specialNotes,
          status: values.status,
        });
        notify('Event booking created', 'success', `${values.eventType} for ${values.customerName}`);
      }
      onClose();
    } catch (err) {
      setConflictMsg(err instanceof Error ? err.message : 'Unable to save event booking.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayWarning = conflictMsg || liveConflict;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-[#E2DFD5] rounded-xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#E2DFD5]">
          <div>
            <h3 className="text-lg font-semibold text-[#1C2420]">
              {editingEvent ? `Edit Event · ${editingEvent.bookingCode}` : 'New Event Booking'}
            </h3>
            <p className="text-xs text-[#6E6C63] mt-0.5">
              All times evaluated in Asia/Colombo local time.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6E6C63] hover:text-[#1C2420] p-1 rounded"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {displayWarning && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#B91C1C]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{displayWarning}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Event Type</label>
              <select
                {...register('eventType')}
                className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
              >
                <option value="Wedding">Wedding</option>
                <option value="Birthday">Birthday</option>
                <option value="Engagement">Engagement</option>
                <option value="Corporate Event">Corporate Event</option>
                <option value="Private Party">Private Party</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Venue Resource
              </label>
              <select
                {...register('venueResource')}
                className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
              >
                {venueResources.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Booking Status
              </label>
              <select
                {...register('status')}
                className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
              >
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Event Date</label>
              <input
                type="date"
                {...register('eventDate')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
              />
              {errors.eventDate && (
                <p className="text-xs text-[#B91C1C] mt-1">{errors.eventDate.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Start Time</label>
              <input
                type="time"
                {...register('startTime')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
              />
              {errors.startTime && (
                <p className="text-xs text-[#B91C1C] mt-1">{errors.startTime.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">End Time</label>
              <input
                type="time"
                {...register('endTime')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
              />
              {errors.endTime && (
                <p className="text-xs text-[#B91C1C] mt-1">{errors.endTime.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Customer Name
              </label>
              <input
                type="text"
                placeholder="Full name"
                {...register('customerName')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
              />
              {errors.customerName && (
                <p className="text-xs text-[#B91C1C] mt-1">{errors.customerName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Phone Number
              </label>
              <input
                type="text"
                placeholder="+94 77 123 4567"
                {...register('customerPhone')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
              />
              {errors.customerPhone && (
                <p className="text-xs text-[#B91C1C] mt-1">{errors.customerPhone.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Pax Count</label>
              <input
                type="number"
                min={1}
                {...register('paxCount')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:border-[#183D2D]"
              />
              {errors.paxCount && (
                <p className="text-xs text-[#B91C1C] mt-1">{errors.paxCount.message}</p>
              )}
            </div>
          </div>

          <input type="hidden" {...register('totalPayment')} />
          <input type="hidden" {...register('advancePayment')} />
          <input type="hidden" {...register('paymentMethod')} />
          <input type="hidden" {...register('referenceNumber')} />

          <div>
            <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
              Special Notes (optional)
            </label>
            <textarea
              rows={2}
              placeholder="Catering setup, floral requirements, sound curfew..."
              {...register('specialNotes')}
              className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E2DFD5]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#3D3F3A] bg-[#F7F6F2] hover:bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || Boolean(liveConflict && wStatus !== 'Cancelled')}
              className="px-5 py-2 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editingEvent ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
