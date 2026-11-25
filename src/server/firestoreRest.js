import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from "./firebaseAdmin.js";
const DOC_PATH_PREFIX = `projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;
function getBaseUrl() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST?.trim();
  if (emulatorHost) {
    return `http://${emulatorHost}/v1/${DOC_PATH_PREFIX}`;
  }
  return `https://firestore.googleapis.com/v1/${DOC_PATH_PREFIX}`;
}
const SERVER_TIMESTAMP = { __serverTimestamp: true };
function isServerTimestamp(val) {
  return typeof val === "object" && val !== null && "__serverTimestamp" in val && val.__serverTimestamp === true;
}
function toFirestoreValue(val) {
  if (val === null || val === void 0) {
    return { nullValue: null };
  }
  if (typeof val === "string") {
    return { stringValue: val };
  }
  if (typeof val === "boolean") {
    return { booleanValue: val };
  }
  if (typeof val === "number") {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item))
      }
    };
  }
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== void 0 && !isServerTimestamp(v)) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}
function fromFirestoreValue(val) {
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("booleanValue" in val) return val.booleanValue;
  if ("nullValue" in val) return null;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val) {
    return (val.arrayValue.values || []).map((v) => fromFirestoreValue(v));
  }
  if ("mapValue" in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  return null;
}
function decodeDoc(raw) {
  const parts = raw.name.split("/");
  const id = parts[parts.length - 1];
  const obj = { id };
  for (const [k, v] of Object.entries(raw.fields || {})) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj;
}
function splitPayloadAndTransforms(data) {
  const fields = {};
  const fieldTransforms = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === void 0) continue;
    if (isServerTimestamp(v)) {
      fieldTransforms.push({ fieldPath: k, setToServerValue: "REQUEST_TIME" });
    } else {
      fields[k] = toFirestoreValue(v);
    }
  }
  return { fields, fieldTransforms };
}
async function firestoreFetch(url, idToken, init = {}) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Authentication required: missing Firebase ID token.");
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  return res;
}
async function assertFirestoreSuccess(res, operation) {
  if (res.ok) return;
  const body = await res.text();
  let detail = body;
  try {
    const error = JSON.parse(body).error;
    detail = error?.status || error?.message || body;
  } catch {
  }
  throw new Error(
    `Firestore ${operation} failed (${res.status})${detail ? `: ${detail}` : ""}`
  );
}
async function fsGetDoc(idToken, collectionName, docId) {
  const res = await firestoreFetch(`${getBaseUrl()}/${collectionName}/${docId}`, idToken, {
    method: "GET"
  });
  if (res.status === 404) return null;
  await assertFirestoreSuccess(res, "get");
  const raw = await res.json();
  return decodeDoc(raw);
}
async function fsQueryArrayContains(idToken, collectionName, fieldPath, value) {
  const res = await firestoreFetch(`${getBaseUrl()}:runQuery`, idToken, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collectionName }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: "ARRAY_CONTAINS",
            value: { stringValue: value }
          }
        }
      }
    })
  });
  await assertFirestoreSuccess(res, "query");
  const rows = await res.json();
  return rows.filter((r) => Boolean(r.document)).map((r) => decodeDoc(r.document));
}
async function fsQueryCollection(idToken, collectionName) {
  const res = await firestoreFetch(`${getBaseUrl()}:runQuery`, idToken, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collectionName }]
      }
    })
  });
  await assertFirestoreSuccess(res, "query");
  const rows = await res.json();
  return rows.filter((r) => Boolean(r.document)).map((r) => decodeDoc(r.document));
}
async function fsCommit(idToken, ops) {
  if (ops.length === 0) return;
  const writes = [];
  for (const op of ops) {
    const docName = `${DOC_PATH_PREFIX}/${op.collection}/${op.docId}`;
    if (op.type === "delete") {
      writes.push({ delete: docName });
      continue;
    }
    const data = op.data || {};
    const { fields, fieldTransforms } = splitPayloadAndTransforms(data);
    const writeEntry = {
      update: {
        name: docName,
        fields
      }
    };
    if (op.type === "update") {
      const explicitMask = op.updateFields || Object.keys(fields);
      writeEntry.updateMask = {
        fieldPaths: explicitMask.filter((k) => !isServerTimestamp(data[k]))
      };
    }
    if (fieldTransforms.length > 0) {
      writeEntry.updateTransforms = fieldTransforms;
    }
    writes.push(writeEntry);
  }
  const res = await firestoreFetch(`${getBaseUrl()}:commit`, idToken, {
    method: "POST",
    body: JSON.stringify({ writes })
  });
  await assertFirestoreSuccess(res, "commit");
}
export {
  SERVER_TIMESTAMP,
  decodeDoc,
  fromFirestoreValue,
  fsCommit,
  fsGetDoc,
  fsQueryArrayContains,
  fsQueryCollection,
  toFirestoreValue
};
