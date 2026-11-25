import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, googleAuthProvider } from "../lib/firebase";
import { subscribeAuthErrors } from "../lib/apiClient";
import {
  establishStaffSession,
  logStaffLogout,
  SUPER_ADMIN_EMAIL
} from "../services/villaService";
const AuthContext = createContext(null);
const AuthProvider = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [firebaseAuthenticated, setFirebaseAuthenticated] = useState(false);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [accessError, setAccessError] = useState(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState(30);
  const [inactivityWarningSeconds, setInactivityWarningSeconds] = useState(null);
  const lastActivityRef = useRef(Date.now());
  const loggedLoginUidRef = useRef(null);
  const sessionSeqRef = useRef(0);
  const verifyUserSession = useCallback(async (user, { forceRefreshToken = false } = {}) => {
    const seq = ++sessionSeqRef.current;
    if (!user) {
      loggedLoginUidRef.current = null;
      setInactivityWarningSeconds(null);
      setFirebaseAuthenticated(false);
      setFirebaseUser(null);
      setCurrentStaff(null);
      setSessionChecking(false);
      setAuthReady(true);
      return;
    }
    setFirebaseAuthenticated(true);
    setFirebaseUser(user);
    setSessionChecking(true);
    const email = user.email?.trim().toLowerCase() || "";
    if (!email || !user.emailVerified) {
      setCurrentStaff(null);
      setAccessError("Access Denied: A verified Google email address is required.");
      setSessionChecking(false);
      setAuthReady(true);
      return;
    }
    try {
      if (forceRefreshToken) {
        await user.getIdToken(true);
      }
      const shouldLogLogin = loggedLoginUidRef.current !== user.uid;
      const staffProfile = await establishStaffSession(shouldLogLogin);
      if (seq !== sessionSeqRef.current) return;
      if (!staffProfile || !staffProfile.isActive) {
        loggedLoginUidRef.current = null;
        setCurrentStaff(null);
        setAccessError("Access Denied: Your account is not active or authorized for villa operations.");
        return;
      }
      loggedLoginUidRef.current = user.uid;
      lastActivityRef.current = Date.now();
      setAccessError(null);
      setCurrentStaff(staffProfile);
    } catch (error) {
      if (seq !== sessionSeqRef.current) return;
      loggedLoginUidRef.current = null;
      setCurrentStaff(null);
      const message = error instanceof Error && error.message ? error.message : "Access Denied: Unable to verify authorized staff session.";
      setAccessError(message);
    } finally {
      if (seq === sessionSeqRef.current) {
        setSessionChecking(false);
        setAuthReady(true);
      }
    }
  }, []);
  const buildActorContext = useCallback(
    (authorizedEmails, adminEmails) => {
      if (!firebaseUser || !currentStaff || !currentStaff.isActive) {
        return null;
      }
      return {
        uid: firebaseUser.uid,
        email: currentStaff.email,
        name: currentStaff.name,
        role: currentStaff.role,
        authorizedEmails: authorizedEmails && authorizedEmails.length > 0 ? authorizedEmails : [SUPER_ADMIN_EMAIL, currentStaff.email],
        adminEmails: adminEmails && adminEmails.length > 0 ? adminEmails : currentStaff.adminEmails?.length ? currentStaff.adminEmails : [SUPER_ADMIN_EMAIL]
      };
    },
    [firebaseUser, currentStaff]
  );
  const logout = useCallback(
    async (reason = "manual") => {
      sessionSeqRef.current += 1;
      try {
        if (firebaseAuthenticated && firebaseUser && currentStaff && currentStaff.isActive) {
          await logStaffLogout(reason, timeoutMinutes);
        }
      } catch (error) {
        console.error("Failed to write staff logout audit log:", error);
      }
      await signOut(auth);
      loggedLoginUidRef.current = null;
      setInactivityWarningSeconds(null);
      setFirebaseAuthenticated(false);
      setFirebaseUser(null);
      setCurrentStaff(null);
      setSessionChecking(false);
      setAuthReady(true);
      if (reason === "timeout") {
        setAccessError("Your session expired due to inactivity. Please sign in again.");
      } else {
        setAccessError(null);
      }
    },
    [firebaseAuthenticated, firebaseUser, currentStaff, timeoutMinutes]
  );
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      void verifyUserSession(user);
    });
    return () => unsub();
  }, [verifyUserSession]);
  useEffect(() => {
    const unsub = subscribeAuthErrors(({ status, message }) => {
      if (status === 401 || status === 403) {
        loggedLoginUidRef.current = null;
        setCurrentStaff(null);
        setAccessError(message);
        if (status === 401) {
          void signOut(auth).catch(() => {});
        }
      }
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    if (!authReady || sessionChecking || !firebaseAuthenticated || !firebaseUser?.email || !currentStaff?.isActive) {
      return;
    }
    const emailKey = firebaseUser.email.trim().toLowerCase();
    const staffRef = doc(db, "staff", emailKey);
    const unsub = onSnapshot(
      staffRef,
      (snap) => {
        if (!snap.exists()) {
          loggedLoginUidRef.current = null;
          setCurrentStaff(null);
          setAccessError(`Access Denied: ${emailKey} has been removed from authorized villa staff.`);
          return;
        }
        const updated = { id: snap.id, ...snap.data() };
        if (!updated.isActive) {
          loggedLoginUidRef.current = null;
          setCurrentStaff(null);
          setAccessError(`Account Deactivated: ${emailKey} has been deactivated by the administrator.`);
          return;
        }
        setCurrentStaff((prev) => {
          if (!prev) return updated;
          if (
            prev.role === updated.role &&
            prev.name === updated.name &&
            prev.isActive === updated.isActive &&
            prev.slotNumber === updated.slotNumber
          ) {
            return prev;
          }
          return updated;
        });
      },
      (err) => {
        console.warn("Staff profile listener warning:", err.message);
      }
    );
    return () => unsub();
  }, [authReady, sessionChecking, firebaseAuthenticated, firebaseUser?.email, currentStaff?.isActive]);
  useEffect(() => {
    if (!currentStaff || !currentStaff.isActive) return;
    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      setInactivityWarningSeconds((prev) => prev !== null ? null : prev);
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, resetActivity, { passive: true }));
    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const limitMs = Math.max(5, timeoutMinutes) * 60 * 1e3;
      const warningThresholdMs = limitMs - 120 * 1e3;
      if (idleMs >= limitMs) {
        void logout("timeout").catch((error) => {
          console.error("Automatic sign-out failed:", error);
        });
      } else if (idleMs >= warningThresholdMs) {
        const remaining = Math.max(1, Math.ceil((limitMs - idleMs) / 1e3));
        setInactivityWarningSeconds(remaining);
      } else {
        setInactivityWarningSeconds(null);
      }
    }, 1e3);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetActivity));
      window.clearInterval(timer);
    };
  }, [currentStaff, timeoutMinutes, logout]);
  const extendSession = useCallback(() => {
    lastActivityRef.current = Date.now();
    setInactivityWarningSeconds(null);
  }, []);
  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setAccessError(null);
    try {
      const previousUid = auth.currentUser?.uid;
      const cred = await signInWithPopup(auth, googleAuthProvider);
      if (cred?.user && cred.user.uid === previousUid) {
        await verifyUserSession(cred.user, { forceRefreshToken: true });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sign-in failed.";
      if (!msg.includes("popup-closed-by-user")) {
        setAccessError(msg);
      }
    } finally {
      setSigningIn(false);
    }
  }, [verifyUserSession]);
  return <AuthContext.Provider
    value={{
      firebaseUser,
      firebaseAuthenticated,
      currentStaff,
      isAuthorizedStaff: Boolean(firebaseAuthenticated && currentStaff && currentStaff.isActive),
      authReady,
      sessionChecking,
      signingIn,
      accessError,
      inactivityWarningSeconds,
      signInWithGoogle,
      logout,
      extendSession,
      setTimeoutMinutes,
      buildActorContext
    }}
  >
      {children}
    </AuthContext.Provider>;
};
function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
export {
  AuthProvider,
  useAuth
};
