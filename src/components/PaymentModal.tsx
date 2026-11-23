import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { z } from 'zod';
import { paymentSchema } from '../utils/validation';
import { BookingCategory, Payment } from '../types/villa';
import { formatCurrency, getColomboDateStr } from '../utils/colomboTime';
import { useAuth } from '../contexts/AuthContext';
import { useVillaData } from '../contexts/VillaDataContext';
import { useToast } from '../contexts/ToastContext';
import { recordBookingPayment } from '../services/villaService';

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface PaymentModalProps {
  open: boolean;
  booking: {
    id: string;
    bookingCode: string;
    bookingType: BookingCategory;
    customerName: string;
    totalPayment: number;
    advancePayment: number;
    duePayment: number;
  } | null;
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ open, booking, onClose }) => {
  const { currentStaff, buildActorContext } = useAuth();
  const { payments, currency, authorizedEmails, adminEmails } = useVillaData();
  const { notify } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const isAdmin = currentStaff?.role === 'ADMIN';

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as never,
    defaultValues: {
      amount: booking?.duePayment || 0,
      paymentMethod: 'Bank Transfer',
      paymentDate: getColomboDateStr(),
      referenceNumber: '',
      notes: '',
      isAdjustment: false,
      adjustmentReason: '',
      allowOverpayment: false,
    },
  });

  React.useEffect(() => {
    if (open && booking) {
      reset({
        amount: booking.duePayment > 0 ? booking.duePayment : 0,
        paymentMethod: 'Bank Transfer',
        paymentDate: getColomboDateStr(),
        referenceNumber: '',
        notes: '',
        isAdjustment: false,
        adjustmentReason: '',
        allowOverpayment: false,
      });
      setServerError(null);
    }
  }, [open, booking, reset]);

  if (!open || !booking) return null;

  const isAdjustment = watch('isAdjustment');

  const onSubmit = async (values: PaymentFormValues) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const existingForBooking = payments.filter((p) => p.bookingId === booking.id);
      await recordBookingPayment(actor, {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        bookingType: booking.bookingType,
        customerName: booking.customerName,
        amount: values.amount,
        paymentMethod: values.paymentMethod,
        paymentDate: values.paymentDate,
        referenceNumber: values.referenceNumber,
        notes: values.notes,
        isAdjustment: values.isAdjustment,
        adjustmentReason: values.adjustmentReason,
        allowOverpayment: values.allowOverpayment,
        existingPaymentsForBooking: existingForBooking,
      });
      notify(
        values.isAdjustment ? 'Payment adjustment recorded' : 'Payment recorded',
        'success',
        `${formatCurrency(values.amount, currency)} applied to ${booking.bookingCode}`
      );
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-[#E2DFD5] rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#E2DFD5]">
          <div>
            <h3 className="text-lg font-semibold text-[#1C2420]">Record Payment</h3>
            <p className="text-xs text-[#6E6C63] mt-0.5 font-mono">
              {booking.bookingCode} · {booking.customerName}
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

        <div className="grid grid-cols-3 gap-3 my-4 p-3 rounded-lg bg-[#F7F6F2] border border-[#E2DFD5]">
          <div>
            <p className="text-[11px] text-[#6E6C63]">Total Amount</p>
            <p className="text-sm font-semibold text-[#1C2420] font-mono tabular-nums">
              {formatCurrency(booking.totalPayment, currency)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#6E6C63]">Paid So Far</p>
            <p className="text-sm font-semibold text-[#15803D] font-mono tabular-nums">
              {formatCurrency(booking.advancePayment, currency)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#6E6C63]">Due Balance</p>
            <p className="text-sm font-semibold text-[#B45309] font-mono tabular-nums">
              {formatCurrency(booking.duePayment, currency)}
            </p>
          </div>
        </div>

        {serverError && (
          <div className="mb-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#B91C1C]">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Amount ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                {...register('amount')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:border-[#183D2D]"
              />
              {errors.amount && (
                <p className="text-xs text-[#B91C1C] mt-1">{errors.amount.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Payment Method
              </label>
              <select
                {...register('paymentMethod')}
                className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Payment Date (Asia/Colombo)
              </label>
              <input
                type="date"
                {...register('paymentDate')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
              />
              {errors.paymentDate && (
                <p className="text-xs text-[#B91C1C] mt-1">{errors.paymentDate.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Reference Number (optional)
              </label>
              <input
                type="text"
                placeholder="e.g., TXN-994102"
                {...register('referenceNumber')}
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
              Notes (optional)
            </label>
            <textarea
              rows={2}
              placeholder="Receipt or payment remarks..."
              {...register('notes')}
              className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
            />
          </div>

          {isAdmin && (
            <div className="rounded-lg border border-[#E2DFD5] bg-[#F7F6F2] p-3 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-medium text-[#1C2420] cursor-pointer">
                <input
                  type="checkbox"
                  {...register('isAdjustment')}
                  className="rounded border-[#CDC9BC] text-[#183D2D]"
                />
                Admin Payment Adjustment (allows negative correction)
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-[#1C2420] cursor-pointer">
                <input
                  type="checkbox"
                  {...register('allowOverpayment')}
                  className="rounded border-[#CDC9BC] text-[#183D2D]"
                />
                Authorize overpayment above booking total
              </label>

              {isAdjustment && (
                <div>
                  <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                    Adjustment Audit Reason
                  </label>
                  <input
                    type="text"
                    placeholder="Required reason for audit log..."
                    {...register('adjustmentReason')}
                    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#3D3F3A] bg-[#F7F6F2] hover:bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
