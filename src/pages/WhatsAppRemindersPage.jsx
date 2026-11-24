import { useCallback, useEffect, useState } from "react";
import { AlertCircle, MessageCircle, RefreshCw, RotateCcw } from "lucide-react";
import { formatColomboDate, formatColomboTimestamp } from "../utils/colomboTime";
import { fetchWhatsAppReminders, retryWhatsAppReminder } from "../services/villaService";
import { StatusBadge } from "../components/StatusBadge";
function maskPhone(phone) {
  if (!phone) return "\u2014";
  return `\u2022\u2022\u2022\u2022\u2022\u2022${phone.slice(-4)}`;
}
const WhatsAppRemindersPage = () => {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [error, setError] = useState(null);
  const loadReminders = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setReminders(await fetchWhatsAppReminders());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load reminder history."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);
  const handleRetry = async (reminderId) => {
    setRetryingId(reminderId);
    setError(null);
    try {
      await retryWhatsAppReminder(reminderId);
      await loadReminders(true);
    } catch (retryError) {
      setError(
        retryError instanceof Error ? retryError.message : "Unable to retry this reminder."
      );
    } finally {
      setRetryingId(null);
    }
  };
  return <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
    className="text-2xl sm:text-3xl font-semibold text-[#1C2420]"
    style={{ fontFamily: "var(--font-display)" }}
  >
            WhatsApp Photoshoot Reminders
          </h2>
          <p className="mt-1 text-sm text-[#6E6C63]">
            Weekly reminder history and delivery status for assigned villa staff.
          </p>
        </div>
        <button
    type="button"
    onClick={() => void loadReminders(true)}
    disabled={refreshing || loading}
    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#E2DFD5] bg-white px-3.5 py-2 text-sm font-medium text-[#3D3F3A] hover:bg-[#F7F6F2] disabled:opacity-50"
  >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="rounded-lg border border-[#D6E4DC] bg-[#EEF3F0] px-4 py-3 text-xs text-[#315D48]">
        The automated job runs every Sunday at 12:00 PM Sri Lanka time. Messages require an
        approved Meta WhatsApp template.
      </div>

      {error && <div className="flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>}

      <div className="overflow-hidden rounded-xl border border-[#E2DFD5] bg-white">
        {loading ? <div className="p-8 text-center text-sm text-[#6E6C63]">Loading reminder history…</div> : reminders.length === 0 ? <div className="flex flex-col items-center p-10 text-center">
            <MessageCircle className="h-8 w-8 text-[#8A897F]" />
            <p className="mt-3 text-sm font-medium text-[#3D3F3A]">No reminder activity yet</p>
            <p className="mt-1 text-xs text-[#6E6C63]">
              Reminder attempts will appear here after the weekly job runs.
            </p>
          </div> : <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-[#E2DFD5] bg-[#F7F6F2] text-xs text-[#6E6C63]">
                <tr>
                  <th className="px-4 py-3 font-medium">Booking / Client</th>
                  <th className="px-4 py-3 font-medium">Photoshoot Date</th>
                  <th className="px-4 py-3 font-medium">Assigned Staff</th>
                  <th className="px-4 py-3 font-medium">WhatsApp</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Sent At</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEECE5]">
                {reminders.map((reminder) => <tr key={reminder.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1C2420]">{reminder.clientName}</p>
                      <p className="mt-0.5 font-mono text-xs text-[#6E6C63]">
                        {reminder.bookingCode}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[#3D3F3A]">
                      {formatColomboDate(reminder.shootDate)}
                      <p className="mt-0.5 text-[11px] text-[#8A897F]">
                        Week of {formatColomboDate(reminder.periodId)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[#3D3F3A]">{reminder.assignedStaffName || "\u2014"}</p>
                      {reminder.assignedStaffId && <p className="mt-0.5 text-xs text-[#6E6C63]">
                          {reminder.assignedStaffId}
                        </p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#6E6C63]">
                      {maskPhone(reminder.staffWhatsAppNumber)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={reminder.status} />
                      {reminder.deliveryStatus && <p className="mt-1 text-[11px] text-[#6E6C63]">
                          Delivery: {reminder.deliveryStatus}
                        </p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#6E6C63]">
                      {formatColomboTimestamp(reminder.sentAt)}
                    </td>
                    <td className="max-w-[240px] px-4 py-3 text-xs text-[#B91C1C]">
                      {reminder.failureReason || reminder.skipReason || "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      {reminder.status === "FAILED" && <button
    type="button"
    onClick={() => void handleRetry(reminder.id)}
    disabled={retryingId === reminder.id}
    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2DFD5] px-2.5 py-1.5 text-xs font-medium text-[#183D2D] hover:bg-[#EEF3F0] disabled:opacity-50"
  >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {retryingId === reminder.id ? "Retrying\u2026" : "Retry"}
                        </button>}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>}
      </div>
      <p className="text-xs text-[#8A897F]">Showing the latest 200 reminder records.</p>
    </div>;
};
export {
  WhatsAppRemindersPage
};
