import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Trash2,
  X,
} from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import { useVillaData } from '../contexts/VillaDataContext';
import { useToast } from '../contexts/ToastContext';
import { BlockedSchedule, UnifiedBooking } from '../types/villa';
import { blockedScheduleSchema } from '../utils/validation';
import {
  addDaysToDateStr,
  formatColomboDate,
  getColomboDateStr,
} from '../utils/colomboTime';
import { createBlockedSchedule, deleteBlockedSchedule } from '../services/villaService';
import { BookingDetailModal } from '../components/BookingDetailModal';
import { PaymentModal } from '../components/PaymentModal';

type CalendarView = 'month' | 'week' | 'day';
type BlockFormValues = z.infer<typeof blockedScheduleSchema>;

interface CalendarItem {
  id: string;
  kind: 'EVENT' | 'SHOOT' | 'ROOM' | 'BLOCK';
  title: string;
  timeLabel: string;
  status?: string;
  booking?: UnifiedBooking;
  block?: BlockedSchedule;
}

const KIND_STYLES: Record<CalendarItem['kind'], string> = {
  EVENT: 'bg-[#EEF3F0] text-[#183D2D] border-[#183D2D]/20',
  SHOOT: 'bg-[#FEF7EC] text-[#B45309] border-[#B45309]/25',
  ROOM: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#1D4ED8]/25',
  BLOCK: 'bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]/25',
};

