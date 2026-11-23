 import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  requireReason = false,
  reasonLabel = 'Reason for audit log',
  loading = false,
  onCancel,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requireReason && reason.trim().length < 3) {
      setErr('Please enter a reason (minimum 3 characters).');
      return;
    }
    setErr('');
    await onConfirm(reason.trim() || undefined);
    setReason('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-[#E2DFD5] rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                danger ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#EEF3F0] text-[#183D2D]'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-base font-semibold text-[#1C2420]">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[#6E6C63] hover:text-[#1C2420] p-1 rounded"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <p className="text-sm text-[#6E6C63] leading-relaxed mb-4">{message}</p>

          {requireReason && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                {reasonLabel}
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason..."
                className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm text-[#1C2420] focus:outline-none focus:ring-2 focus:ring-[#183D2D]/20 focus:border-[#183D2D]"
              />
              {err && <p className="text-xs text-[#B91C1C] mt-1">{err}</p>}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-[#3D3F3A] bg-[#F7F6F2] hover:bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 ${
                danger
                  ? 'bg-[#B91C1C] hover:bg-[#991B1B]'
                  : 'bg-[#183D2D] hover:bg-[#112D21]'
              }`}
            >
              {loading ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
