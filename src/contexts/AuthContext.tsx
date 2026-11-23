import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { StaffMember } from '../types/villa';
import {
  ActorContext,
  establishStaffSession,
  logStaffLogout,
  SUPER_ADMIN_EMAIL,
} from '../services/villaService';

interface AuthContextValue {
  firebaseUser: User | null;
  firebaseAuthenticated: boolean;
  currentStaff: StaffMember | null;
  authReady: boolean;
  signingIn: boolean;
  accessError: string | null;
  inactivityWarningSeconds: number | null;
  signInWithGoogle: () => Promise<void>;
  logout: (reason?: 'manual' | 'timeout') => Promise<void>;
  extendSession: () => void;
  setTimeoutMinutes: (mins: number) => void;
  buildActorContext: (authorizedEmails?: string[], adminEmails?: string[]) => ActorContext | null;
}

export const DEFAULT_STAFF: StaffMember = {
  id: 'rnimsara54@gmail.com',
  email: SUPER_ADMIN_EMAIL,
  name: 'Villa Administrator',
  role: 'ADMIN',
  slotNumber: 1,
  isActive: true,
  adminEmails: [SUPER_ADMIN_EMAIL],
  createdBy: 'admin_local',
};

const MOCK_FIREBASE_USER = {
  uid: 'admin_local',
  email: SUPER_ADMIN_EMAIL,
  displayName: 'Villa Administrator',
  emailVerified: true,
} as unknown as User;

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(MOCK_FIREBASE_USER);
  const [firebaseAuthenticated, setFirebaseAuthenticated] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<StaffMember | null>(DEFAULT_STAFF);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(30);
  const [inactivityWarningSeconds, setInactivityWarningSeconds] = useState<number | null>(null);

  const lastActivityRef = useRef<number>(Date.now());
  const loggedLoginUidRef = useRef<string | null>(null);

  const buildActorContext = useCallback(
    (authorizedEmails?: string[], adminEmails?: string[]): ActorContext | null => {
      const activeUser = firebaseUser || MOCK_FIREBASE_USER;
      const activeStaff = currentStaff || DEFAULT_STAFF;
      return {
        uid: activeUser.uid,
        email: activeStaff.email,
        name: activeStaff.name,
        role: activeStaff.role,
        authorizedEmails:
          authorizedEmails && authorizedEmails.length > 0
            ? authorizedEmails
            : [SUPER_ADMIN_EMAIL, activeStaff.email],
        adminEmails:
          adminEmails && adminEmails.length > 0
            ? adminEmails
            : activeStaff.adminEmails?.length
            ? activeStaff.adminEmails
            : [SUPER_ADMIN_EMAIL],
      };
    },
    [firebaseUser, currentStaff]
  );

  const logout = useCallback(
    async (reason: 'manual' | 'timeout' = 'manual') => {
      try {
        if (firebaseAuthenticated && firebaseUser && currentStaff && currentStaff.isActive) {
          await logStaffLogout(reason, timeoutMinutes);
        }
      } catch (error) {
        console.error('Failed to write staff logout audit log:', error);
      }

      await signOut(auth);
      loggedLoginUidRef.current = null;
      setInactivityWarningSeconds(null);
      setFirebaseAuthenticated(false);
      setFirebaseUser(MOCK_FIREBASE_USER);
      setCurrentStaff(DEFAULT_STAFF);
    },
    [firebaseAuthenticated, firebaseUser, currentStaff, timeoutMinutes]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseAuthenticated(false);
        setFirebaseUser(MOCK_FIREBASE_USER);
        setCurrentStaff(DEFAULT_STAFF);
        setAuthReady(true);
        return;
      }

      setFirebaseAuthenticated(true);
      setFirebaseUser(user);
      setAccessError(null);

      const email = user.email?.trim().toLowerCase() || '';
      if (!email || !user.emailVerified) {
        // Fallback to local admin
        setCurrentStaff(DEFAULT_STAFF);
        setAuthReady(true);
        return;
      }

      try {
        const shouldLogLogin = loggedLoginUidRef.current !== user.uid;
        const staffProfile = await establishStaffSession(shouldLogLogin);
        loggedLoginUidRef.current = user.uid;
        lastActivityRef.current = Date.now();
        setCurrentStaff(staffProfile || DEFAULT_STAFF);
      } catch {
        setCurrentStaff(DEFAULT_STAFF);
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
        void logout('timeout').catch((error) => {
          console.error('Automatic sign-out failed:', error);
        });
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

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setAccessError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Sign-in failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setAccessError(msg);
      }
    } finally {
      setSigningIn(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        firebaseAuthenticated,
        currentStaff,
        authReady,
        signingIn,
        accessError,
        inactivityWarningSeconds,
        signInWithGoogle,
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