export const CalendarPage: React.FC = () => {
  const { buildActorContext } = useAuth();
  const {
    events,
    shoots,
    roomBookings,
    roomTypes,
    blockedSchedules,
    authorizedEmails,
    adminEmails,
  } = useVillaData();
  const { notify } = useToast();

  const [view, setView] = useState<CalendarView>('month');
  const [anchorDate, setAnchorDate] = useState(getColomboDateStr());
  const [showEvents, setShowEvents] = useState(true);
  const [showShoots, setShowShoots] = useState(true);
  const [showRooms, setShowRooms] = useState(true);
  const [showBlocks, setShowBlocks] = useState(true);

  const [detailBooking, setDetailBooking] = useState<UnifiedBooking | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<{
    id: string;
    bookingCode: string;
    bookingType: 'EVENT' | 'SHOOT' | 'ROOM';
    customerName: string;
    totalPayment: number;
    advancePayment: number;
    duePayment: number;
  } | null>(null);

  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [submittingBlock, setSubmittingBlock] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<BlockFormValues>({
    resolver: zodResolver(blockedScheduleSchema) as never,
    defaultValues: {
      scope: 'FULL_VILLA',
      roomTypeId: '',
      startDate: anchorDate,
      endDate: anchorDate,
      startTime: '00:00',
      endTime: '23:59',
      reason: '',
    },
  });

  const blockScope = watch('scope');

  const getItemsForDate = (dateStr: string): CalendarItem[] => {
    const items: CalendarItem[] = [];

    if (showEvents) {
      for (const e of events) {
        if (e.isArchived || e.status === 'Cancelled') continue;
        if (e.eventDate === dateStr) {
          items.push({
            id: `evt_${e.id}`,
            kind: 'EVENT',
            title: `${e.eventType}: ${e.customerName}`,
            timeLabel: `${e.startTime}–${e.endTime}`,
            status: e.status,
            booking: { category: 'EVENT', data: e },
          });
        }
      }
    }

    if (showShoots) {
      for (const s of shoots) {
        if (s.isArchived || s.status === 'Cancelled') continue;
        if (s.shootDate === dateStr) {
          items.push({
            id: `sht_${s.id}`,
            kind: 'SHOOT',
            title: `${s.shootType}: ${s.customerName}`,
            timeLabel: `${s.startTime}–${s.endTime}`,
            status: s.status,
            booking: { category: 'SHOOT', data: s },
          });
        }
      }
    }

    if (showRooms) {
      for (const r of roomBookings) {
        if (r.isArchived || r.status === 'Cancelled') continue;
        if (r.checkInDate <= dateStr && r.checkOutDate >= dateStr) {
          items.push({
            id: `rom_${r.id}`,
            kind: 'ROOM',
            title: `${r.roomTypeName}: ${r.customerName}`,
            timeLabel:
              r.checkInDate === dateStr
                ? `In ${r.checkInTime}`
                : r.checkOutDate === dateStr
                ? `Out ${r.checkOutTime}`
                : 'Occupied',
            status: r.status,
            booking: { category: 'ROOM', data: r },
          });
        }
      }
    }

    if (showBlocks) {
      for (const b of blockedSchedules) {
        if (b.startDate <= dateStr && b.endDate >= dateStr) {
          items.push({
            id: `blk_${b.id}`,
            kind: 'BLOCK',
            title: `Blocked: ${b.reason}`,
            timeLabel:
              b.startDate === b.endDate ? `${b.startTime}–${b.endTime}` : b.scope,
            block: b,
          });
        }
      }
    }

    return items;
  };

  // Navigation math
  const navigate = (dir: -1 | 1) => {
    if (view === 'day') {
      setAnchorDate(addDaysToDateStr(anchorDate, dir));
    } else if (view === 'week') {
      setAnchorDate(addDaysToDateStr(anchorDate, dir * 7));
    } else {
      const [y, m] = anchorDate.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1 + dir, 1, 12, 0, 0));
      setAnchorDate(dt.toISOString().slice(0, 10));
    }
  };

  const monthDays = useMemo(() => {
    const [y, m] = anchorDate.split('-').map(Number);
    const firstOfMonth = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
    const startWeekday = firstOfMonth.getUTCDay(); // 0=Sun..6=Sat
    const gridStart = addDaysToDateStr(`${y}-${String(m).padStart(2, '0')}-01`, -startWeekday);
    return Array.from({ length: 42 }, (_, idx) => addDaysToDateStr(gridStart, idx));
  }, [anchorDate]);

  const weekDays = useMemo(() => {
    const [y, m, d] = anchorDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dow = dt.getUTCDay();
    const start = addDaysToDateStr(anchorDate, -dow);
    return Array.from({ length: 7 }, (_, idx) => addDaysToDateStr(start, idx));
  }, [anchorDate]);

  const anchorMonthLabel = useMemo(() => {
    const [y, m] = anchorDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(dt);
  }, [anchorDate]);

  const onSubmitBlock = async (values: BlockFormValues) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setSubmittingBlock(true);
    try {
      const chosenRoom = roomTypes.find((r) => r.id === values.roomTypeId);
      await createBlockedSchedule(actor, {
        scope: values.scope,
        roomTypeId: values.scope === 'ROOM' ? values.roomTypeId : undefined,
        roomTypeName: values.scope === 'ROOM' ? chosenRoom?.name : undefined,
        startDate: values.startDate,
        endDate: values.endDate,
        startTime: values.startTime,
        endTime: values.endTime,
        reason: values.reason,
      });
      notify('Unavailable schedule blocked', 'success', `${values.startDate} to ${values.endDate}`);
      setBlockModalOpen(false);
      reset();
    } catch (err) {
      notify('Failed to block schedule', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmittingBlock(false);
    }
  };

  const handleRemoveBlock = async (block: BlockedSchedule) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    try {
      await deleteBlockedSchedule(actor, block);
      notify('Schedule block removed', 'success');
    } catch (err) {
      notify('Failed to remove block', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const todayStr = getColomboDateStr();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2
            className="text-2xl sm:text-3xl font-semibold text-[#1C2420]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Centralized Villa Calendar
          </h2>
          <p className="text-sm text-[#6E6C63] mt-0.5">
            Daily, weekly, and monthly overview across Events, Photoshoots, Rooms, and Blocks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex p-1 bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                  view === v
                    ? 'bg-white text-[#1C2420] shadow-xs'
                    : 'text-[#6E6C63] hover:text-[#1C2420]'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              reset({
                scope: 'FULL_VILLA',
                roomTypeId: roomTypes[0]?.id || '',
                startDate: anchorDate,
                endDate: anchorDate,
                startTime: '00:00',
                endTime: '23:59',
                reason: '',
              });
              setBlockModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Block Dates / Times</span>
          </button>
        </div>
      </div>

      {/* Controls & Category Toggles */}
      <div className="bg-white border border-[#E2DFD5] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg border border-[#E2DFD5] hover:bg-[#F7F6F2]"
            aria-label="Previous period"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchorDate(todayStr)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E2DFD5] hover:bg-[#F7F6F2]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="p-2 rounded-lg border border-[#E2DFD5] hover:bg-[#F7F6F2]"
            aria-label="Next period"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <h3 className="text-base font-semibold text-[#1C2420] ml-2">
            {view === 'day' ? formatColomboDate(anchorDate) : anchorMonthLabel}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showEvents}
              onChange={(e) => setShowEvents(e.target.checked)}
              className="rounded"
            />
            <span className="w-2.5 h-2.5 rounded-xs bg-[#183D2D]" />
            <span>Events</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showShoots}
              onChange={(e) => setShowShoots(e.target.checked)}
              className="rounded"
            />
            <span className="w-2.5 h-2.5 rounded-xs bg-[#B45309]" />
            <span>Shoots</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showRooms}
              onChange={(e) => setShowRooms(e.target.checked)}
              className="rounded"
            />
            <span className="w-2.5 h-2.5 rounded-xs bg-[#1D4ED8]" />
            <span>Rooms</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showBlocks}
              onChange={(e) => setShowBlocks(e.target.checked)}
              className="rounded"
            />
            <span className="w-2.5 h-2.5 rounded-xs bg-[#B91C1C]" />
            <span>Blocked</span>
          </label>
        </div>
      </div>

      {/* MONTHLY VIEW */}
      {view === 'month' && (
        <div className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 bg-[#F7F6F2] border-b border-[#E2DFD5] text-xs font-medium text-[#6E6C63]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="px-3 py-2.5 text-center">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-[#E2DFD5]">
            {monthDays.map((dayStr) => {
              const inCurrentMonth = dayStr.slice(0, 7) === anchorDate.slice(0, 7);
              const isToday = dayStr === todayStr;
              const dayItems = getItemsForDate(dayStr);

              return (
                <div
                  key={dayStr}
                  className={`min-h-[115px] p-2 flex flex-col gap-1 ${
                    inCurrentMonth ? 'bg-white' : 'bg-[#F7F6F2]/60 text-[#6E6C63]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setAnchorDate(dayStr);
                        setView('day');
                      }}
                      className={`w-6 h-6 rounded-full text-xs font-mono flex items-center justify-center ${
                        isToday
                          ? 'bg-[#183D2D] text-white font-semibold'
                          : 'hover:bg-[#EFEDE6]'
                      }`}
                    >
                      {Number(dayStr.slice(8, 10))}
                    </button>
                    {dayItems.length > 0 && (
                      <span className="text-[10px] font-mono text-[#6E6C63]">
                        {dayItems.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[84px]">
                    {dayItems.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => {
                          if (it.booking) setDetailBooking(it.booking);
                        }}
                        className={`w-full text-left px-1.5 py-1 rounded border text-[11px] leading-tight truncate ${KIND_STYLES[it.kind]}`}
                        title={`${it.timeLabel} · ${it.title}`}
                      >
                        <span className="font-mono">{it.timeLabel}</span> · {it.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEEKLY VIEW */}
      {view === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((dayStr) => {
            const isToday = dayStr === todayStr;
            const dayItems = getItemsForDate(dayStr);
            return (
              <div
                key={dayStr}
                className={`bg-white border rounded-xl p-3 min-h-[260px] flex flex-col ${
                  isToday ? 'border-[#183D2D]' : 'border-[#E2DFD5]'
                }`}
              >
                <div className="pb-2 mb-2 border-b border-[#E2DFD5] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1C2420]">
                    {formatColomboDate(dayStr)}
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-medium text-[#183D2D]">Today</span>
                  )}
                </div>

                {dayItems.length === 0 ? (
                  <p className="text-xs text-[#6E6C63] py-4 text-center">Open</p>
                ) : (
                  <div className="space-y-2">
                    {dayItems.map((it) => (
                      <div
                        key={it.id}
                        onClick={() => it.booking && setDetailBooking(it.booking)}
                        className={`p-2 rounded-lg border text-xs cursor-pointer ${KIND_STYLES[it.kind]}`}
                      >
                        <p className="font-mono text-[11px]">{it.timeLabel}</p>
                        <p className="font-medium mt-0.5 break-words">{it.title}</p>
                        {it.block && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveBlock(it.block!);
                            }}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] underline"
                          >
                            <Trash2 className="w-3 h-3" /> Unblock
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DAILY VIEW */}
      {view === 'day' && (
        <div className="bg-white border border-[#E2DFD5] rounded-xl p-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#E2DFD5]">
            <h3 className="text-base font-semibold text-[#1C2420]">
              Schedule for {formatColomboDate(anchorDate)}
            </h3>
            <span className="text-xs font-mono text-[#6E6C63]">
              {getItemsForDate(anchorDate).length} scheduled items
            </span>
          </div>

          {getItemsForDate(anchorDate).length === 0 ? (
            <p className="text-sm text-[#6E6C63] py-10 text-center">
              No bookings or blocked periods for this date.
            </p>
          ) : (
            <div className="divide-y divide-[#E2DFD5] mt-2">
              {getItemsForDate(anchorDate).map((it) => (
                <div
                  key={it.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`px-2 py-1 rounded border text-xs font-mono shrink-0 ${KIND_STYLES[it.kind]}`}
                    >
                      {it.kind}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-[#1C2420]">{it.title}</p>
                      <p className="text-xs font-mono text-[#6E6C63] mt-0.5">
                        {it.timeLabel} {it.status ? `· ${it.status}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {it.booking && (
                      <button
                        type="button"
                        onClick={() => setDetailBooking(it.booking!)}
                        className="px-3 py-1.5 text-xs font-medium text-[#183D2D] bg-[#EEF3F0] rounded-lg"
                      >
                        View Booking
                      </button>
                    )}
                    {it.block && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBlock(it.block!)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove Block
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Blocked Schedules Table */}
      {blockedSchedules.length > 0 && (
        <div className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E2DFD5]">
            <h3 className="text-sm font-semibold text-[#1C2420]">
              Blocked Dates &amp; Maintenance Windows ({blockedSchedules.length})
            </h3>
          </div>
          <div className="divide-y divide-[#E2DFD5]">
            {blockedSchedules.map((b) => (
              <div
                key={b.id}
                className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-[#B91C1C]">
                    {b.scope}
                    {b.roomTypeName ? ` (${b.roomTypeName})` : ''}
                  </span>
                  <span className="mx-2 text-[#CDC9BC]">·</span>
                  <span className="font-mono">
                    {b.startDate} {b.startTime} → {b.endDate} {b.endTime}
                  </span>
                  <p className="text-[#6E6C63] mt-0.5">{b.reason}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveBlock(b)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#B91C1C] hover:underline self-start sm:self-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Block Dates Modal */}
      {blockModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#E2DFD5] rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-start justify-between pb-3 border-b border-[#E2DFD5]">
              <div>
                <h3 className="text-base font-semibold text-[#1C2420]">
                  Block Unavailable Dates / Times
                </h3>
                <p className="text-xs text-[#6E6C63]">
                  Prevents staff from creating conflicting bookings during this window.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBlockModalOpen(false)}
                className="text-[#6E6C63] hover:text-[#1C2420]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmitBlock)} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                  Block Scope
                </label>
                <select
                  {...register('scope')}
                  className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm"
                >
                  <option value="FULL_VILLA">Full Villa (All Bookings)</option>
                  <option value="EVENT_GROUNDS">Event Grounds Only</option>
                  <option value="SHOOT_GROUNDS">Photoshoot Grounds Only</option>
                  <option value="ROOM">Specific Room Type</option>
                </select>
              </div>

              {blockScope === 'ROOM' && (
                <div>
                  <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                    Select Room Type
                  </label>
                  <select
                    {...register('roomTypeId')}
                    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm"
                  >
                    {roomTypes
                      .filter((r) => !r.isArchived)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.roomCode} · {r.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    {...register('startDate')}
                    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    {...register('startTime')}
                    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    {...register('endDate')}
                    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-xs font-mono"
                  />
                  {errors.endDate && (
                    <p className="text-xs text-[#B91C1C] mt-1">{errors.endDate.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    {...register('endTime')}
                    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Reason</label>
                <input
                  type="text"
                  placeholder="Pool resurfacing, owner private stay..."
                  {...register('reason')}
                  className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm"
                />
                {errors.reason && (
                  <p className="text-xs text-[#B91C1C] mt-1">{errors.reason.message}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBlockModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-[#3D3F3A] bg-[#F7F6F2] border border-[#E2DFD5] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBlock}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#183D2D] rounded-lg disabled:opacity-50"
                >
                  {submittingBlock ? 'Blocking...' : 'Save Block'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BookingDetailModal
        booking={detailBooking}
        onClose={() => setDetailBooking(null)}
        onRecordPayment={
          detailBooking && detailBooking.data.status !== 'Cancelled'
            ? () => {
                const d = detailBooking.data;
                setPaymentTarget({
                  id: d.id,
                  bookingCode: d.bookingCode,
                  bookingType: detailBooking.category,
                  customerName: d.customerName,
                  totalPayment: d.totalPayment,
                  advancePayment: d.advancePayment,
                  duePayment: d.duePayment,
                });
                setDetailBooking(null);
              }
            : undefined
        }
      />

      <PaymentModal
        open={Boolean(paymentTarget)}
        booking={paymentTarget}
        onClose={() => setPaymentTarget(null)}
      />
    </div>
  );
};
