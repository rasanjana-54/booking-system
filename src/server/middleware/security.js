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
function createRequireStaffAuth(deps = {}) {
  const verifyToken = deps.verifyIdToken || ((token) => adminAuth.verifyIdToken(token));
  const getStaffDoc = deps.getStaffDoc || ((token, key) => fsGetDoc(token, "staff", key));

  return async function requireStaffAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token || token === "local-admin-token") {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    let decoded;
    try {
      decoded = await verifyToken(token);
    } catch (err) {
      console.warn("Firebase token verification failed:", err);
      const code = typeof err === "object" && err !== null ? err.code : "";
      if (code === "auth/id-token-expired" || code === "auth/id-token-revoked") {
        res.status(401).json({ error: "Your session has expired. Please sign in again." });
        return;
      }
      res.status(401).json({ error: "Invalid authentication token." });
      return;
    }

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
    let staffDoc;
    try {
      staffDoc = await getStaffDoc(token, key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("PERMISSION_DENIED") || msg.includes("(403)")) {
        res.status(403).json({
          error: `Access Denied: ${email} is not one of the 6 authorized villa staff accounts.`
        });
        return;
      }
      console.error("Failed to load staff authorization record:", err);
      res.status(500).json({ error: "Unable to verify staff authorization." });
      return;
    }

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
  };
}
const requireStaffAuth = createRequireStaffAuth();
function requireAdminRole(req, res, next) {
  if (!req.staff || req.staff.role !== "ADMIN") {
    res.status(403).json({ error: "Forbidden: Administrator privileges required." });
    return;
  }
  next();
}
export {
  SUPER_ADMIN_EMAIL,
  apiRateLimiter,
  authRateLimiter,
  createRequireStaffAuth,
  requireAdminRole,
  requireStaffAuth,
  toEmailKey,
  verifySameOriginCsrf
};
