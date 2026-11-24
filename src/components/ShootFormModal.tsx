import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, X } from 'lucide-react';
import { z } from 'zod';
import { shootBookingSchema, venueResources } from '../utils/validation';
import { ShootBooking } from '../types/villa';
import { useAuth } from '../contexts/AuthContext';
import { useVillaData } from '../contexts/VillaDataContext';
import { useToast } from '../contexts/ToastContext';
import {
  findVenueScheduleConflict,
  getColomboDateStr,
} from '../utils/colomboTime';
import { createShootBooking, updateShootBooking } from '../services/villaService';

type ShootFormValues = z.infer<typeof shootBookingSchema>;

interface ShootFormModalProps {
  open: boolean;
  editingShoot: ShootBooking | null;
  onClose: () => void;
}

export const ShootFormModal: React.FC<ShootFormModalProps> = ({
  open,
  editingShoot,
  onClose,
}) => {
  const { buildActorContext, currentStaff } = useAuth();
  const { events, shoots, blockedSchedules, authorizedEmails, adminEmails, staffMembers } =
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
  } = useForm<ShootFormValues>({
    resolver: zodResolver(shootBookingSchema) as never,
    defaultValues: {
      shootDate: getColomboDateStr(),
      shootType: 'Photography',
      venueResource: 'Garden Pavilion',
      startTime: '08:00',
      endTime: '12:00',
      paxCount: 1,
      assignedStaffId: currentStaff?.email || '',
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
      if (editingShoot) {
        reset({
          shootDate: editingShoot.shootDate,
          shootType: editingShoot.shootType,
          venueResource: editingShoot.venueResource,
          startTime: editingShoot.startTime,
          endTime: editingShoot.endTime,
          paxCount: editingShoot.paxCount || 1,
          assignedStaffId: editingShoot.assignedStaffId || currentStaff?.email || '',
          customerName: editingShoot.customerName,
          customerPhone: editingShoot.customerPhone,
          totalPayment: editingShoot.totalPayment,
          advancePayment: editingShoot.advancePayment,
          paymentMethod: 'Bank Transfer',
          referenceNumber: '',
          specialNotes: editingShoot.specialNotes || '',
          status: editingShoot.status,
        });
      } else {
        reset({
          shootDate: getColomboDateStr(),
          shootType: 'Photography',
          venueResource: 'Garden Pavilion',
          startTime: '08:00',
          endTime: '12:00',
          paxCount: 1,
          assignedStaffId: currentStaff?.email || '',
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
  }, [open, editingShoot, reset, currentStaff?.email]);

  const wDate = watch('shootDate');
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
      bookingKind: 'SHOOT',
      excludeId: editingShoot?.id,
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
    editingShoot?.id,
    events,
    shoots,
    blockedSchedules,
  ]);

  if (!open) return null;

  const onSubmit = async (values: ShootFormValues) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;

    if (values.status !== 'Cancelled') {
      const conflict = findVenueScheduleConflict({
        date: values.shootDate,
        startTime: values.startTime,
        endTime: values.endTime,
        venueResource: values.venueResource,
        bookingKind: 'SHOOT',
        excludeId: editingShoot?.id,
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
      if (editingShoot) {
        await updateShootBooking(actor, editingShoot, {
          shootDate: values.shootDate,
          shootType: values.shootType,
          venueResource: values.venueResource,
          startTime: values.startTime,
          endTime: values.endTime,
          paxCount: values.paxCount,
          assignedStaffId: values.assignedStaffId,
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          totalPayment: values.totalPayment,
          specialNotes: values.specialNotes,
          status: values.status,
        });
        notify('Photoshoot booking updated', 'success', editingShoot.bookingCode);
      } else {
        await createShootBooking(actor, {
          shootDate: values.shootDate,
          shootType: values.shootType,
          venueResource: values.venueResource,
          startTime: values.startTime,
          endTime: values.endTime,
          paxCount: values.paxCount,
          assignedStaffId: values.assignedStaffId,
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          totalPayment: values.totalPayment,
          advancePayment: values.advancePayment,
          paymentMethod: values.paymentMethod,
          referenceNumber: values.referenceNumber,
          specialNotes: values.specialNotes,
          status: values.status,
        });
        notify('Photoshoot booking created', 'success', `${values.shootType} for ${values.customerName}`);
      }
      onClose();
    } catch (err) {
      setConflictMsg(err instanceof Error ? err.message : 'Unable to save shoot booking.');
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
              {editingShoot ? `Edit Shoot · ${editingShoot.bookingCode}` : 'New Photoshoot Booking'}
            </h3>
            <p className="text-xs text-[#6E6C63] mt-0.5">
              Prevents overlapping bookings for shared villa grounds and venues.
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Guests / Pax
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                {...register('paxCount')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm"
              />
              {errors.paxCount && (
                <p className="text-xs text-[#B91C1C] mt-1">{errors.paxCount.message}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Assigned Staff
              </label>
              {currentStaff?.role === 'ADMIN' ? (
                <select
                  {...register('assignedStaffId')}
                  className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select staff member</option>
                  {staffMembers
                    .filter((member) => member.isActive)
                    .map((member) => (
                      <option key={member.id} value={member.email}>
                        {member.name} ({member.email})
                      </option>
                    ))}
                </select>
              ) : (
                <>
                  <input
                    type="text"
                    value={currentStaff?.name || ''}
                    disabled
                    className="w-full rounded-lg border border-[#CDC9BC] bg-[#F7F6F2] px-3 py-2 text-sm"
                  />
                  <input type="hidden" {...register('assignedStaffId')} />
                </>
              )}
              {errors.assignedStaffId && (
                <p className="text-xs text-[#B91C1C] mt-1">
                  {errors.assignedStaffId.message}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Shoot Type</label>
              <select
                {...register('shootType')}
                className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
              >
                <option value="Photography">Photography</option>
                <option value="Videography">Videography</option>
                <option value="Wedding Shoot">Wedding Shoot</option>
                <option value="Fashion Shoot">Fashion Shoot</option>
                <option value="Commercial Shoot">Commercial Shoot</option>
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
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Shoot Date</label>
              <input
                type="date"
                {...register('shootDate')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
              />
              {errors.shootDate && (
                <p className="text-xs text-[#B91C1C] mt-1">{errors.shootDate.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Start Time</label>
              <input
                type="time"
                {...register('startTime')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
              />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Customer / Production Name
              </label>
              <input
                type="text"
                placeholder="Client or studio name"
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
              placeholder="Crew size, lighting power access, drone permissions..."
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
              {submitting ? 'Saving...' : editingShoot ? 'Save Changes' : 'Create Shoot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
