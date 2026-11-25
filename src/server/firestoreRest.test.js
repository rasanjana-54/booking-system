import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fsCommit,
  fsGetDoc,
  fsQueryArrayContains
} from "./firestoreRest.js";

function forbiddenResponse() {
  return new Response(
    JSON.stringify({
      error: {
        code: 403,
        status: "PERMISSION_DENIED",
        message: "Missing or insufficient permissions."
      }
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" }
    }
  );
}

test("Firestore commit errors are returned instead of treated as success", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => forbiddenResponse();

  await assert.rejects(
    fsCommit("test-id-token", [
      {
        type: "set",
        collection: "events",
        docId: "event-test",
        data: { customerName: "Test customer" }
      }
    ]),
    /Firestore commit failed \(403\): PERMISSION_DENIED/
  );
});

test("Firestore reads do not fall back to local staff data on errors", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => forbiddenResponse();

  await assert.rejects(
    fsGetDoc("test-id-token", "staff", "rnimsara54@gmail.com"),
    /Firestore get failed \(403\): PERMISSION_DENIED/
  );
  await assert.rejects(
    fsQueryArrayContains(
      "test-id-token",
      "staff",
      "adminEmails",
      "rnimsara54@gmail.com"
    ),
    /Firestore query failed \(403\): PERMISSION_DENIED/
  );
});
