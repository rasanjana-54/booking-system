import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { StaffMember } from '../types/villa';
import {
  ActorContext,
  establishStaffSession,
  logStaffLogout,
  SUPER_ADMIN_EMAIL,
} from '../services/villaService';

interface AuthContextValue {
  firebaseUser: User | null;
  currentStaff: StaffMember | null;
  authReady: boolean;
  signingIn: boolean;
  accessError: string | null;
  inactivityWarningSeconds: number | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  logout: (reason?: 'manual' | 'timeout') => Promise<void>;
  extendSession: () => void;
  setTimeoutMinutes: (mins: number) => void;
  buildActorContext: (authorizedEmails?: string[], adminEmails?: string[]) => ActorContext | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentStaff, setCurrentStaff] = useState<StaffMember | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(30);
  const [inactivityWarningSeconds, setInactivityWarningSeconds] = useState<number | null>(null);

  const lastActivityRef = useRef<number>(Date.now());
  const loggedLoginUidRef = useRef<string | null>(null);

  const buildActorContext = useCallback(
    (authorizedEmails?: string[], adminEmails?: string[]): ActorContext | null => {
      if (!firebaseUser || !currentStaff) return null;
      return {
        uid: firebaseUser.uid,
        email: currentStaff.email,
        name: currentStaff.name,
        role: currentStaff.role,
        authorizedEmails:
          authorizedEmails && authorizedEmails.length > 0
            ? authorizedEmails
            : [SUPER_ADMIN_EMAIL, currentStaff.email],
        adminEmails:
          adminEmails && adminEmails.length > 0
            ? adminEmails
            : currentStaff.adminEmails?.length
            ? currentStaff.adminEmails
            : [SUPER_ADMIN_EMAIL],
      };
    },
    [firebaseUser, currentStaff]
  );

  const logout = useCallback(
    async (reason: 'manual' | 'timeout' = 'manual') => {
      try {
        if (firebaseUser && currentStaff && currentStaff.isActive) {
          await logStaffLogout(reason, timeoutMinutes);
        }
      } catch {
        // Proceed with sign-out even if audit log fails
      } finally {
        loggedLoginUidRef.current = null;
        setInactivityWarningSeconds(null);
        setCurrentStaff(null);
        await signOut(auth);
      }
    },
    [firebaseUser, currentStaff, timeoutMinutes]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAccessError(null);

      if (!user) {
        setCurrentStaff(null);
        setAuthReady(true);
        return;
      }

      const email = user.email?.trim().toLowerCase() || '';
      if (!email || !user.emailVerified) {
        setCurrentStaff(null);
        setAccessError('A verified email account is required to access this portal.');
        setAuthReady(true);
        return;
      }

      try {
        const shouldLogLogin = loggedLoginUidRef.current !== user.uid;
        const staffProfile = await establishStaffSession(shouldLogLogin);
        loggedLoginUidRef.current = user.uid;
        lastActivityRef.current = Date.now();
        setCurrentStaff(staffProfile);
      } catch (err) {
        setCurrentStaff(null);
        setAccessError(
          err instanceof Error
            ? err.message
            : 'Unable to verify staff authorization.'
        );
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // Inactivity tracking & auto-logout
  useEffect(() => {
    if (!currentStaff || !currentStaff.isActive) return;

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      setInactivityWarningSeconds((prev) => (prev !== null ? null : prev));
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, resetActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const limitMs = Math.max(5, timeoutMinutes) * 60 * 1000;
      const warningThresholdMs = limitMs - 120 * 1000;

      if (idleMs >= limitMs) {
        logout('timeout');
      } else if (idleMs >= warningThresholdMs) {
        const remaining = Math.max(1, Math.ceil((limitMs - idleMs) / 1000));
        setInactivityWarningSeconds(remaining);
      } else {
        setInactivityWarningSeconds(null);
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetActivity));
      window.clearInterval(timer);
    };
  }, [currentStaff, timeoutMinutes, logout]);

  const extendSession = useCallback(() => {
    lastActivityRef.current = Date.now();
    setInactivityWarningSeconds(null);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setSigningIn(true);
    setAccessError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Sign-in failed.';
      setAccessError(msg);
    } finally {
      setSigningIn(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        currentStaff,
        authReady,
        signingIn,
        accessError,
        inactivityWarningSeconds,
        signInWithEmail,
        logout,
        extendSession,
        setTimeoutMinutes,
        buildActorContext,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
