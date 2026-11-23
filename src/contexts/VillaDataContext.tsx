import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AuditLog,
  BlockedSchedule,
  CurrencyCode,
  EventBooking,
  Payment,
  RoomBooking,
  RoomType,
  ShootBooking,
  StaffMember,
  VillaSettings,
} from '../types/villa';
import { useAuth } from './AuthContext';
import {
  fetchBootstrapData,
  subscribeDataRefresh,
  SUPER_ADMIN_EMAIL,
} from '../services/villaService';

interface VillaDataContextValue {
  events: EventBooking[];
  shoots: ShootBooking[];
  roomTypes: RoomType[];
  roomBookings: RoomBooking[];
  payments: Payment[];
  blockedSchedules: BlockedSchedule[];
  staffMembers: StaffMember[];
  auditLogs: AuditLog[];
  settings: VillaSettings | null;
  currency: CurrencyCode;
  loading: boolean;
  dataError: string | null;
  authorizedEmails: string[];
  adminEmails: string[];
  refreshData: () => Promise<void>;
}

const VillaDataContext = createContext<VillaDataContextValue | null>(null);

export const VillaDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authReady, currentStaff, setTimeoutMinutes } = useAuth();

  const [events, setEvents] = useState<EventBooking[]>([]);
  const [shoots, setShoots] = useState<ShootBooking[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomBookings, setRoomBookings] = useState<RoomBooking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [blockedSchedules, setBlockedSchedules] = useState<BlockedSchedule[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<VillaSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const loadAllData = useCallback(
    async (silent = false) => {
      if (!authReady || !currentStaff || !currentStaff.isActive) {
        setEvents([]);
        setShoots([]);
        setRoomTypes([]);
        setRoomBookings([]);
        setPayments([]);
        setBlockedSchedules([]);
        setStaffMembers([]);
        setAuditLogs([]);
        setSettings(null);
        setLoading(false);
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      setDataError(null);

      try {
        const data = await fetchBootstrapData();
        setEvents(data.events);
        setShoots(data.shoots);
        setRoomTypes(data.roomTypes);
        setRoomBookings(data.roomBookings);
        setPayments(data.payments);
        setBlockedSchedules(data.blockedSchedules);
        setStaffMembers(data.staffMembers);
        setAuditLogs(data.auditLogs);
        setSettings(data.settings);
        if (data.settings?.inactivityTimeoutMinutes) {
          setTimeoutMinutes(data.settings.inactivityTimeoutMinutes);
        }
      } catch (err) {
        setDataError(
          err instanceof Error ? err.message : 'Unable to sync villa operations data.'
        );
      } finally {
        setLoading(false);
      }
    },
    [authReady, currentStaff, setTimeoutMinutes]
  );

  useEffect(() => {
    loadAllData(false);
  }, [loadAllData]);

  useEffect(() => {
    if (!authReady || !currentStaff || !currentStaff.isActive) return;

    const unsub = subscribeDataRefresh(() => {
      loadAllData(true);
    });

    const intervalId = window.setInterval(() => {
      loadAllData(true);
    }, 30000);

    return () => {
      unsub();
      window.clearInterval(intervalId);
    };
  }, [authReady, currentStaff, loadAllData]);

  const authorizedEmails = useMemo(() => {
    if (settings?.authorizedEmails?.length) return settings.authorizedEmails;
    if (staffMembers.length) {
      return staffMembers.filter((s) => s.isActive).map((s) => s.email);
    }
    return currentStaff ? [SUPER_ADMIN_EMAIL, currentStaff.email] : [SUPER_ADMIN_EMAIL];
  }, [settings, staffMembers, currentStaff]);

  const adminEmails = useMemo(() => {
    if (settings?.adminEmails?.length) return settings.adminEmails;
    if (staffMembers.length) {
      return staffMembers
        .filter((s) => s.isActive && s.role === 'ADMIN')
        .map((s) => s.email);
    }
    return [SUPER_ADMIN_EMAIL];
  }, [settings, staffMembers]);

  const currency: CurrencyCode = settings?.currency || 'LKR';

  return (
    <VillaDataContext.Provider
      value={{
        events,
        shoots,
        roomTypes,
        roomBookings,
        payments,
        blockedSchedules,
        staffMembers,
        auditLogs,
        settings,
        currency,
        loading,
        dataError,
        authorizedEmails,
        adminEmails,
        refreshData: () => loadAllData(true),
      }}
    >
      {children}
    </VillaDataContext.Provider>
  );
};

export function useVillaData(): VillaDataContextValue {
  const ctx = useContext(VillaDataContext);
  if (!ctx) throw new Error('useVillaData must be used inside VillaDataProvider');
  return ctx;
}
