import React from 'react';
import { Archive, Edit3, X } from 'lucide-react';
import { UnifiedBooking } from '../types/villa';
import { formatColomboDate, formatColomboTimestamp } from '../utils/colomboTime';
import { StatusBadge } from './StatusBadge';

interface BookingDetailModalProps {
  booking: UnifiedBooking | null;
  onClose: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
}

export const BookingDetailModal: React.FC<BookingDetailModalProps> = ({
  booking,
  onClose,
  onEdit,
  onArchive,
}) => {
  if (!booking) return null;

  const { category, data } = booking;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-[#E2DFD5] rounded-xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E2DFD5]">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#6E6C63] mb-1">
              <span className="font-mono font-medium text-[#183D2D]">
                {data.bookingCode}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {category === 'EVENT'
                  ? 'Event Booking'
                  : category === 'SHOOT'
                  ? 'Photoshoot / Video Shoot'
                  : 'Room Reservation'}
              </span>
            </div>
            <h3 className="text-xl font-semibold text-[#1C2420]">{data.customerName}</h3>
            <p className="text-sm text-[#6E6C63] font-mono mt-0.5">{data.customerPhone}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            <button
              type="button"
              onClick={onClose}
              className="text-[#6E6C63] hover:text-[#1C2420] p-1 rounded"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Schedule & Details */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4 border-b border-[#E2DFD5] text-sm">
          {category === 'EVENT' && (
            <>
              <div>
                <p className="text-xs text-[#6E6C63]">Event Type</p>
                <p className="font-medium text-[#1C2420] mt-0.5">{data.eventType}</p>
              </div>
              <div>
                <p className="text-xs text-[#6E6C63]">Venue Resource</p>
                <p className="font-medium text-[#1C2420] mt-0.5">{data.venueResource}</p>
              </div>
              <div>
                <p className="text-xs text-[#6E6C63]">Guest Count (Pax)</p>
                <p className="font-medium text-[#1C2420] font-mono tabular-nums mt-0.5">
                  {data.paxCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6E6C63]">Event Date</p>
                <p className="font-medium text-[#1C2420] mt-0.5">
                  {formatColomboDate(data.eventDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6E6C63]">Time Window</p>
                <p className="font-medium text-[#1C2420] font-mono tabular-nums mt-0.5">
                  {data.startTime} – {data.endTime}
                </p>
              </div>
            </>
          )}

          {category === 'SHOOT' && (
            <>
              <div>
                <p className="text-xs text-[#6E6C63]">Shoot Type</p>
                <p className="font-medium text-[#1C2420] mt-0.5">{data.shootType}</p>
              </div>
              <div>
                <p className="text-xs text-[#6E6C63]">Venue Resource</p>
                <p className="font-medium text-[#1C2420] mt-0.5">{data.venueResource}</p>
              </div>
              <div>
                <p className="text-xs text-[#6E6C63]">Shoot Date</p>
                <p className="font-medium text-[#1C2420] mt-0.5">
                  {formatColomboDate(data.shootDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6E6C63]">Time Window</p>
                <p className="font-medium text-[#1C2420] font-mono tabular-nums mt-0.5">
                  {data.startTime} – {data.endTime}
                </p>
              </div>
            </>
          )}

          {category === 'ROOM' && (
            <>
              <div>
                <p className="text-xs text-[#6E6C63]">Room Type</p>
                <p className="font-medium text-[#1C2420] mt-0.5">{data.roomTypeName}</p>
              </div>
              <div>
                <p className="text-xs text-[#6E6C63]">Food Status</p>
                <div className="mt-0.5">
                  <StatusBadge status={data.foodStatus} />
                </div>
              </div>
              <div>
                <p className="text-xs text-[#6E6C63]">Check-in</p>
                <p className="font-medium text-[#1C2420] mt-0.5">
                  {formatColomboDate(data.checkInDate)} ·{' '}
                  <span className="font-mono">{data.checkInTime}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6E6C63]">Check-out</p>
                <p className="font-medium text-[#1C2420] mt-0.5">
                  {formatColomboDate(data.checkOutDate)} ·{' '}
                  <span className="font-mono">{data.checkOutTime}</span>
                </p>
              </div>
            </>
          )}

          <div>
            <p className="text-xs text-[#6E6C63]">Created By</p>
            <p className="font-medium text-[#1C2420] mt-0.5">{data.createdByName}</p>
          </div>
          <div>
            <p className="text-xs text-[#6E6C63]">Created At</p>
            <p className="text-xs text-[#3D3F3A] mt-0.5 font-mono">
              {formatColomboTimestamp(data.createdAt)}
            </p>
          </div>
        </div>

        {data.specialNotes && (
          <div className="py-3 border-b border-[#E2DFD5]">
            <p className="text-xs text-[#6E6C63] mb-1">Special Notes</p>
            <p className="text-sm text-[#1C2420] whitespace-pre-wrap">{data.specialNotes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-[#E2DFD5]">
          {onArchive && !data.isArchived && (
            <button
              type="button"
              onClick={onArchive}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-lg transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
            </button>
          )}
          {onEdit && !data.isArchived && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#3D3F3A] bg-[#F7F6F2] hover:bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Details
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
