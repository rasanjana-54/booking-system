import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json" with { type: "json" };
const app = initializeApp(firebaseConfig);
let analytics = null;
if (typeof window !== "undefined") {
  try {
    analytics = getAnalytics(app);
  } catch {
    analytics = null;
  }
}
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
if (import.meta.env?.VITE_USE_FIREBASE_EMULATOR === "true") {
  const authHost = import.meta.env?.VITE_FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  const fsHost = import.meta.env?.VITE_FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  const [fsHostname, fsPort] = fsHost.split(":");
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  connectFirestoreEmulator(db, fsHostname, Number(fsPort) || 8080);
}
const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: "select_account" });
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Firestore appears offline. Please verify your Firebase configuration.");
    }
  }
}
export {
  analytics,
  auth,
  db,
  googleAuthProvider,
  testFirestoreConnection
};
