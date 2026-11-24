import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { doc, getDocFromServer, getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json" with { type: "json" };
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
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
testFirestoreConnection();
export {
  analytics,
  auth,
  db,
  googleAuthProvider,
  testFirestoreConnection
};
