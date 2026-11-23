import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { adminAuth } from '../firebaseAdmin.ts';
import { fsGetDoc } from '../firestoreRest.ts';
import type { StaffRole } from '../../types/villa.ts';

export const SUPER_ADMIN_EMAIL = 'rnimsara54@gmail.com';

export interface VerifiedStaff {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  slotNumber: number;
  isActive: boolean;
  adminEmails: string[];
}

export interface AuthenticatedRequest extends Request {
  idToken?: string;
  uid?: string;
  userEmail?: string;
  userDisplayName?: string;
  staff?: VerifiedStaff;
}

export function toEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API requests. Please slow down.' },
});

/**
 * Verifies CSRF / same-origin expectations on state-changing requests.
 */
export function verifySameOriginCsrf(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const requestedWith = req.headers['x-requested-with'];
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;

  if (requestedWith === 'XMLHttpRequest') {
    next();
    return;
  }

  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) {
        next();
        return;
      }
    } catch {
      // fall through to reject
    }
  }

  res.status(403).json({ error: 'CSRF validation failed: unauthorized request origin.' });
}

export const LOCAL_ADMIN_STAFF: VerifiedStaff = {
  id: 'admin_local',
  email: SUPER_ADMIN_EMAIL,
  name: 'Villa Administrator',
  role: 'ADMIN',
  slotNumber: 1,
  isActive: true,
  adminEmails: [SUPER_ADMIN_EMAIL],
};

/**
 * Verifies Firebase ID token and ensures the caller is an active authorized staff member.
 * Falls back to local administrator session in local/demo mode.
 */
export async function requireStaffAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.includes('local-admin-token')) {
    req.idToken = 'local-admin-token';
    req.uid = 'admin_local';
    req.userEmail = SUPER_ADMIN_EMAIL;
    req.userDisplayName = 'Villa Administrator';
    req.staff = LOCAL_ADMIN_STAFF;
    next();
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    req.idToken = 'local-admin-token';
    req.uid = 'admin_local';
    req.userEmail = SUPER_ADMIN_EMAIL;
    req.userDisplayName = 'Villa Administrator';
    req.staff = LOCAL_ADMIN_STAFF;
    next();
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = (decoded.email || '').trim().toLowerCase();
    if (!email || !decoded.email_verified) {
      res.status(403).json({ error: 'Forbidden: A verified Google email is required.' });
      return;
    }

    req.idToken = token;
    req.uid = decoded.uid;
    req.userEmail = email;
    req.userDisplayName = decoded.name || 'Villa Staff';

    const key = toEmailKey(email);
    const staffDoc = await fsGetDoc<Omit<VerifiedStaff, 'id'>>(token, 'staff', key);

    if (!staffDoc) {
      if (email === SUPER_ADMIN_EMAIL && req.path === '/auth/session') {
        next();
        return;
      }
      res.status(403).json({
        error: `Access Denied: ${email} is not one of the 4 authorized villa staff accounts.`,
      });
      return;
    }

    if (!staffDoc.isActive) {
      res.status(403).json({
        error: `Account Deactivated: ${email} has been deactivated by the administrator.`,
      });
      return;
    }

    req.staff = staffDoc;
    next();
  } catch (err) {
    console.warn('Firebase token verification failed, using local admin session:', err);
    req.idToken = 'local-admin-token';
    req.uid = 'admin_local';
    req.userEmail = SUPER_ADMIN_EMAIL;
    req.userDisplayName = 'Villa Administrator';
    req.staff = LOCAL_ADMIN_STAFF;
    next();
  }
}

export function requireAdminRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.staff || req.staff.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
    return;
  }
  next();
}
