import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from './firebaseAdmin.ts';

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;
const DOC_PATH_PREFIX = `projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;

export type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export interface FirestoreRawDoc {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export interface ServerTimestampMarker {
  __serverTimestamp: true;
}

export const SERVER_TIMESTAMP: ServerTimestampMarker = { __serverTimestamp: true };

function isServerTimestamp(val: unknown): val is ServerTimestampMarker {
  return (
    typeof val === 'object' &&
    val !== null &&
    '__serverTimestamp' in val &&
    (val as ServerTimestampMarker).__serverTimestamp === true
  );
}

export function toFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined && !isServerTimestamp(v)) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFirestoreValue(val: FirestoreValue): unknown {
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map((v) => fromFirestoreValue(v));
  }
  if ('mapValue' in val) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

export function decodeDoc<T = Record<string, unknown>>(raw: FirestoreRawDoc): T & { id: string } {
  const parts = raw.name.split('/');
  const id = parts[parts.length - 1];
  const obj: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(raw.fields || {})) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj as T & { id: string };
}

function splitPayloadAndTransforms(data: Record<string, unknown>): {
  fields: Record<string, FirestoreValue>;
  fieldTransforms: Array<{ fieldPath: string; setToServerValue: 'REQUEST_TIME' }>;
} {
  const fields: Record<string, FirestoreValue> = {};
  const fieldTransforms: Array<{ fieldPath: string; setToServerValue: 'REQUEST_TIME' }> = [];

  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (isServerTimestamp(v)) {
      fieldTransforms.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' });
    } else {
      fields[k] = toFirestoreValue(v);
    }
  }

  return { fields, fieldTransforms };
}

async function firestoreFetch(
  url: string,
  idToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return res;
}

export async function fsGetDoc<T = Record<string, unknown>>(
  idToken: string,
  collectionName: string,
  docId: string
): Promise<(T & { id: string }) | null> {
  const res = await firestoreFetch(`${BASE_URL}/${collectionName}/${docId}`, idToken, {
    method: 'GET',
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore get failed (${res.status}): ${text}`);
  }
  const raw = (await res.json()) as FirestoreRawDoc;
  return decodeDoc<T>(raw);
}

export async function fsQueryArrayContains<T = Record<string, unknown>>(
  idToken: string,
  collectionName: string,
  fieldPath: string,
  value: string
): Promise<Array<T & { id: string }>> {
  const res = await firestoreFetch(`${BASE_URL}:runQuery`, idToken, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collectionName }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'ARRAY_CONTAINS',
            value: { stringValue: value },
          },
        },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore query failed (${res.status}): ${text}`);
  }
  const rows = (await res.json()) as Array<{ document?: FirestoreRawDoc }>;
  return rows.filter((r) => Boolean(r.document)).map((r) => decodeDoc<T>(r.document!));
}

export interface CommitOperation {
  type: 'set' | 'update' | 'delete';
  collection: string;
  docId: string;
  data?: Record<string, unknown>;
  updateFields?: string[];
}

export async function fsCommit(idToken: string, ops: CommitOperation[]): Promise<void> {
  if (ops.length === 0) return;

  const writes: Array<Record<string, unknown>> = [];

  for (const op of ops) {
    const docName = `${DOC_PATH_PREFIX}/${op.collection}/${op.docId}`;
    if (op.type === 'delete') {
      writes.push({ delete: docName });
      continue;
    }

    const data = op.data || {};
    const { fields, fieldTransforms } = splitPayloadAndTransforms(data);

    const writeEntry: Record<string, unknown> = {
      update: {
        name: docName,
        fields,
      },
    };

    if (op.type === 'update') {
      const explicitMask = op.updateFields || Object.keys(fields);
      writeEntry.updateMask = {
        fieldPaths: explicitMask.filter((k) => !isServerTimestamp(data[k])),
      };
    }

    if (fieldTransforms.length > 0) {
      writeEntry.updateTransforms = fieldTransforms;
    }

    writes.push(writeEntry);
  }

  const res = await firestoreFetch(`${BASE_URL}:commit`, idToken, {
    method: 'POST',
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore commit failed (${res.status}): ${text}`);
  }
}
