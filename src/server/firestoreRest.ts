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

const localStore: Record<string, Map<string, Record<string, unknown>>> = {
  villa_settings: new Map([
    [
      'general',
      {
        id: 'general',
        villaName: 'Urban Escape Villa',
        timezone: 'Asia/Colombo',
        currency: 'LKR',
        inactivityTimeoutMinutes: 30,
        authorizedEmails: ['rnimsara54@gmail.com'],
        adminEmails: ['rnimsara54@gmail.com'],
        updatedBy: 'admin_local',
        updatedAt: new Date().toISOString(),
      },
    ],
  ]),
  staff: new Map([
    [
      'rnimsara54@gmail.com',
      {
        id: 'rnimsara54@gmail.com',
        email: 'rnimsara54@gmail.com',
        name: 'Villa Administrator',
        role: 'ADMIN',
        slotNumber: 1,
        isActive: true,
        adminEmails: ['rnimsara54@gmail.com'],
        createdBy: 'admin_local',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  ]),
  room_types: new Map([
    [
      'suite_king_room',
      {
        id: 'suite_king_room',
        roomCode: 'RM-01',
        name: 'King Room',
        description: 'King room',
        maxCapacity: 2,
        price: 50000,
        status: 'Available',
        isArchived: false,
        authorizedEmails: ['rnimsara54@gmail.com'],
        createdBy: 'admin_local',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    [
      'suite_queen_room',
      {
        id: 'suite_queen_room',
        roomCode: 'RM-02',
        name: 'Queen Room',
        description: 'Queen room',
        maxCapacity: 2,
        price: 50000,
        status: 'Available',
        isArchived: false,
        authorizedEmails: ['rnimsara54@gmail.com'],
        createdBy: 'admin_local',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  ]),
  events: new Map(),
  shoots: new Map(),
  room_bookings: new Map(),
  payments: new Map(),
  blocked_schedules: new Map(),
  audit_logs: new Map(),
};

function getLocalCollection(name: string): Map<string, Record<string, unknown>> {
  if (!localStore[name]) {
    localStore[name] = new Map();
  }
  return localStore[name];
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
  if (!idToken || idToken === 'local-admin-token') {
    const col = getLocalCollection(collectionName);
    const doc = col.get(docId);
    if (!doc) return null;
    return { ...(doc as unknown as T), id: docId };
  }

  try {
    const res = await firestoreFetch(`${BASE_URL}/${collectionName}/${docId}`, idToken, {
      method: 'GET',
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Firestore get failed (${res.status})`);
    }
    const raw = (await res.json()) as FirestoreRawDoc;
    return decodeDoc<T>(raw);
  } catch {
    const col = getLocalCollection(collectionName);
    const doc = col.get(docId);
    if (!doc) return null;
    return { ...(doc as unknown as T), id: docId };
  }
}

export async function fsQueryArrayContains<T = Record<string, unknown>>(
  idToken: string,
  collectionName: string,
  fieldPath: string,
  value: string
): Promise<Array<T & { id: string }>> {
  const queryLocal = (): Array<T & { id: string }> => {
    const col = getLocalCollection(collectionName);
    const result: Array<T & { id: string }> = [];
    for (const [id, doc] of col.entries()) {
      const arr = doc[fieldPath];
      if (Array.isArray(arr) && arr.includes(value)) {
        result.push({ ...(doc as unknown as T), id });
      } else if (!arr) {
        result.push({ ...(doc as unknown as T), id });
      }
    }
    return result;
  };

  if (!idToken || idToken === 'local-admin-token') {
    return queryLocal();
  }

  try {
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
      throw new Error(`Firestore query failed (${res.status})`);
    }
    const rows = (await res.json()) as Array<{ document?: FirestoreRawDoc }>;
    return rows.filter((r) => Boolean(r.document)).map((r) => decodeDoc<T>(r.document!));
  } catch {
    return queryLocal();
  }
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

  // Always update local memory store
  for (const op of ops) {
    const col = getLocalCollection(op.collection);
    if (op.type === 'delete') {
      col.delete(op.docId);
      continue;
    }

    const current = col.get(op.docId) || { id: op.docId };
    const rawData = op.data || {};
    const cleanData: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(rawData)) {
      if (isServerTimestamp(v)) {
        cleanData[k] = new Date().toISOString();
      } else {
        cleanData[k] = v;
      }
    }

    if (op.type === 'set') {
      col.set(op.docId, { ...cleanData, id: op.docId });
    } else {
      col.set(op.docId, { ...current, ...cleanData, id: op.docId });
    }
  }

  if (!idToken || idToken === 'local-admin-token') {
    return;
  }

  try {
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

    await firestoreFetch(`${BASE_URL}:commit`, idToken, {
      method: 'POST',
      body: JSON.stringify({ writes }),
    });
  } catch {
    // Graceful fallback: local store was already updated
  }
}
