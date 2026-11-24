import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useVillaData } from '../contexts/VillaDataContext';
import { formatColomboTimestamp } from '../utils/colomboTime';

export const AuditLogsPage: React.FC = () => {
  const { auditLogs } = useVillaData();
  const [search, setSearch] = useState('');
  const [recordFilter, setRecordFilter] = useState('ALL');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (recordFilter !== 'ALL' && log.recordType !== recordFilter) return false;
      if (q) {
        const hay = `${log.userName} ${log.userEmail} ${log.action} ${log.recordId} ${log.summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, search, recordFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-2xl sm:text-3xl font-semibold text-[#1C2420]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Security &amp; Operations Audit Logs
        </h2>
        <p className="text-sm text-[#6E6C63] mt-0.5">
          Immutable, chronological trail of authentication, booking changes, and staff activity.
        </p>
      </div>

      <div className="bg-white border border-[#E2DFD5] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-[#6E6C63] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff email, action, record ID, or summary..."
            className="w-full rounded-lg border border-[#CDC9BC] pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
          />
        </div>

        <select
          value={recordFilter}
          onChange={(e) => setRecordFilter(e.target.value)}
          className="rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
        >
          <option value="ALL">All Record Types</option>
          <option value="AUTH">Authentication</option>
          <option value="EVENT">Events</option>
          <option value="SHOOT">Photoshoots</option>
          <option value="ROOM">Room Bookings</option>
          <option value="ROOM_TYPE">Room Types</option>
          <option value="PAYMENT">Payments</option>
          <option value="CALENDAR">Calendar Blocks</option>
          <option value="STAFF">Staff Accounts</option>
          <option value="SETTINGS">Settings</option>
        </select>
      </div>

      <div className="bg-white border border-[#E2DFD5] rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-[#1C2420]">No audit log entries</p>
            <p className="text-xs text-[#6E6C63] mt-1">
              Operational events will be logged here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F7F6F2] text-xs text-[#6E6C63] border-b border-[#E2DFD5]">
                <tr>
                  <th className="px-5 py-3 font-medium">Timestamp (Asia/Colombo)</th>
                  <th className="px-5 py-3 font-medium">Staff Member</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Record</th>
                  <th className="px-5 py-3 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD5]">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F7F6F2]/70">
                    <td className="px-5 py-3 text-xs font-mono whitespace-nowrap text-[#6E6C63]">
                      {formatColomboTimestamp(log.timestamp)}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <p className="font-medium text-[#1C2420]">{log.userName}</p>
                      <p className="font-mono text-[#6E6C63]">{log.userEmail}</p>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-[#183D2D]">
                      {log.action}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono">
                      {log.recordType} · {log.recordId}
                    </td>
                    <td className="px-5 py-3 text-xs text-[#3D3F3A] max-w-md">
                      {log.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
