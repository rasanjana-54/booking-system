import rateLimit from "express-rate-limit";
import { adminAuth } from "../firebaseAdmin.js";
import { fsGetDoc } from "../firestoreRest.js";
const SUPER_ADMIN_EMAIL = "rnimsara54@gmail.com";
function toEmailKey(email) {
  return email.trim().toLowerCase();
}
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." }
});
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1e3,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many API requests. Please slow down." }
});
function verifySameOriginCsrf(req, res, next) {
  if (req.path === "/cron/whatsapp-reminders" || req.path === "/webhooks/whatsapp") {
    next();
    return;
  }
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const requestedWith = req.headers["x-requested-with"];
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (requestedWith === "XMLHttpRequest") {
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
    }
  }
  res.status(403).json({ error: "CSRF validation failed: unauthorized request origin." });
}
const LOCAL_ADMIN_STAFF = {
  id: "admin_local",
  email: SUPER_ADMIN_EMAIL,
  name: "Villa Administrator",
  role: "ADMIN",
  slotNumber: 1,
  isActive: true,
  adminEmails: [SUPER_ADMIN_EMAIL]
};
async function requireStaffAuth(req, res, next) {
  const useLocalAdminSession = () => {
    if (process.env.NODE_ENV === "production") {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    req.idToken = "local-admin-token";
    req.uid = "admin_local";
    req.userEmail = SUPER_ADMIN_EMAIL;
    req.userDisplayName = "Villa Administrator";
    req.staff = LOCAL_ADMIN_STAFF;
    next();
  };
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.includes("local-admin-token")) {
    useLocalAdminSession();
    return;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    useLocalAdminSession();
    return;
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = (decoded.email || "").trim().toLowerCase();
    if (!email || !decoded.email_verified) {
      res.status(403).json({ error: "Forbidden: A verified Google email is required." });
      return;
    }
    req.idToken = token;
    req.uid = decoded.uid;
    req.userEmail = email;
    req.userDisplayName = decoded.name || "Villa Staff";
    const key = toEmailKey(email);
    const staffDoc = await fsGetDoc(token, "staff", key);
    if (!staffDoc) {
      if (email === SUPER_ADMIN_EMAIL && req.path === "/auth/session") {
        next();
        return;
      }
      res.status(403).json({
        error: `Access Denied: ${email} is not one of the 6 authorized villa staff accounts.`
      });
      return;
    }
    if (!staffDoc.isActive) {
      res.status(403).json({
        error: `Account Deactivated: ${email} has been deactivated by the administrator.`
      });
      return;
    }
    req.staff = staffDoc;
    next();
  } catch (err) {
    console.warn("Firebase token verification failed:", err);
    if (process.env.NODE_ENV === "production") {
      res.status(401).json({ error: "Invalid authentication token." });
      return;
    }
    useLocalAdminSession();
  }
}
function requireAdminRole(req, res, next) {
  if (!req.staff || req.staff.role !== "ADMIN") {
    res.status(403).json({ error: "Forbidden: Administrator privileges required." });
    return;
  }
  next();
}
export {
  LOCAL_ADMIN_STAFF,
  SUPER_ADMIN_EMAIL,
  apiRateLimiter,
  authRateLimiter,
  requireAdminRole,
  requireStaffAuth,
  toEmailKey,
  verifySameOriginCsrf
};
