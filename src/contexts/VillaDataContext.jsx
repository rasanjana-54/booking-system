import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { db } from "../lib/firebase";
import { timestampToMs } from "../utils/colomboTime";
import {
  fetchBootstrapData,
  subscribeDataRefresh,
  SUPER_ADMIN_EMAIL
} from "../services/villaService";
const VillaDataContext = createContext(null);
function sortEvents(list) {
  return [...list].sort((a, b) => (b.eventDate || "").localeCompare(a.eventDate || ""));
}
function sortShoots(list) {
  return [...list].sort((a, b) => (b.shootDate || "").localeCompare(a.shootDate || ""));
}
function sortRoomTypes(list) {
  return [...list].sort((a, b) => (a.roomCode || "").localeCompare(b.roomCode || ""));
}
function sortRoomBookings(list) {
  return [...list].sort((a, b) => (b.checkInDate || "").localeCompare(a.checkInDate || ""));
}
function sortPayments(list) {
  return [...list].sort((a, b) => timestampToMs(b.createdAt) - timestampToMs(a.createdAt));
}
function sortBlockedSchedules(list) {
  return [...list].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
}
function sortStaff(list) {
  return [...list].sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0));
}
function sortAuditLogs(list) {
  return [...list].sort((a, b) => timestampToMs(b.timestamp) - timestampToMs(a.timestamp));
}
const VillaDataProvider = ({ children }) => {
  const {
    authReady,
    sessionChecking,
    firebaseAuthenticated,
    currentStaff,
    setTimeoutMinutes
  } = useAuth();
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
  const [realtimeDegraded, setRealtimeDegraded] = useState(false);
  const bootstrapSeqRef = useRef(0);
  const isActiveSession = Boolean(
    authReady && !sessionChecking && firebaseAuthenticated && currentStaff && currentStaff.isActive
  );
  const loadAllData = useCallback(
    async (silent = false) => {
      const seq = ++bootstrapSeqRef.current;
      if (!isActiveSession) {
        setEvents([]);
        setShoots([]);
        setRoomTypes([]);
        setRoomBookings([]);
        setPayments([]);
        setBlockedSchedules([]);
        setStaffMembers([]);
        setAuditLogs([]);
        setSettings(null);
        setDataError(null);
        setLoading(false);
        return;
      }
      if (!silent) {
        setLoading(true);
      }
      setDataError(null);
      try {
        const data = await fetchBootstrapData();
        if (seq !== bootstrapSeqRef.current) return;
        setEvents(sortEvents(data.events || []));
        setShoots(sortShoots(data.shoots || []));
        setRoomTypes(sortRoomTypes(data.roomTypes || []));
        setRoomBookings(sortRoomBookings(data.roomBookings || []));
        setPayments(sortPayments(data.payments || []));
        setBlockedSchedules(sortBlockedSchedules(data.blockedSchedules || []));
        setStaffMembers(sortStaff(data.staffMembers || []));
        setAuditLogs(sortAuditLogs(data.auditLogs || []));
        setSettings(data.settings || null);
        if (data.settings?.inactivityTimeoutMinutes) {
          setTimeoutMinutes(data.settings.inactivityTimeoutMinutes);
        }
      } catch (err) {
        if (seq !== bootstrapSeqRef.current) return;
        setDataError(
          err instanceof Error ? err.message : "Unable to sync villa operations data."
        );
      } finally {
        if (seq === bootstrapSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [isActiveSession, setTimeoutMinutes]
  );
  useEffect(() => {
    void loadAllData(false);
  }, [loadAllData]);
  useEffect(() => {
    if (!isActiveSession || !currentStaff) {
      setRealtimeDegraded(false);
      return;
    }
    let active = true;
    const unsubscribers = [];
    const onListenerError = (collectionLabel) => (err) => {
      if (!active) return;
      console.warn(`Realtime listener warning (${collectionLabel}):`, err?.message || err);
      setRealtimeDegraded(true);
    };
    const subscribeCollection = (name, sorter, setter) => {
      const unsub = onSnapshot(
        collection(db, name),
        (snapshot) => {
          if (!active) return;
          const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          setter(sorter(rows));
          setDataError(null);
          setLoading(false);
        },
        onListenerError(name)
      );
      unsubscribers.push(unsub);
    };
    subscribeCollection("events", sortEvents, setEvents);
    subscribeCollection("shoots", sortShoots, setShoots);
    subscribeCollection("room_types", sortRoomTypes, setRoomTypes);
    subscribeCollection("room_bookings", sortRoomBookings, setRoomBookings);
    subscribeCollection("payments", sortPayments, setPayments);
    subscribeCollection("blocked_schedules", sortBlockedSchedules, setBlockedSchedules);
    const settingsUnsub = onSnapshot(
      doc(db, "villa_settings", "general"),
      (snap) => {
        if (!active) return;
        if (snap.exists()) {
          const next = { id: snap.id, ...snap.data() };
          setSettings(next);
          if (next.inactivityTimeoutMinutes) {
            setTimeoutMinutes(next.inactivityTimeoutMinutes);
          }
        }
      },
      onListenerError("villa_settings")
    );
    unsubscribers.push(settingsUnsub);
    if (currentStaff.role === "ADMIN") {
      const emailLower = currentStaff.email.trim().toLowerCase();
      const staffUnsub = onSnapshot(
        query(collection(db, "staff"), where("adminEmails", "array-contains", emailLower)),
        (snapshot) => {
          if (!active) return;
          const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          setStaffMembers(sortStaff(rows));
        },
        onListenerError("staff")
      );
      const logsUnsub = onSnapshot(
        query(collection(db, "audit_logs"), where("adminEmails", "array-contains", emailLower)),
        (snapshot) => {
          if (!active) return;
          const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          setAuditLogs(sortAuditLogs(rows));
        },
        onListenerError("audit_logs")
      );
      unsubscribers.push(staffUnsub, logsUnsub);
    } else {
      setStaffMembers([]);
      setAuditLogs([]);
    }
    return () => {
      active = false;
      unsubscribers.forEach((unsub) => {
        try {
          unsub();
        } catch {
        }
      });
    };
  }, [isActiveSession, currentStaff, setTimeoutMinutes]);
  useEffect(() => {
    if (!isActiveSession) return;
    const unsub = subscribeDataRefresh(() => {
      void loadAllData(true);
    });
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === "visible") {
        void loadAllData(true);
      }
    };
    window.addEventListener("focus", handleVisibilityOrOnline);
    window.addEventListener("online", handleVisibilityOrOnline);
    document.addEventListener("visibilitychange", handleVisibilityOrOnline);
    const pollMs = realtimeDegraded ? 1e4 : 3e4;
    const intervalId = window.setInterval(() => {
      void loadAllData(true);
    }, pollMs);
    return () => {
      unsub();
      window.removeEventListener("focus", handleVisibilityOrOnline);
      window.removeEventListener("online", handleVisibilityOrOnline);
      document.removeEventListener("visibilitychange", handleVisibilityOrOnline);
      window.clearInterval(intervalId);
    };
  }, [isActiveSession, realtimeDegraded, loadAllData]);
  const authorizedEmails = useMemo(() => {
    if (settings?.authorizedEmails?.length) return settings.authorizedEmails;
    if (staffMembers.length) {
      return staffMembers.filter((s) => s.isActive).map((s) => s.email);
    }
    return currentStaff ? [SUPER_ADMIN_EMAIL, currentStaff.email] : [];
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
