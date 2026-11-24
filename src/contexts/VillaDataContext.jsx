import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  fetchBootstrapData,
  subscribeDataRefresh,
  SUPER_ADMIN_EMAIL
} from "../services/villaService";
const VillaDataContext = createContext(null);
const VillaDataProvider = ({ children }) => {
  const { authReady, currentStaff, setTimeoutMinutes } = useAuth();
  const [events, setEvents] = useState([]);
  const [shoots, setShoots] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [roomBookings, setRoomBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [blockedSchedules, setBlockedSchedules] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
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
          err instanceof Error ? err.message : "Unable to sync villa operations data."
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
    }, 3e4);
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
      return staffMembers.filter((s) => s.isActive && s.role === "ADMIN").map((s) => s.email);
    }
    return [SUPER_ADMIN_EMAIL];
  }, [settings, staffMembers]);
  const currency = settings?.currency || "LKR";
  return <VillaDataContext.Provider
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
      refreshData: () => loadAllData(true)
    }}
  >
      {children}
    </VillaDataContext.Provider>;
};
function useVillaData() {
  const ctx = useContext(VillaDataContext);
  if (!ctx) throw new Error("useVillaData must be used inside VillaDataProvider");
  return ctx;
}
export {
  VillaDataProvider,
  useVillaData
};
