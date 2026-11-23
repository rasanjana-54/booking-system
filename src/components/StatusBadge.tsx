import React from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  ShieldAlert,
} from 'lucide-react';

interface StatusBadgeProps {
  status: string;
}

const CONFIG: Record<
  string,
  { text: string; bg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  Confirmed: { text: 'text-[#15803D]', bg: 'bg-[#ECFDF3]', icon: CheckCircle2 },
  Available: { text: 'text-[#15803D]', bg: 'bg-[#ECFDF3]', icon: CheckCircle2 },
  FULLY_PAID: { text: 'text-[#15803D]', bg: 'bg-[#ECFDF3]', icon: CheckCircle2 },
  Included: { text: 'text-[#15803D]', bg: 'bg-[#ECFDF3]', icon: CheckCircle2 },
  Active: { text: 'text-[#15803D]', bg: 'bg-[#ECFDF3]', icon: CheckCircle2 },

  Pending: { text: 'text-[#B45309]', bg: 'bg-[#FEF7EC]', icon: Clock },
  PARTIALLY_PAID: { text: 'text-[#B45309]', bg: 'bg-[#FEF7EC]', icon: Clock },
  Maintenance: { text: 'text-[#B45309]', bg: 'bg-[#FEF7EC]', icon: AlertCircle },

  Completed: { text: 'text-[#183D2D]', bg: 'bg-[#EEF3F0]', icon: CheckCircle2 },
  'Checked-in': { text: 'text-[#1D4ED8]', bg: 'bg-[#EFF6FF]', icon: LogIn },
  'Checked-out': { text: 'text-[#3D3F3A]', bg: 'bg-[#EFEDE6]', icon: LogOut },
  OVERPAID: { text: 'text-[#1D4ED8]', bg: 'bg-[#EFF6FF]', icon: ShieldAlert },

  Cancelled: { text: 'text-[#B91C1C]', bg: 'bg-[#FEF2F2]', icon: Ban },
  UNPAID: { text: 'text-[#B91C1C]', bg: 'bg-[#FEF2F2]', icon: AlertCircle },
  Inactive: { text: 'text-[#6E6C63]', bg: 'bg-[#EFEDE6]', icon: Ban },
  'Not Included': { text: 'text-[#6E6C63]', bg: 'bg-[#EFEDE6]', icon: Ban },
};

const LABEL_MAP: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  FULLY_PAID: 'Fully Paid',
  OVERPAID: 'Overpaid',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const cfg = CONFIG[status] || {
    text: 'text-[#3D3F3A]',
    bg: 'bg-[#EFEDE6]',
    icon: Clock,
  };
  const Icon = cfg.icon;
  const label = LABEL_MAP[status] || status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap shrink-0 ${cfg.bg} ${cfg.text}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
};
