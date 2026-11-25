import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();

function readProjectFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Security & auth modules contain no silent local admin or mock user fallbacks", () => {
  const authCtx = readProjectFile("src/contexts/AuthContext.jsx");
  const securityMw = readProjectFile("src/server/middleware/security.js");
  const firestoreRest = readProjectFile("src/server/firestoreRest.js");

  assert.equal(authCtx.includes("DEFAULT_STAFF"), false);
  assert.equal(authCtx.includes("MOCK_FIREBASE_USER"), false);
  assert.equal(securityMw.includes("LOCAL_ADMIN_STAFF"), false);
  assert.equal(securityMw.includes("useLocalAdminSession"), false);
  assert.equal(firestoreRest.includes("localStore"), false);
});

test("Frontend routes and login flow require verified active staff authorization", () => {
  const appJsx = readProjectFile("src/App.jsx");
  const loginJsx = readProjectFile("src/pages/LoginPage.jsx");
  const authCtx = readProjectFile("src/contexts/AuthContext.jsx");
  const villaDataCtx = readProjectFile("src/contexts/VillaDataContext.jsx");

  assert.match(appJsx, /!firebaseAuthenticated \|\| !currentStaff \|\| !currentStaff\.isActive/);
  assert.match(loginJsx, /authReady && !sessionChecking && firebaseAuthenticated && currentStaff\?\.isActive/);
  assert.match(authCtx, /onSnapshot\(/);
  assert.match(villaDataCtx, /onSnapshot\(/);
  assert.match(villaDataCtx, /collection\(db, name\)/);
  assert.match(villaDataCtx, /unsubscribers\.forEach/);
});

test("Firestore security rules enforce default-deny, active-staff checks, and safe staff doc lookup", () => {
  const rules = readProjectFile("firestore.rules");

  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  assert.match(rules, /staffId == userEmailLower\(\)/);
  assert.match(rules, /match \/audit_logs\/\{logId\}[\s\S]*?allow list: if isAdmin\(\)/);
  assert.match(rules, /match \/villa_settings\/\{settingId\}[\s\S]*?allow list: if isActiveStaff\(\)/);
  assert.match(rules, /match \/payments\/\{paymentId\}[\s\S]*?allow delete: if false;/);
});
