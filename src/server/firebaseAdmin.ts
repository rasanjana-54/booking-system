import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

export function parseFirebaseServiceAccount(value: string | undefined) {
  if (!value) return { credential: undefined, error: undefined };

  try {
    return { credential: cert(JSON.parse(value)), error: undefined };
  } catch {
    return {
      credential: undefined,
      error: new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.'),
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
    ...(serviceAccount.credential ? { credential: serviceAccount.credential } : {}),
  });
}

export const adminAuth = getAuth();

export function getAdminDb() {
  if (serviceAccount.error) throw serviceAccount.error;
  return getFirestore();
}

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';
