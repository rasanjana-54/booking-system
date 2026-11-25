import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../../firebase-applet-config.json" with { type: "json" };
function parseFirebaseServiceAccount(value) {
  if (!value) return { credential: void 0, error: void 0 };
  try {
    return { credential: cert(JSON.parse(value)), error: void 0 };
  } catch {
    return {
      credential: void 0,
      error: new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.")
    };
  }
}
const serviceAccount = parseFirebaseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
if (serviceAccount.error) {
  console.error(serviceAccount.error.message);
}
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
    ...serviceAccount.credential ? { credential: serviceAccount.credential } : {}
  });
}
const adminAuth = getAuth();
function getAdminDb() {
  if (serviceAccount.error) throw serviceAccount.error;
  return getFirestore();
}
const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId || "(default)";
export {
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  adminAuth,
  getAdminDb,
  parseFirebaseServiceAccount
};