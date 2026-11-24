import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

if (!getApps().length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let credential;
  if (serviceAccountJson) {
    try {
      credential = cert(JSON.parse(serviceAccountJson));
    } catch (error) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_JSON is invalid: ${
          error instanceof Error ? error.message : 'unable to parse service account'
        }`
      );
    }
  }
  initializeApp({
    projectId: firebaseConfig.projectId,
    ...(credential ? { credential } : {}),
  });
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';
