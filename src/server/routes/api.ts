import { Router, type Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  fsCommit,
  fsGetDoc,
  fsQueryArrayContains,
  SERVER_TIMESTAMP,
  type CommitOperation,
} from '../firestoreRest.ts';
import {
  requireAdminRole,
  requireStaffAuth,
  SUPER_ADMIN_EMAIL,
  toEmailKey,
  type AuthenticatedRequest,
} from '../middleware/security.ts';
import {
  computePaymentSummary,
  findRoomBookingConflict,
  findVenueScheduleConflict,
  formatColomboTimestamp,
  getColomboDateStr,
  timestampToMs,
  VILLA_TIMEZONE,
} from '../../utils/colomboTime.ts';
import {
  blockedScheduleSchema,
  eventBookingSchema,
  paymentSchema,
  roomBookingSchema,
  roomTypeSchema,
  settingsSchema,
  shootBookingSchema,
  staffSchema,
} from '../../utils/validation.ts';
import type {
  AuditLog,
  BlockedSchedule,
  BookingCategory,
  CurrencyCode,
  EventBooking,
  Payment,
  RoomBooking,
  RoomType,
  ShootBooking,
  StaffMember,
  StaffRole,
  VillaSettings,
  WhatsAppReminder,
} from '../../types/villa.ts';
import { MAX_STAFF_ACCOUNTS } from '../../types/villa.ts';
import { getNextStaffSlot } from '../../utils/staffSlots.ts';
import {
  applyWhatsAppWebhookStatus,
  FirestoreReminderStore,
  MetaWhatsAppSender,
  ReminderRequestError,
  retryFailedPhotoshootReminder,
  runWeeklyPhotoshootReminders,
} from '../whatsappReminders.ts';

export const apiRouter = Router();
const reminderStore = new FirestoreReminderStore();
const whatsAppSender = new MetaWhatsAppSender();

function secretsMatch(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

function generateDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function generateBookingCode(prefix: 'EVT' | 'SHT' | 'ROM' | 'PAY'): string {
  const year = getColomboDateStr().slice(0, 4);
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${year}-${num}`;
}

function uniqueEmails(emails: string[], fallbackEmail: string): string[] {
  const set = new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  set.add(SUPER_ADMIN_EMAIL);
  if (fallbackEmail) set.add(fallbackEmail.trim().toLowerCase());
  return Array.from(set).slice(0, 4);
}

function collectionForCategory(category: BookingCategory): string {
  if (category === 'EVENT') return 'events';
  if (category === 'SHOOT') return 'shoots';
  return 'room_bookings';
}

async function getAccessLists(
  idToken: string,
  callerEmail: string
): Promise<{ authorizedEmails: string[]; adminEmails: string[]; settings: VillaSettings | null }> {
  const settings = await fsGetDoc<Omit<VillaSettings, 'id'>>(
    idToken,
    'villa_settings',
    'general'
  );
  const authorizedEmails = uniqueEmails(
    settings?.authorizedEmails || [callerEmail],
    callerEmail
  );
  const adminEmails = uniqueEmails(settings?.adminEmails || [SUPER_ADMIN_EMAIL], SUPER_ADMIN_EMAIL);
  return { authorizedEmails, adminEmails, settings };
}

function buildAuditOp(params: {
  uid: string;
  email: string;
  name: string;
  action: string;
  recordType: string;
  recordId: string;
  summary: string;
  adminEmails: string[];
}): CommitOperation {
  return {
    type: 'set',
    collection: 'audit_logs',
    docId: generateDocId('log'),
    data: {
      userId: params.uid,
      userEmail: params.email.toLowerCase(),
      userName: params.name,
      action: params.action.slice(0, 60),
      recordType: params.recordType.slice(0, 40),
      recordId: params.recordId.slice(0, 128),
      summary: params.summary.slice(0, 500),
      adminEmails: uniqueEmails(params.adminEmails, SUPER_ADMIN_EMAIL),
      timestamp: SERVER_TIMESTAMP,
    },
  };
}

function handleRouteError(res: Response, err: unknown, fallbackMessage: string): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: err.issues[0]?.message || 'Validation failed.',
      issues: err.issues,
    });
    return;
  }
  const message = err instanceof Error ? err.message : fallbackMessage;
  if (message.includes('PERMISSION_DENIED') || message.includes('(403)')) {
    res.status(403).json({ error: message });
    return;
  }
  if (message.includes('(404)')) {
    res.status(404).json({ error: message });
    return;
  }
  console.error(fallbackMessage, err);
  res.status(500).json({ error: message || fallbackMessage });
}

// Public health check (no sensitive data)
apiRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'Urban Escape Villa API',
    timezone: VILLA_TIMEZONE,
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get('/webhooks/whatsapp', (req, res) => {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    res.status(503).send('WhatsApp webhook verification is not configured.');
    return;
  }
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (
    mode === 'subscribe' &&
    typeof token === 'string' &&
    secretsMatch(token, verifyToken) &&
    typeof challenge === 'string'
  ) {
    res.type('text/plain').send(challenge);
    return;
  }
  res.sendStatus(403);
});

apiRouter.post('/webhooks/whatsapp', async (req, res) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const signature = req.header('x-hub-signature-256');
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
  if (!appSecret) {
    res.status(503).json({ error: 'WhatsApp webhook signature validation is not configured.' });
    return;
  }
  if (!signature || !rawBody) {
    res.status(401).json({ error: 'WhatsApp webhook signature is missing.' });
    return;
  }
  const expectedSignature = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  if (!secretsMatch(signature, expectedSignature)) {
    res.status(401).json({ error: 'WhatsApp webhook signature is invalid.' });
    return;
  }

  try {
    const body = req.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{
              id?: string;
              status?: string;
              errors?: Array<{ title?: string; details?: string; message?: string }>;
            }>;
          };
        }>;
      }>;
    };
    const statuses =
      body.entry?.flatMap((entry) =>
        entry.changes?.flatMap((change) => change.value?.statuses || []) || []
      ) || [];

    for (const status of statuses) {
      if (!status.id || !status.status) continue;
      const failureReason = status.errors
        ?.map((error) => error.details || error.title || error.message)
        .filter(Boolean)
        .join('; ');
      await applyWhatsAppWebhookStatus(
        reminderStore,
        status.id,
        status.status,
        failureReason
      );
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('WhatsApp webhook status update failed', error);
    res.status(500).json({ error: 'Unable to save WhatsApp delivery status.' });
  }
});

apiRouter.get('/cron/whatsapp-reminders', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    res.status(503).json({ error: 'Scheduled reminder authorization is not configured.' });
    return;
  }
  const authorization = req.header('authorization') || '';
  if (!secretsMatch(authorization, `Bearer ${cronSecret}`)) {
    res.status(401).json({ error: 'Unauthorized scheduled reminder request.' });
    return;
  }
  try {
    const summary = await runWeeklyPhotoshootReminders(reminderStore, whatsAppSender);
    res.json(summary);
  } catch (error) {
    console.error('Weekly WhatsApp reminder job failed', error);
    res.status(500).json({ error: 'Weekly WhatsApp reminder job failed.' });
  }
});

// Protect all endpoints below with Firebase ID token + active staff check
apiRouter.use(requireStaffAuth);

apiRouter.get(
  '/admin/whatsapp-reminders',
  requireAdminRole,
  async (_req: AuthenticatedRequest, res) => {
    try {
      const reminders: WhatsAppReminder[] = await reminderStore.listReminders();
      res.json({ reminders });
    } catch (error) {
      handleRouteError(res, error, 'Failed to load WhatsApp reminder history.');
    }
  }
);

apiRouter.post(
  '/admin/whatsapp-reminders/:id/retry',
  requireAdminRole,
  async (req: AuthenticatedRequest, res) => {
    try {
      const reminder = await retryFailedPhotoshootReminder(
        req.params.id,
        reminderStore,
        whatsAppSender
      );
      res.json({ reminder });
    } catch (error) {
      if (error instanceof ReminderRequestError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      handleRouteError(res, error, 'Failed to retry WhatsApp reminder.');
    }
  }
);

// ==========================================
// AUTHENTICATION & SESSION BOOTSTRAP
// ==========================================

apiRouter.post('/auth/session', async (req: AuthenticatedRequest, res) => {
  try {
    const idToken = req.idToken!;
    const uid = req.uid!;
    const email = req.userEmail!;
    const displayName = req.userDisplayName || 'Villa Administrator';
    const key = toEmailKey(email);

    let staff = await fsGetDoc<Omit<StaffMember, 'id'>>(idToken, 'staff', key);
    const ops: CommitOperation[] = [];

    if (!staff && email === SUPER_ADMIN_EMAIL) {
      const adminList = [SUPER_ADMIN_EMAIL];
      ops.push({
        type: 'set',
        collection: 'staff',
        docId: key,
        data: {
          email,
          name: displayName,
          role: 'ADMIN',
          slotNumber: 1,
          isActive: true,
          uid,
          lastLoginAt: SERVER_TIMESTAMP,
          adminEmails: adminList,
          createdBy: uid,
          createdAt: SERVER_TIMESTAMP,
          updatedAt: SERVER_TIMESTAMP,
        },
      });
    } else if (staff) {
      ops.push({
        type: 'update',
        collection: 'staff',
        docId: key,
        data: {
          uid,
          lastLoginAt: SERVER_TIMESTAMP,
          updatedAt: SERVER_TIMESTAMP,
        },
        updateFields: ['uid'],
      });
    }

    if (email === SUPER_ADMIN_EMAIL) {
      const existingSettings = await fsGetDoc<Omit<VillaSettings, 'id'>>(
        idToken,
        'villa_settings',
        'general'
      );
      if (!existingSettings) {
        ops.push({
          type: 'set',
          collection: 'villa_settings',
          docId: 'general',
          data: {
            villaName: 'Urban Escape Villa',
            timezone: VILLA_TIMEZONE,
            currency: 'LKR' as CurrencyCode,
            inactivityTimeoutMinutes: 30,
            authorizedEmails: [email],
            adminEmails: [SUPER_ADMIN_EMAIL],
            updatedBy: uid,
            updatedAt: SERVER_TIMESTAMP,
          },
        });
      } else if (existingSettings.villaName === 'Verdant Crest Villa') {
        ops.push({
          type: 'update',
          collection: 'villa_settings',
          docId: 'general',
          data: {
            villaName: 'Urban Escape Villa',
            updatedBy: uid,
            updatedAt: SERVER_TIMESTAMP,
          },
          updateFields: ['villaName', 'updatedBy'],
        });
      }

      const defaultRooms = [
        {
          id: 'suite_king_room',
          roomCode: 'RM-01',
          name: 'King Room',
          description: 'King room',
          maxCapacity: 2,
          price: 50000,
          status: 'Available',
        },
        {
          id: 'suite_queen_room',
          roomCode: 'RM-02',
          name: 'Queen Room',
          description: 'Queen room',
          maxCapacity: 2,
          price: 50000,
          status: 'Available',
        },
      ] as const;

      for (const room of defaultRooms) {
        const existing = await fsGetDoc<Omit<RoomType, 'id'>>(
          idToken,
          'room_types',
          room.id
        );
        if (!existing) {
          ops.push({
            type: 'set',
            collection: 'room_types',
            docId: room.id,
            data: {
              roomCode: room.roomCode,
              name: room.name,
              description: room.description,
              maxCapacity: room.maxCapacity,
              price: room.price,
              status: room.status,
              isArchived: false,
              authorizedEmails: [email],
              createdBy: uid,
              createdAt: SERVER_TIMESTAMP,
              updatedAt: SERVER_TIMESTAMP,
            },
          });
        }
      }

      const legacyRooms = [
        { id: 'suite_master_pavilion', name: 'The Master Pavilion' },
        { id: 'suite_garden_courtyard', name: 'Royal Garden Suite' },
        { id: 'suite_emerald_cabana', name: 'Emerald Pool Cabana' },
      ];
      const existingLegacyRooms = await Promise.all(
        legacyRooms.map(async (room) => ({
          ...room,
          existing: await fsGetDoc<Omit<RoomType, 'id'>>(idToken, 'room_types', room.id),
        }))
      );
      for (const { id, name, existing } of existingLegacyRooms) {
        if (existing?.name === name && !existing.isArchived) {
          ops.push({
            type: 'update',
            collection: 'room_types',
            docId: id,
            data: {
              isArchived: true,
              updatedBy: uid,
              updatedAt: SERVER_TIMESTAMP,
            },
            updateFields: ['isArchived', 'updatedBy', 'updatedAt'],
          });
        }
      }
    }

    if (ops.length > 0) {
      await fsCommit(idToken, ops);
    }

    staff = await fsGetDoc<Omit<StaffMember, 'id'>>(idToken, 'staff', key);
    if (!staff || !staff.isActive) {
      res.status(403).json({ error: 'Staff account is inactive or unauthorized.' });
      return;
    }

    // Optional login audit log if client flags first login of session
    const logLogin = Boolean(req.body?.logLogin);
    if (logLogin) {
      await fsCommit(idToken, [
        buildAuditOp({
          uid,
          email: staff.email,
          name: staff.name,
          action: 'LOGIN',
          recordType: 'AUTH',
          recordId: uid,
          summary: `Authorized ${staff.role} login (${staff.email})`,
          adminEmails: staff.adminEmails || [SUPER_ADMIN_EMAIL],
        }),
      ]);
    }

    res.json({ staff });
  } catch (err) {
    handleRouteError(res, err, 'Failed to establish authenticated session.');
  }
});

apiRouter.post('/auth/logout', async (req: AuthenticatedRequest, res) => {
  try {
    const reason = req.body?.reason === 'timeout' ? 'timeout' : 'manual';
    const timeoutMinutes = Number(req.body?.timeoutMinutes || 30);
    const staff = req.staff!;
    await fsCommit(req.idToken!, [
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: reason === 'timeout' ? 'SESSION_EXPIRED' : 'LOGOUT',
        recordType: 'AUTH',
        recordId: req.uid!,
        summary:
          reason === 'timeout'
            ? `Session automatically terminated after ${timeoutMinutes}m inactivity`
            : `Staff member ${staff.email} signed out`,
        adminEmails: staff.adminEmails || [SUPER_ADMIN_EMAIL],
      }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Failed to log sign-out event.');
  }
});

// ==========================================
// BOOTSTRAP ALL AUTHORIZED DATA
// ==========================================

apiRouter.get('/bootstrap', async (req: AuthenticatedRequest, res) => {
  try {
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();

    const baseQueries = [
      fsQueryArrayContains<Omit<EventBooking, 'id'>>(idToken, 'events', 'authorizedEmails', emailLower),
      fsQueryArrayContains<Omit<ShootBooking, 'id'>>(idToken, 'shoots', 'authorizedEmails', emailLower),
      fsQueryArrayContains<Omit<RoomType, 'id'>>(idToken, 'room_types', 'authorizedEmails', emailLower),
      fsQueryArrayContains<Omit<RoomBooking, 'id'>>(
        idToken,
        'room_bookings',
        'authorizedEmails',
        emailLower
      ),
      fsQueryArrayContains<Omit<Payment, 'id'>>(idToken, 'payments', 'authorizedEmails', emailLower),
      fsQueryArrayContains<Omit<BlockedSchedule, 'id'>>(
        idToken,
        'blocked_schedules',
        'authorizedEmails',
        emailLower
      ),
      fsGetDoc<Omit<VillaSettings, 'id'>>(idToken, 'villa_settings', 'general'),
    ] as const;

    const [
      events,
      shoots,
      roomTypes,
      roomBookings,
      payments,
      blockedSchedules,
      settings,
    ] = await Promise.all(baseQueries);

    let staffMembers: StaffMember[] = [];
    let auditLogs: AuditLog[] = [];

    if (staff.role === 'ADMIN') {
      const [staffList, logList] = await Promise.all([
        fsQueryArrayContains<Omit<StaffMember, 'id'>>(idToken, 'staff', 'adminEmails', emailLower),
        fsQueryArrayContains<Omit<AuditLog, 'id'>>(idToken, 'audit_logs', 'adminEmails', emailLower),
      ]);
      staffMembers = staffList.sort((a, b) => a.slotNumber - b.slotNumber);
      auditLogs = logList.sort((a, b) => timestampToMs(b.timestamp) - timestampToMs(a.timestamp));
    }

    events.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
    shoots.sort((a, b) => b.shootDate.localeCompare(a.shootDate));
    roomTypes.sort((a, b) => a.roomCode.localeCompare(b.roomCode));
    roomBookings.sort((a, b) => b.checkInDate.localeCompare(a.checkInDate));
    payments.sort((a, b) => timestampToMs(b.createdAt) - timestampToMs(a.createdAt));
    blockedSchedules.sort((a, b) => a.startDate.localeCompare(b.startDate));

    res.json({
      events,
      shoots,
      roomTypes,
      roomBookings,
      payments,
      blockedSchedules,
      staffMembers,
      auditLogs,
      settings,
    });
  } catch (err) {
    handleRouteError(res, err, 'Failed to load villa operations data.');
  }
});

// ==========================================
// EVENT BOOKINGS CRUD
// ==========================================

apiRouter.post('/events', async (req: AuthenticatedRequest, res) => {
  try {
    const input = eventBookingSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();

    if (input.status !== 'Cancelled') {
      const [events, shoots, blocks] = await Promise.all([
        fsQueryArrayContains<Omit<EventBooking, 'id'>>(idToken, 'events', 'authorizedEmails', emailLower),
        fsQueryArrayContains<Omit<ShootBooking, 'id'>>(idToken, 'shoots', 'authorizedEmails', emailLower),
        fsQueryArrayContains<Omit<BlockedSchedule, 'id'>>(
          idToken,
          'blocked_schedules',
          'authorizedEmails',
          emailLower
        ),
      ]);
      const conflict = findVenueScheduleConflict({
        date: input.eventDate,
        startTime: input.startTime,
        endTime: input.endTime,
        venueResource: input.venueResource,
        bookingKind: 'EVENT',
        events,
        shoots,
        blocks,
      });
      if (conflict) {
        res.status(409).json({ error: conflict });
        return;
      }
    }

    const { authorizedEmails, adminEmails } = await getAccessLists(idToken, emailLower);
    const eventId = generateDocId('evt');
    const bookingCode = generateBookingCode('EVT');
    const { duePayment, paymentStatus } = computePaymentSummary(
      input.totalPayment,
      input.advancePayment
    );

    const eventData: Record<string, unknown> = {
      bookingCode,
      eventType: input.eventType,
      venueResource: input.venueResource,
      eventDate: input.eventDate,
      startTime: input.startTime,
      endTime: input.endTime,
      paxCount: Number(input.paxCount),
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      totalPayment: Number(input.totalPayment),
      advancePayment: Number(input.advancePayment),
      duePayment,
      paymentStatus,
      status: input.status,
      isArchived: false,
      authorizedEmails,
      createdBy: req.uid!,
      createdByName: staff.name,
      createdAt: SERVER_TIMESTAMP,
      updatedAt: SERVER_TIMESTAMP,
    };
    if (input.specialNotes && input.specialNotes.trim()) {
      eventData.specialNotes = input.specialNotes.trim();
    }

    const ops: CommitOperation[] = [
      { type: 'set', collection: 'events', docId: eventId, data: eventData },
    ];

    if (input.advancePayment > 0) {
      const payData: Record<string, unknown> = {
        paymentCode: generateBookingCode('PAY'),
        bookingId: eventId,
        bookingCode,
        bookingType: 'EVENT',
        customerName: input.customerName.trim(),
        amount: Number(input.advancePayment),
        paymentMethod: input.paymentMethod,
        paymentDate: getColomboDateStr(),
        notes: 'Initial advance payment at booking creation',
        isAdjustment: false,
        isVoided: false,
        recordedBy: req.uid!,
        recordedByName: staff.name,
        authorizedEmails,
        createdAt: SERVER_TIMESTAMP,
      };
      if (input.referenceNumber && input.referenceNumber.trim()) {
        payData.referenceNumber = input.referenceNumber.trim();
      }
      ops.push({ type: 'set', collection: 'payments', docId: generateDocId('pay'), data: payData });
    }

    ops.push(
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'EVENT_CREATED',
        recordType: 'EVENT',
        recordId: bookingCode,
        summary: `Created ${input.eventType} event for ${input.customerName.trim()} on ${input.eventDate} (${input.startTime}-${input.endTime})`,
        adminEmails,
      })
    );

    await fsCommit(idToken, ops);
    res.status(201).json({ id: eventId, bookingCode });
  } catch (err) {
    handleRouteError(res, err, 'Failed to create event booking.');
  }
});

const eventUpdateSchema = z
  .object({
    eventType: eventBookingSchema.shape.eventType,
    venueResource: eventBookingSchema.shape.venueResource,
    eventDate: eventBookingSchema.shape.eventDate,
    startTime: eventBookingSchema.shape.startTime,
    endTime: eventBookingSchema.shape.endTime,
    paxCount: eventBookingSchema.shape.paxCount,
    customerName: eventBookingSchema.shape.customerName,
    customerPhone: eventBookingSchema.shape.customerPhone,
    totalPayment: eventBookingSchema.shape.totalPayment,
    specialNotes: eventBookingSchema.shape.specialNotes,
    status: eventBookingSchema.shape.status,
  })
  .refine((d) => d.endTime > d.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

apiRouter.patch('/events/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const eventId = req.params.id;
    const input = eventUpdateSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();

    const existing = await fsGetDoc<Omit<EventBooking, 'id'>>(idToken, 'events', eventId);
    if (!existing) {
      res.status(404).json({ error: 'Event booking not found.' });
      return;
    }

    if (input.status !== 'Cancelled') {
      const [events, shoots, blocks] = await Promise.all([
        fsQueryArrayContains<Omit<EventBooking, 'id'>>(idToken, 'events', 'authorizedEmails', emailLower),
        fsQueryArrayContains<Omit<ShootBooking, 'id'>>(idToken, 'shoots', 'authorizedEmails', emailLower),
        fsQueryArrayContains<Omit<BlockedSchedule, 'id'>>(
          idToken,
          'blocked_schedules',
          'authorizedEmails',
          emailLower
        ),
      ]);
      const conflict = findVenueScheduleConflict({
        date: input.eventDate,
        startTime: input.startTime,
        endTime: input.endTime,
        venueResource: input.venueResource,
        bookingKind: 'EVENT',
        excludeId: eventId,
        events,
        shoots,
        blocks,
      });
      if (conflict) {
        res.status(409).json({ error: conflict });
        return;
      }
    }

    const { authorizedEmails, adminEmails } = await getAccessLists(idToken, emailLower);
    const { duePayment, paymentStatus } = computePaymentSummary(
      input.totalPayment,
      existing.advancePayment
    );

    const payload: Record<string, unknown> = {
      eventType: input.eventType,
      venueResource: input.venueResource,
      eventDate: input.eventDate,
      startTime: input.startTime,
      endTime: input.endTime,
      paxCount: Number(input.paxCount),
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      totalPayment: Number(input.totalPayment),
      advancePayment: existing.advancePayment,
      duePayment,
      paymentStatus,
      specialNotes: input.specialNotes?.trim() || '',
      status: input.status,
      authorizedEmails,
      updatedAt: SERVER_TIMESTAMP,
    };

    await fsCommit(idToken, [
      {
        type: 'update',
        collection: 'events',
        docId: eventId,
        data: payload,
        updateFields: Object.keys(payload),
      },
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'EVENT_UPDATED',
        recordType: 'EVENT',
        recordId: existing.bookingCode,
        summary: `Updated event ${existing.bookingCode} (${input.customerName.trim()}, status: ${input.status})`,
        adminEmails,
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Failed to update event booking.');
  }
});

// ==========================================
// SHOOT BOOKINGS CRUD
// ==========================================

apiRouter.post('/shoots', async (req: AuthenticatedRequest, res) => {
  try {
    const input = shootBookingSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();
    const assignedStaffEmail = input.assignedStaffId.trim().toLowerCase();

    if (staff.role !== 'ADMIN' && assignedStaffEmail !== emailLower) {
      res.status(403).json({ error: 'Staff members may only assign photoshoots to themselves.' });
      return;
    }
    const assignedStaff = await fsGetDoc<Omit<StaffMember, 'id'>>(
      idToken,
      'staff',
      assignedStaffEmail
    );
    if (!assignedStaff?.isActive) {
      res.status(400).json({ error: 'Select an active authorized staff member.' });
      return;
    }

    if (input.status !== 'Cancelled') {
      const [events, shoots, blocks] = await Promise.all([
        fsQueryArrayContains<Omit<EventBooking, 'id'>>(idToken, 'events', 'authorizedEmails', emailLower),
        fsQueryArrayContains<Omit<ShootBooking, 'id'>>(idToken, 'shoots', 'authorizedEmails', emailLower),
        fsQueryArrayContains<Omit<BlockedSchedule, 'id'>>(
          idToken,
          'blocked_schedules',
          'authorizedEmails',
          emailLower
        ),
      ]);
      const conflict = findVenueScheduleConflict({
        date: input.shootDate,
        startTime: input.startTime,
        endTime: input.endTime,
        venueResource: input.venueResource,
        bookingKind: 'SHOOT',
        events,
        shoots,
        blocks,
      });
      if (conflict) {
        res.status(409).json({ error: conflict });
        return;
      }
    }

    const { authorizedEmails, adminEmails } = await getAccessLists(idToken, emailLower);
    const shootId = generateDocId('sht');
    const bookingCode = generateBookingCode('SHT');
    const { duePayment, paymentStatus } = computePaymentSummary(
      input.totalPayment,
      input.advancePayment
    );

    const shootData: Record<string, unknown> = {
      bookingCode,
      shootDate: input.shootDate,
      shootType: input.shootType,
      venueResource: input.venueResource,
      startTime: input.startTime,
      endTime: input.endTime,
      paxCount: Number(input.paxCount),
      assignedStaffId: assignedStaffEmail,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      totalPayment: Number(input.totalPayment),
      advancePayment: Number(input.advancePayment),
      duePayment,
      paymentStatus,
      status: input.status,
      isArchived: false,
      authorizedEmails,
      createdBy: req.uid!,
      createdByName: staff.name,
      createdAt: SERVER_TIMESTAMP,
      updatedAt: SERVER_TIMESTAMP,
    };
    if (input.specialNotes && input.specialNotes.trim()) {
      shootData.specialNotes = input.specialNotes.trim();
    }

    const ops: CommitOperation[] = [
      { type: 'set', collection: 'shoots', docId: shootId, data: shootData },
    ];

    if (input.advancePayment > 0) {
      const payData: Record<string, unknown> = {
        paymentCode: generateBookingCode('PAY'),
        bookingId: shootId,
        bookingCode,
        bookingType: 'SHOOT',
        customerName: input.customerName.trim(),
        amount: Number(input.advancePayment),
        paymentMethod: input.paymentMethod,
        paymentDate: getColomboDateStr(),
        notes: 'Initial advance payment at shoot creation',
        isAdjustment: false,
        isVoided: false,
        recordedBy: req.uid!,
        recordedByName: staff.name,
        authorizedEmails,
        createdAt: SERVER_TIMESTAMP,
      };
      if (input.referenceNumber && input.referenceNumber.trim()) {
        payData.referenceNumber = input.referenceNumber.trim();
      }
      ops.push({ type: 'set', collection: 'payments', docId: generateDocId('pay'), data: payData });
    }

    ops.push(
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'SHOOT_CREATED',
        recordType: 'SHOOT',
        recordId: bookingCode,
        summary: `Created ${input.shootType} booking for ${input.customerName.trim()} on ${input.shootDate} (${input.startTime}-${input.endTime})`,
        adminEmails,
      })
    );

    await fsCommit(idToken, ops);
    res.status(201).json({ id: shootId, bookingCode });
  } catch (err) {
    handleRouteError(res, err, 'Failed to create shoot booking.');
  }
});

const shootUpdateSchema = z
  .object({
    shootDate: shootBookingSchema.shape.shootDate,
    shootType: shootBookingSchema.shape.shootType,
    venueResource: shootBookingSchema.shape.venueResource,
    startTime: shootBookingSchema.shape.startTime,
    endTime: shootBookingSchema.shape.endTime,
    paxCount: shootBookingSchema.shape.paxCount,
    assignedStaffId: shootBookingSchema.shape.assignedStaffId,
    customerName: shootBookingSchema.shape.customerName,
    customerPhone: shootBookingSchema.shape.customerPhone,
    totalPayment: shootBookingSchema.shape.totalPayment,
    specialNotes: shootBookingSchema.shape.specialNotes,
    status: shootBookingSchema.shape.status,
  })
  .refine((d) => d.endTime > d.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

apiRouter.patch('/shoots/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const shootId = req.params.id;
    const input = shootUpdateSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();
    const assignedStaffEmail = input.assignedStaffId.trim().toLowerCase();

    if (staff.role !== 'ADMIN' && assignedStaffEmail !== emailLower) {
      res.status(403).json({ error: 'Staff members may only assign photoshoots to themselves.' });
      return;
    }
    const assignedStaff = await fsGetDoc<Omit<StaffMember, 'id'>>(
      idToken,
      'staff',
      assignedStaffEmail
    );
    if (!assignedStaff?.isActive) {
      res.status(400).json({ error: 'Select an active authorized staff member.' });
      return;
    }

    const existing = await fsGetDoc<Omit<ShootBooking, 'id'>>(idToken, 'shoots', shootId);
    if (!existing) {
      res.status(404).json({ error: 'Photoshoot booking not found.' });
      return;
    }

    if (input.status !== 'Cancelled') {
      const [events, shoots, blocks] = await Promise.all([
        fsQueryArrayContains<Omit<EventBooking, 'id'>>(idToken, 'events', 'authorizedEmails', emailLower),
        fsQueryArrayContains<Omit<ShootBooking, 'id'>>(idToken, 'shoots', 'authorizedEmails', emailLower),
        fsQueryArrayContains<Omit<BlockedSchedule, 'id'>>(
          idToken,
          'blocked_schedules',
          'authorizedEmails',
          emailLower
        ),
      ]);
      const conflict = findVenueScheduleConflict({
        date: input.shootDate,
        startTime: input.startTime,
        endTime: input.endTime,
        venueResource: input.venueResource,
        bookingKind: 'SHOOT',
        excludeId: shootId,
        events,
        shoots,
        blocks,
      });
      if (conflict) {
        res.status(409).json({ error: conflict });
        return;
      }
    }

    const { authorizedEmails, adminEmails } = await getAccessLists(idToken, emailLower);
    const { duePayment, paymentStatus } = computePaymentSummary(
      input.totalPayment,
      existing.advancePayment
    );

    const payload: Record<string, unknown> = {
      shootDate: input.shootDate,
      shootType: input.shootType,
      venueResource: input.venueResource,
      startTime: input.startTime,
      endTime: input.endTime,
      paxCount: Number(input.paxCount),
      assignedStaffId: assignedStaffEmail,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      totalPayment: Number(input.totalPayment),
      advancePayment: existing.advancePayment,
      duePayment,
      paymentStatus,
      specialNotes: input.specialNotes?.trim() || '',
      status: input.status,
      authorizedEmails,
      updatedAt: SERVER_TIMESTAMP,
    };

    await fsCommit(idToken, [
      {
        type: 'update',
        collection: 'shoots',
        docId: shootId,
        data: payload,
        updateFields: Object.keys(payload),
      },
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'SHOOT_UPDATED',
        recordType: 'SHOOT',
        recordId: existing.bookingCode,
        summary: `Updated shoot ${existing.bookingCode} (${input.customerName.trim()}, status: ${input.status})`,
        adminEmails,
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Failed to update photoshoot booking.');
  }
});

// ==========================================
// ROOM TYPES CRUD
// ==========================================

apiRouter.post('/room-types', async (req: AuthenticatedRequest, res) => {
  try {
    const input = roomTypeSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();
    const { authorizedEmails, adminEmails } = await getAccessLists(idToken, emailLower);
    const roomTypeId = generateDocId('suite');

    const payload: Record<string, unknown> = {
      roomCode: input.roomCode.trim(),
      name: input.name.trim(),
      description: input.description.trim(),
      maxCapacity: Number(input.maxCapacity),
      price: Number(input.price),
      status: input.status,
      isArchived: false,
      authorizedEmails,
      createdBy: req.uid!,
      createdAt: SERVER_TIMESTAMP,
      updatedAt: SERVER_TIMESTAMP,
    };
    if (input.imageUrl && input.imageUrl.trim()) {
      payload.imageUrl = input.imageUrl.trim();
    }

    await fsCommit(idToken, [
      { type: 'set', collection: 'room_types', docId: roomTypeId, data: payload },
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'ROOM_TYPE_CREATED',
        recordType: 'ROOM_TYPE',
        recordId: input.roomCode.trim(),
        summary: `Added room type ${input.name.trim()} (${input.roomCode.trim()})`,
        adminEmails,
      }),
    ]);

    res.status(201).json({ id: roomTypeId });
  } catch (err) {
    handleRouteError(res, err, 'Failed to create room type.');
  }
});

apiRouter.patch('/room-types/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const roomTypeId = req.params.id;
    const input = roomTypeSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();

    const existing = await fsGetDoc<Omit<RoomType, 'id'>>(idToken, 'room_types', roomTypeId);
    if (!existing) {
      res.status(404).json({ error: 'Room type not found.' });
      return;
    }

    const { authorizedEmails, adminEmails } = await getAccessLists(idToken, emailLower);
    const payload: Record<string, unknown> = {
      roomCode: input.roomCode.trim(),
      name: input.name.trim(),
      description: input.description.trim(),
      maxCapacity: Number(input.maxCapacity),
      price: Number(input.price),
      status: input.status,
      imageUrl: input.imageUrl?.trim() || existing.imageUrl || '',
      authorizedEmails,
      updatedAt: SERVER_TIMESTAMP,
    };

    await fsCommit(idToken, [
      {
        type: 'update',
        collection: 'room_types',
        docId: roomTypeId,
        data: payload,
        updateFields: Object.keys(payload),
      },
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'ROOM_TYPE_UPDATED',
        recordType: 'ROOM_TYPE',
        recordId: input.roomCode.trim(),
        summary: `Updated room type ${input.name.trim()} (${input.status})`,
        adminEmails,
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Failed to update room type.');
  }
});

apiRouter.patch(
  '/room-types/:id/archive',
  requireAdminRole,
  async (req: AuthenticatedRequest, res) => {
    try {
      const roomTypeId = req.params.id;
      const archive = Boolean(req.body?.archive);
      const idToken = req.idToken!;
      const staff = req.staff!;
      const existing = await fsGetDoc<Omit<RoomType, 'id'>>(idToken, 'room_types', roomTypeId);
      if (!existing) {
        res.status(404).json({ error: 'Room type not found.' });
        return;
      }

      const { adminEmails } = await getAccessLists(idToken, staff.email.toLowerCase());
      await fsCommit(idToken, [
        {
          type: 'update',
          collection: 'room_types',
          docId: roomTypeId,
          data: { isArchived: archive, updatedAt: SERVER_TIMESTAMP },
          updateFields: ['isArchived'],
        },
        buildAuditOp({
          uid: req.uid!,
          email: staff.email,
          name: staff.name,
          action: archive ? 'ROOM_TYPE_ARCHIVED' : 'ROOM_TYPE_RESTORED',
          recordType: 'ROOM_TYPE',
          recordId: existing.roomCode,
          summary: `${archive ? 'Archived' : 'Restored'} room type ${existing.name}`,
          adminEmails,
        }),
      ]);
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err, 'Failed to archive/restore room type.');
    }
  }
);

// ==========================================
// ROOM BOOKINGS CRUD
// ==========================================

apiRouter.post('/room-bookings', async (req: AuthenticatedRequest, res) => {
  try {
    const input = roomBookingSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();

    const roomType = await fsGetDoc<Omit<RoomType, 'id'>>(idToken, 'room_types', input.roomTypeId);
    if (!roomType || roomType.isArchived) {
      res.status(404).json({ error: 'Selected room suite does not exist or is archived.' });
      return;
    }

    if (input.status !== 'Cancelled') {
      const [roomBookings, blocks] = await Promise.all([
        fsQueryArrayContains<Omit<RoomBooking, 'id'>>(
          idToken,
          'room_bookings',
          'authorizedEmails',
          emailLower
        ),
        fsQueryArrayContains<Omit<BlockedSchedule, 'id'>>(
          idToken,
          'blocked_schedules',
          'authorizedEmails',
          emailLower
        ),
      ]);
      const conflict = findRoomBookingConflict({
        roomTypeId: input.roomTypeId,
        checkInDate: input.checkInDate,
        checkInTime: input.checkInTime,
        checkOutDate: input.checkOutDate,
        checkOutTime: input.checkOutTime,
        roomBookings,
        blocks,
      });
      if (conflict) {
        res.status(409).json({ error: conflict });
        return;
      }
    }

    const { authorizedEmails, adminEmails } = await getAccessLists(idToken, emailLower);
    const bookingId = generateDocId('rom');
    const bookingCode = generateBookingCode('ROM');
    const { duePayment, paymentStatus } = computePaymentSummary(
      input.totalPayment,
      input.advancePayment
    );

    const bookingData: Record<string, unknown> = {
      bookingCode,
      roomTypeId: roomType.id,
      roomTypeName: roomType.name,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      foodStatus: input.foodStatus,
      checkInDate: input.checkInDate,
      checkInTime: input.checkInTime,
      checkOutDate: input.checkOutDate,
      checkOutTime: input.checkOutTime,
      totalPayment: Number(input.totalPayment),
      advancePayment: Number(input.advancePayment),
      duePayment,
      paymentStatus,
      status: input.status,
      isArchived: false,
      authorizedEmails,
      createdBy: req.uid!,
      createdByName: staff.name,
      createdAt: SERVER_TIMESTAMP,
      updatedAt: SERVER_TIMESTAMP,
    };
    if (input.specialNotes && input.specialNotes.trim()) {
      bookingData.specialNotes = input.specialNotes.trim();
    }

    const ops: CommitOperation[] = [
      { type: 'set', collection: 'room_bookings', docId: bookingId, data: bookingData },
    ];

    if (input.advancePayment > 0) {
      const payData: Record<string, unknown> = {
        paymentCode: generateBookingCode('PAY'),
        bookingId,
        bookingCode,
        bookingType: 'ROOM',
        customerName: input.customerName.trim(),
        amount: Number(input.advancePayment),
        paymentMethod: input.paymentMethod,
        paymentDate: getColomboDateStr(),
        notes: 'Initial advance payment at room reservation',
        isAdjustment: false,
        isVoided: false,
        recordedBy: req.uid!,
        recordedByName: staff.name,
        authorizedEmails,
        createdAt: SERVER_TIMESTAMP,
      };
      if (input.referenceNumber && input.referenceNumber.trim()) {
        payData.referenceNumber = input.referenceNumber.trim();
      }
      ops.push({ type: 'set', collection: 'payments', docId: generateDocId('pay'), data: payData });
    }

    ops.push(
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'ROOM_BOOKING_CREATED',
        recordType: 'ROOM',
        recordId: bookingCode,
        summary: `Reserved ${roomType.name} for ${input.customerName.trim()} (${input.checkInDate} to ${input.checkOutDate})`,
        adminEmails,
      })
    );

    await fsCommit(idToken, ops);
    res.status(201).json({ id: bookingId, bookingCode });
  } catch (err) {
    handleRouteError(res, err, 'Failed to create room reservation.');
  }
});

const roomUpdateSchema = z
  .object({
    roomTypeId: roomBookingSchema.shape.roomTypeId,
    customerName: roomBookingSchema.shape.customerName,
    customerPhone: roomBookingSchema.shape.customerPhone,
    foodStatus: roomBookingSchema.shape.foodStatus,
    checkInDate: roomBookingSchema.shape.checkInDate,
    checkInTime: roomBookingSchema.shape.checkInTime,
    checkOutDate: roomBookingSchema.shape.checkOutDate,
    checkOutTime: roomBookingSchema.shape.checkOutTime,
    totalPayment: roomBookingSchema.shape.totalPayment,
    specialNotes: roomBookingSchema.shape.specialNotes,
    status: roomBookingSchema.shape.status,
  })
  .refine(
    (d) => `${d.checkOutDate}T${d.checkOutTime}` > `${d.checkInDate}T${d.checkInTime}`,
    {
      message: 'Check-out date and time must be after check-in date and time',
      path: ['checkOutDate'],
    }
  );

apiRouter.patch('/room-bookings/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const bookingId = req.params.id;
    const input = roomUpdateSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();

    const [existing, roomType] = await Promise.all([
      fsGetDoc<Omit<RoomBooking, 'id'>>(idToken, 'room_bookings', bookingId),
      fsGetDoc<Omit<RoomType, 'id'>>(idToken, 'room_types', input.roomTypeId),
    ]);
    if (!existing) {
      res.status(404).json({ error: 'Room booking not found.' });
      return;
    }
    if (!roomType) {
      res.status(404).json({ error: 'Selected room suite not found.' });
      return;
    }

    if (input.status !== 'Cancelled' && input.status !== 'Checked-out') {
      const [roomBookings, blocks] = await Promise.all([
        fsQueryArrayContains<Omit<RoomBooking, 'id'>>(
          idToken,
          'room_bookings',
          'authorizedEmails',
          emailLower
        ),
        fsQueryArrayContains<Omit<BlockedSchedule, 'id'>>(
          idToken,
          'blocked_schedules',
          'authorizedEmails',
          emailLower
        ),
      ]);
      const conflict = findRoomBookingConflict({
        roomTypeId: input.roomTypeId,
        checkInDate: input.checkInDate,
        checkInTime: input.checkInTime,
        checkOutDate: input.checkOutDate,
        checkOutTime: input.checkOutTime,
        excludeId: bookingId,
        roomBookings,
        blocks,
      });
      if (conflict) {
        res.status(409).json({ error: conflict });
        return;
      }
    }

    const { authorizedEmails, adminEmails } = await getAccessLists(idToken, emailLower);
    const { duePayment, paymentStatus } = computePaymentSummary(
      input.totalPayment,
      existing.advancePayment
    );

    const payload: Record<string, unknown> = {
      roomTypeId: roomType.id,
      roomTypeName: roomType.name,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      foodStatus: input.foodStatus,
      checkInDate: input.checkInDate,
      checkInTime: input.checkInTime,
      checkOutDate: input.checkOutDate,
      checkOutTime: input.checkOutTime,
      totalPayment: Number(input.totalPayment),
      advancePayment: existing.advancePayment,
      duePayment,
      paymentStatus,
      specialNotes: input.specialNotes?.trim() || '',
      status: input.status,
      authorizedEmails,
      updatedAt: SERVER_TIMESTAMP,
    };

    await fsCommit(idToken, [
      {
        type: 'update',
        collection: 'room_bookings',
        docId: bookingId,
        data: payload,
        updateFields: Object.keys(payload),
      },
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'ROOM_BOOKING_UPDATED',
        recordType: 'ROOM',
        recordId: existing.bookingCode,
        summary: `Updated room reservation ${existing.bookingCode} (${input.customerName.trim()}, status: ${input.status})`,
        adminEmails,
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Failed to update room reservation.');
  }
});

// ==========================================
// ARCHIVE, RESTORE, PERMANENT DELETE
// ==========================================

const categoryParamSchema = z.enum(['EVENT', 'SHOOT', 'ROOM']);

apiRouter.post('/bookings/:category/:id/archive', async (req: AuthenticatedRequest, res) => {
  try {
    const category = categoryParamSchema.parse(req.params.category);
    const id = req.params.id;
    const col = collectionForCategory(category);
    const idToken = req.idToken!;
    const staff = req.staff!;

    const existing = await fsGetDoc<{ bookingCode: string }>(idToken, col, id);
    if (!existing) {
      res.status(404).json({ error: 'Booking record not found.' });
      return;
    }

    const { adminEmails } = await getAccessLists(idToken, staff.email.toLowerCase());
    await fsCommit(idToken, [
      {
        type: 'update',
        collection: col,
        docId: id,
        data: {
          isArchived: true,
          archivedAt: SERVER_TIMESTAMP,
          archivedBy: req.uid!,
          updatedAt: SERVER_TIMESTAMP,
        },
        updateFields: ['isArchived', 'archivedBy'],
      },
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'BOOKING_ARCHIVED',
        recordType: category,
        recordId: existing.bookingCode,
        summary: `Archived ${category.toLowerCase()} booking ${existing.bookingCode}`,
        adminEmails,
      }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Failed to archive booking.');
  }
});

apiRouter.post(
  '/bookings/:category/:id/restore',
  requireAdminRole,
  async (req: AuthenticatedRequest, res) => {
    try {
      const category = categoryParamSchema.parse(req.params.category);
      const id = req.params.id;
      const col = collectionForCategory(category);
      const idToken = req.idToken!;
      const staff = req.staff!;

      const existing = await fsGetDoc<{ bookingCode: string }>(idToken, col, id);
      if (!existing) {
        res.status(404).json({ error: 'Archived booking not found.' });
        return;
      }

      const { adminEmails } = await getAccessLists(idToken, staff.email.toLowerCase());
      await fsCommit(idToken, [
        {
          type: 'update',
          collection: col,
          docId: id,
          data: {
            isArchived: false,
            archivedAt: null,
            archivedBy: null,
            updatedAt: SERVER_TIMESTAMP,
          },
          updateFields: ['isArchived', 'archivedAt', 'archivedBy'],
        },
        buildAuditOp({
          uid: req.uid!,
          email: staff.email,
          name: staff.name,
          action: 'BOOKING_RESTORED',
          recordType: category,
          recordId: existing.bookingCode,
          summary: `Restored archived ${category.toLowerCase()} booking ${existing.bookingCode}`,
          adminEmails,
        }),
      ]);
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err, 'Failed to restore archived booking.');
    }
  }
);

apiRouter.delete(
  '/bookings/:category/:id',
  requireAdminRole,
  async (req: AuthenticatedRequest, res) => {
    try {
      const category = categoryParamSchema.parse(req.params.category);
      const id = req.params.id;
      const col = collectionForCategory(category);
      const idToken = req.idToken!;
      const staff = req.staff!;

      const existing = await fsGetDoc<{ bookingCode: string }>(idToken, col, id);
      if (!existing) {
        res.status(404).json({ error: 'Booking record not found.' });
        return;
      }

      const { adminEmails } = await getAccessLists(idToken, staff.email.toLowerCase());
      await fsCommit(idToken, [
        { type: 'delete', collection: col, docId: id },
        buildAuditOp({
          uid: req.uid!,
          email: staff.email,
          name: staff.name,
          action: 'BOOKING_DELETED',
          recordType: category,
          recordId: existing.bookingCode,
          summary: `Permanently deleted ${category.toLowerCase()} booking ${existing.bookingCode}`,
          adminEmails,
        }),
      ]);
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err, 'Failed to permanently delete booking.');
    }
  }
);

// ==========================================
// CENTRALIZED PAYMENTS
// ==========================================

const createPaymentRequestSchema = paymentSchema.extend({
  bookingId: z.string().min(1),
  bookingType: categoryParamSchema,
});

apiRouter.post('/payments', async (req: AuthenticatedRequest, res) => {
  try {
    const input = createPaymentRequestSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();

    if (input.amount < 0 && !input.isAdjustment) {
      res.status(400).json({ error: 'Negative payments are not allowed.' });
      return;
    }
    if (input.isAdjustment && staff.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only administrators can record payment adjustments.' });
      return;
    }
    if (input.isAdjustment && (!input.adjustmentReason || input.adjustmentReason.trim().length < 3)) {
      res.status(400).json({ error: 'An adjustment reason is required for adjustments.' });
      return;
    }

    const col = collectionForCategory(input.bookingType);
    const [booking, allPayments] = await Promise.all([
      fsGetDoc<{ bookingCode: string; customerName: string; totalPayment: number }>(
        idToken,
        col,
        input.bookingId
      ),
      fsQueryArrayContains<Omit<Payment, 'id'>>(
        idToken,
        'payments',
        'authorizedEmails',
        emailLower
      ),
    ]);

    if (!booking) {
      res.status(404).json({ error: 'Target booking no longer exists.' });
      return;
    }

    const priorValidTotal = allPayments
      .filter((p) => p.bookingId === input.bookingId && !p.isVoided)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const newTotalPaid = Number((priorValidTotal + input.amount).toFixed(2));
    if (newTotalPaid < 0) {
      res.status(400).json({ error: 'Resulting total paid balance cannot be negative.' });
      return;
    }
    if (newTotalPaid > booking.totalPayment && !(input.allowOverpayment && staff.role === 'ADMIN')) {
      res.status(400).json({
        error:
          'Payment would exceed the total booking amount. Admin authorization is required for overpayment.',
      });
      return;
    }

    const { duePayment, paymentStatus } = computePaymentSummary(
      booking.totalPayment,
      newTotalPaid
    );
    const { authorizedEmails, adminEmails } = await getAccessLists(idToken, emailLower);
    const payId = generateDocId('pay');
    const payCode = generateBookingCode('PAY');

    const payPayload: Record<string, unknown> = {
      paymentCode: payCode,
      bookingId: input.bookingId,
      bookingCode: booking.bookingCode,
      bookingType: input.bookingType,
      customerName: booking.customerName,
      amount: Number(input.amount),
      paymentMethod: input.paymentMethod,
      paymentDate: input.paymentDate,
      isAdjustment: input.isAdjustment,
      isVoided: false,
      recordedBy: req.uid!,
      recordedByName: staff.name,
      authorizedEmails,
      createdAt: SERVER_TIMESTAMP,
    };
    if (input.referenceNumber && input.referenceNumber.trim()) {
      payPayload.referenceNumber = input.referenceNumber.trim();
    }
    if (input.notes && input.notes.trim()) {
      payPayload.notes = input.notes.trim();
    }
    if (input.adjustmentReason && input.adjustmentReason.trim()) {
      payPayload.adjustmentReason = input.adjustmentReason.trim();
    }

    await fsCommit(idToken, [
      { type: 'set', collection: 'payments', docId: payId, data: payPayload },
      {
        type: 'update',
        collection: col,
        docId: input.bookingId,
        data: {
          advancePayment: newTotalPaid,
          duePayment,
          paymentStatus,
          updatedAt: SERVER_TIMESTAMP,
        },
        updateFields: ['advancePayment', 'duePayment', 'paymentStatus'],
      },
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: input.isAdjustment ? 'PAYMENT_ADJUSTED' : 'PAYMENT_RECORDED',
        recordType: 'PAYMENT',
        recordId: payCode,
        summary: `${input.isAdjustment ? 'Adjustment' : 'Payment'} of ${input.amount} (${input.paymentMethod}) on ${booking.bookingCode}. New paid total: ${newTotalPaid}`,
        adminEmails,
      }),
    ]);

    res.status(201).json({ id: payId, paymentCode: payCode });
  } catch (err) {
    handleRouteError(res, err, 'Failed to record payment.');
  }
});

apiRouter.post(
  '/payments/:id/void',
  requireAdminRole,
  async (req: AuthenticatedRequest, res) => {
    try {
      const paymentId = req.params.id;
      const reason = String(req.body?.reason || '').trim();
      if (reason.length < 3) {
        res.status(400).json({ error: 'A clear void reason is required for the audit log.' });
        return;
      }

      const idToken = req.idToken!;
      const staff = req.staff!;
      const emailLower = staff.email.toLowerCase();

      const payment = await fsGetDoc<Omit<Payment, 'id'>>(idToken, 'payments', paymentId);
      if (!payment) {
        res.status(404).json({ error: 'Payment record not found.' });
        return;
      }
      if (payment.isVoided) {
        res.status(400).json({ error: 'Payment is already voided.' });
        return;
      }

      const col = collectionForCategory(payment.bookingType);
      const [booking, allPayments] = await Promise.all([
        fsGetDoc<{ totalPayment: number }>(idToken, col, payment.bookingId),
        fsQueryArrayContains<Omit<Payment, 'id'>>(
          idToken,
          'payments',
          'authorizedEmails',
          emailLower
        ),
      ]);

      if (!booking) {
        res.status(404).json({ error: 'Parent booking not found.' });
        return;
      }

      const newTotalPaid = Math.max(
        0,
        allPayments
          .filter((p) => p.bookingId === payment.bookingId && !p.isVoided && p.id !== paymentId)
          .reduce((sum, p) => sum + Number(p.amount), 0)
      );

      const { duePayment, paymentStatus } = computePaymentSummary(
        booking.totalPayment,
        newTotalPaid
      );
      const { adminEmails } = await getAccessLists(idToken, emailLower);

      await fsCommit(idToken, [
        {
          type: 'update',
          collection: 'payments',
          docId: paymentId,
          data: {
            isVoided: true,
            adjustmentReason: `VOIDED: ${reason}`,
          },
          updateFields: ['isVoided', 'adjustmentReason'],
        },
        {
          type: 'update',
          collection: col,
          docId: payment.bookingId,
          data: {
            advancePayment: newTotalPaid,
            duePayment,
            paymentStatus,
            updatedAt: SERVER_TIMESTAMP,
          },
          updateFields: ['advancePayment', 'duePayment', 'paymentStatus'],
        },
        buildAuditOp({
          uid: req.uid!,
          email: staff.email,
          name: staff.name,
          action: 'PAYMENT_VOIDED',
          recordType: 'PAYMENT',
          recordId: payment.paymentCode,
          summary: `Voided payment ${payment.paymentCode} (${payment.amount}) on ${payment.bookingCode}. Reason: ${reason}`,
          adminEmails,
        }),
      ]);

      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err, 'Failed to void payment.');
    }
  }
);

// ==========================================
// CALENDAR BLOCKED SCHEDULES
// ==========================================

apiRouter.post('/calendar/blocks', async (req: AuthenticatedRequest, res) => {
  try {
    const input = blockedScheduleSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const emailLower = staff.email.toLowerCase();
    const { authorizedEmails, adminEmails } = await getAccessLists(idToken, emailLower);

    let roomTypeName = '';
    if (input.scope === 'ROOM') {
      if (!input.roomTypeId) {
        res.status(400).json({ error: 'Select a room suite when blocking a room.' });
        return;
      }
      const rt = await fsGetDoc<Omit<RoomType, 'id'>>(idToken, 'room_types', input.roomTypeId);
      if (!rt) {
        res.status(404).json({ error: 'Selected room suite not found.' });
        return;
      }
      roomTypeName = rt.name;
    }

    const blockId = generateDocId('blk');
    const payload: Record<string, unknown> = {
      scope: input.scope,
      startDate: input.startDate,
      endDate: input.endDate,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason.trim(),
      authorizedEmails,
      createdBy: req.uid!,
      createdByName: staff.name,
      createdAt: SERVER_TIMESTAMP,
    };
    if (input.scope === 'ROOM' && input.roomTypeId) {
      payload.roomTypeId = input.roomTypeId;
      payload.roomTypeName = roomTypeName;
    }

    await fsCommit(idToken, [
      { type: 'set', collection: 'blocked_schedules', docId: blockId, data: payload },
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'SCHEDULE_BLOCKED',
        recordType: 'CALENDAR',
        recordId: blockId,
        summary: `Blocked ${input.scope}${roomTypeName ? ` (${roomTypeName})` : ''} from ${input.startDate} ${input.startTime} to ${input.endDate} ${input.endTime}: ${input.reason.trim()}`,
        adminEmails,
      }),
    ]);

    res.status(201).json({ id: blockId });
  } catch (err) {
    handleRouteError(res, err, 'Failed to block calendar schedule.');
  }
});

apiRouter.delete('/calendar/blocks/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const blockId = req.params.id;
    const idToken = req.idToken!;
    const staff = req.staff!;
    const existing = await fsGetDoc<Omit<BlockedSchedule, 'id'>>(
      idToken,
      'blocked_schedules',
      blockId
    );
    if (!existing) {
      res.status(404).json({ error: 'Schedule block not found.' });
      return;
    }

    const { adminEmails } = await getAccessLists(idToken, staff.email.toLowerCase());
    await fsCommit(idToken, [
      { type: 'delete', collection: 'blocked_schedules', docId: blockId },
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'SCHEDULE_UNBLOCKED',
        recordType: 'CALENDAR',
        recordId: blockId,
        summary: `Removed schedule block (${existing.scope}: ${existing.startDate} to ${existing.endDate})`,
        adminEmails,
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Failed to remove schedule block.');
  }
});

// ==========================================
// 4-STAFF MANAGEMENT (ADMIN ONLY)
// ==========================================

async function buildSyncOps(
  idToken: string,
  callerEmail: string,
  callerUid: string,
  allStaff: StaffMember[]
): Promise<CommitOperation[]> {
  const activeEmails = uniqueEmails(
    allStaff.filter((s) => s.isActive).map((s) => s.email),
    SUPER_ADMIN_EMAIL
  );
  const adminEmails = uniqueEmails(
    allStaff.filter((s) => s.isActive && s.role === 'ADMIN').map((s) => s.email),
    SUPER_ADMIN_EMAIL
  );

  const ops: CommitOperation[] = [];
  const collectionsToSync = [
    'events',
    'shoots',
    'room_types',
    'room_bookings',
    'payments',
    'blocked_schedules',
  ];

  const snapshots = await Promise.all(
    collectionsToSync.map((col) =>
      fsQueryArrayContains(idToken, col, 'authorizedEmails', callerEmail)
    )
  );

  collectionsToSync.forEach((col, idx) => {
    const docs = snapshots[idx];
    for (const d of docs) {
      const data: Record<string, unknown> = {
        authorizedEmails: activeEmails,
      };
      if (col !== 'payments' && col !== 'blocked_schedules') {
        data.updatedAt = SERVER_TIMESTAMP;
      }
      ops.push({
        type: 'update',
        collection: col,
        docId: d.id,
        data,
        updateFields: ['authorizedEmails'],
      });
    }
  });

  for (const s of allStaff) {
    ops.push({
      type: 'update',
      collection: 'staff',
      docId: s.id,
      data: { adminEmails, updatedAt: SERVER_TIMESTAMP },
      updateFields: ['adminEmails'],
    });
  }

  ops.push({
    type: 'update',
    collection: 'villa_settings',
    docId: 'general',
    data: {
      authorizedEmails: activeEmails,
      adminEmails,
      updatedBy: callerUid,
      updatedAt: SERVER_TIMESTAMP,
    },
    updateFields: ['authorizedEmails', 'adminEmails', 'updatedBy'],
  });

  return ops;
}

apiRouter.post('/staff', requireAdminRole, async (req: AuthenticatedRequest, res) => {
  try {
    const input = staffSchema.parse(req.body);
    const idToken = req.idToken!;
    const staff = req.staff!;
    const callerEmail = staff.email.toLowerCase();

    const existingStaff = await fsQueryArrayContains<Omit<StaffMember, 'id'>>(
      idToken,
      'staff',
      'adminEmails',
      callerEmail
    );

    if (existingStaff.length >= MAX_STAFF_ACCOUNTS) {
      res.status(400).json({ error: `Maximum limit of ${MAX_STAFF_ACCOUNTS} authorized staff accounts reached.` });
      return;
    }

    const cleanEmail = input.email.trim().toLowerCase();
    const key = toEmailKey(cleanEmail);
    if (existingStaff.some((s) => s.id === key || s.email === cleanEmail)) {
      res.status(409).json({ error: 'A staff account with this email already exists.' });
      return;
    }

    const usedSlots = new Set(existingStaff.map((s) => s.slotNumber));
    const nextSlot = getNextStaffSlot(usedSlots);
    if (!nextSlot) {
      res.status(400).json({ error: `All ${MAX_STAFF_ACCOUNTS} staff slots are currently occupied.` });
      return;
    }

    const adminEmails = uniqueEmails(
      [
        ...existingStaff.filter((s) => s.isActive && s.role === 'ADMIN').map((s) => s.email),
        ...(input.isActive && input.role === 'ADMIN' ? [cleanEmail] : []),
      ],
      SUPER_ADMIN_EMAIL
    );

    const payload: Record<string, unknown> = {
      email: cleanEmail,
      name: input.name.trim(),
      role: input.role,
      slotNumber: nextSlot,
      isActive: input.isActive,
      adminEmails,
      createdBy: req.uid!,
      createdAt: SERVER_TIMESTAMP,
      updatedAt: SERVER_TIMESTAMP,
    };
    if (input.phone && input.phone.trim()) {
      payload.phone = input.phone.trim();
    }
    if (input.whatsappPhone && input.whatsappPhone.trim()) {
      payload.whatsappPhone = input.whatsappPhone.trim();
    }

    const newStaffRecord: StaffMember = {
      id: key,
      email: cleanEmail,
      name: input.name.trim(),
      role: input.role,
      slotNumber: nextSlot,
      whatsappPhone: input.whatsappPhone?.trim() || undefined,
      isActive: input.isActive,
      adminEmails,
      createdBy: req.uid!,
    };

    // Create staff doc first so sync updates (including updating this staff doc) apply cleanly
    await fsCommit(idToken, [{ type: 'set', collection: 'staff', docId: key, data: payload }]);

    const syncOps = await buildSyncOps(idToken, callerEmail, req.uid!, [
      ...existingStaff,
      newStaffRecord,
    ]);
    syncOps.push(
      buildAuditOp({
        uid: req.uid!,
        email: staff.email,
        name: staff.name,
        action: 'STAFF_CREATED',
        recordType: 'STAFF',
        recordId: key,
        summary: `Provisioned Slot #${nextSlot} (${input.role}) for ${cleanEmail}`,
        adminEmails,
      })
    );
    await fsCommit(idToken, syncOps);

    res.status(201).json({ id: key, slotNumber: nextSlot });
  } catch (err) {
    handleRouteError(res, err, 'Failed to provision staff account.');
  }
});

const staffUpdateSchema = z.object({
  name: staffSchema.shape.name,
  role: staffSchema.shape.role,
  phone: staffSchema.shape.phone,
  whatsappPhone: staffSchema.shape.whatsappPhone,
  isActive: staffSchema.shape.isActive,
});

apiRouter.patch('/staff/:id', requireAdminRole, async (req: AuthenticatedRequest, res) => {
  try {
    const staffId = req.params.id;
    const input = staffUpdateSchema.parse(req.body);
    const idToken = req.idToken!;
    const actor = req.staff!;
    const callerEmail = actor.email.toLowerCase();

    const existingStaff = await fsQueryArrayContains<Omit<StaffMember, 'id'>>(
      idToken,
      'staff',
      'adminEmails',
      callerEmail
    );
    const target = existingStaff.find((s) => s.id === staffId);
    if (!target) {
      res.status(404).json({ error: 'Staff account not found.' });
      return;
    }

    if (target.email === SUPER_ADMIN_EMAIL && (!input.isActive || input.role !== 'ADMIN')) {
      res
        .status(400)
        .json({ error: 'Primary Administrator account cannot be deactivated or demoted.' });
      return;
    }

    const updatedList = existingStaff.map((s) =>
      s.id === staffId
        ? {
            ...s,
            name: input.name,
            role: input.role,
            isActive: input.isActive,
            whatsappPhone: input.whatsappPhone?.trim() || '',
          }
        : s
    );
    const adminEmails = uniqueEmails(
      updatedList.filter((s) => s.isActive && s.role === 'ADMIN').map((s) => s.email),
      SUPER_ADMIN_EMAIL
    );

    const updatePayload: Record<string, unknown> = {
      name: input.name.trim(),
      role: input.role,
      isActive: input.isActive,
      phone: input.phone?.trim() || '',
      whatsappPhone: input.whatsappPhone?.trim() || '',
      adminEmails,
      updatedAt: SERVER_TIMESTAMP,
    };

    const syncOps = await buildSyncOps(idToken, callerEmail, req.uid!, updatedList);
    await fsCommit(idToken, [
      {
        type: 'update',
        collection: 'staff',
        docId: staffId,
        data: updatePayload,
        updateFields: ['name', 'role', 'isActive', 'phone', 'whatsappPhone', 'adminEmails'],
      },
      ...syncOps.filter((op) => !(op.collection === 'staff' && op.docId === staffId)),
      buildAuditOp({
        uid: req.uid!,
        email: actor.email,
        name: actor.name,
        action: 'STAFF_UPDATED',
        recordType: 'STAFF',
        recordId: staffId,
        summary: `Updated ${target.email}: role=${input.role}, active=${input.isActive}`,
        adminEmails,
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Failed to update staff account.');
  }
});

apiRouter.delete('/staff/:id', requireAdminRole, async (req: AuthenticatedRequest, res) => {
  try {
    const staffId = req.params.id;
    const idToken = req.idToken!;
    const actor = req.staff!;
    const callerEmail = actor.email.toLowerCase();

    const existingStaff = await fsQueryArrayContains<Omit<StaffMember, 'id'>>(
      idToken,
      'staff',
      'adminEmails',
      callerEmail
    );
    const target = existingStaff.find((s) => s.id === staffId);
    if (!target) {
      res.status(404).json({ error: 'Staff account not found.' });
      return;
    }
    if (target.email === SUPER_ADMIN_EMAIL) {
      res.status(400).json({ error: 'Primary Administrator account cannot be deleted.' });
      return;
    }

    const remaining = existingStaff.filter((s) => s.id !== staffId);
    const adminEmails = uniqueEmails(
      remaining.filter((s) => s.isActive && s.role === 'ADMIN').map((s) => s.email),
      SUPER_ADMIN_EMAIL
    );
    const syncOps = await buildSyncOps(idToken, callerEmail, req.uid!, remaining);

    await fsCommit(idToken, [
      { type: 'delete', collection: 'staff', docId: staffId },
      ...syncOps,
      buildAuditOp({
        uid: req.uid!,
        email: actor.email,
        name: actor.name,
        action: 'STAFF_REMOVED',
        recordType: 'STAFF',
        recordId: staffId,
        summary: `Removed staff access for ${target.email}`,
        adminEmails,
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Failed to remove staff account.');
  }
});

// ==========================================
// SETTINGS & BACKUP EXPORT (ADMIN ONLY)
// ==========================================

apiRouter.patch('/settings', requireAdminRole, async (req: AuthenticatedRequest, res) => {
  try {
    const input = settingsSchema.parse(req.body);
    const idToken = req.idToken!;
    const actor = req.staff!;
    const { authorizedEmails, adminEmails } = await getAccessLists(
      idToken,
      actor.email.toLowerCase()
    );

    await fsCommit(idToken, [
      {
        type: 'set',
        collection: 'villa_settings',
        docId: 'general',
        data: {
          villaName: input.villaName.trim(),
          timezone: VILLA_TIMEZONE,
          currency: input.currency,
          inactivityTimeoutMinutes: Number(input.inactivityTimeoutMinutes),
          authorizedEmails,
          adminEmails,
          updatedBy: req.uid!,
          updatedAt: SERVER_TIMESTAMP,
        },
      },
      buildAuditOp({
        uid: req.uid!,
        email: actor.email,
        name: actor.name,
        action: 'SETTINGS_UPDATED',
        recordType: 'SETTINGS',
        recordId: 'general',
        summary: `Updated villa settings: name="${input.villaName.trim()}", currency=${input.currency}, timeout=${input.inactivityTimeoutMinutes}m`,
        adminEmails,
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Failed to update villa settings.');
  }
});

apiRouter.get('/backup', requireAdminRole, async (req: AuthenticatedRequest, res) => {
  try {
    const idToken = req.idToken!;
    const emailLower = req.staff!.email.toLowerCase();
    const [events, shoots, roomTypes, roomBookings, payments, blockedSchedules, settings] =
      await Promise.all([
        fsQueryArrayContains(idToken, 'events', 'authorizedEmails', emailLower),
        fsQueryArrayContains(idToken, 'shoots', 'authorizedEmails', emailLower),
        fsQueryArrayContains(idToken, 'room_types', 'authorizedEmails', emailLower),
        fsQueryArrayContains(idToken, 'room_bookings', 'authorizedEmails', emailLower),
        fsQueryArrayContains(idToken, 'payments', 'authorizedEmails', emailLower),
        fsQueryArrayContains(idToken, 'blocked_schedules', 'authorizedEmails', emailLower),
        fsGetDoc<Omit<VillaSettings, 'id'>>(idToken, 'villa_settings', 'general'),
      ]);

    res.json({
      exportedAt: new Date().toISOString(),
      timezone: VILLA_TIMEZONE,
      villaName: settings?.villaName || 'Urban Escape Villa',
      events,
      shoots,
      roomTypes,
      roomBookings,
      payments,
      blockedSchedules,
    });
  } catch (err) {
    handleRouteError(res, err, 'Failed to generate operational backup.');
  }
});

function styleExcelSheet(sheet: ExcelJS.Worksheet, currencyCols: number[] = []): void {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF183D2D' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  currencyCols.forEach((colIdx) => {
    const col = sheet.getColumn(colIdx);
    col.numFmt = '#,##0.00';
    col.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  sheet.columns.forEach((column) => {
    let maxLen = 14;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const val = cell.value === null || cell.value === undefined ? '' : String(cell.value);
      maxLen = Math.max(maxLen, Math.min(48, val.length + 4));
    });
    column.width = maxLen;
  });
}

apiRouter.get('/backup/excel', requireAdminRole, async (req: AuthenticatedRequest, res) => {
  try {
    const idToken = req.idToken!;
    const emailLower = req.staff!.email.toLowerCase();
    const [events, shoots, roomTypes, roomBookings, payments, blockedSchedules, settings] =
      await Promise.all([
        fsQueryArrayContains<Omit<EventBooking, 'id'>>(
          idToken,
          'events',
          'authorizedEmails',
          emailLower
        ),
        fsQueryArrayContains<Omit<ShootBooking, 'id'>>(
          idToken,
          'shoots',
          'authorizedEmails',
          emailLower
        ),
        fsQueryArrayContains<Omit<RoomType, 'id'>>(
          idToken,
          'room_types',
          'authorizedEmails',
          emailLower
        ),
        fsQueryArrayContains<Omit<RoomBooking, 'id'>>(
          idToken,
          'room_bookings',
          'authorizedEmails',
          emailLower
        ),
        fsQueryArrayContains<Omit<Payment, 'id'>>(
          idToken,
          'payments',
          'authorizedEmails',
          emailLower
        ),
        fsQueryArrayContains<Omit<BlockedSchedule, 'id'>>(
          idToken,
          'blocked_schedules',
          'authorizedEmails',
          emailLower
        ),
        fsGetDoc<Omit<VillaSettings, 'id'>>(idToken, 'villa_settings', 'general'),
      ]);

    events.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
    shoots.sort((a, b) => b.shootDate.localeCompare(a.shootDate));
    roomTypes.sort((a, b) => a.roomCode.localeCompare(b.roomCode));
    roomBookings.sort((a, b) => b.checkInDate.localeCompare(a.checkInDate));
    payments.sort((a, b) => timestampToMs(b.createdAt) - timestampToMs(a.createdAt));
    blockedSchedules.sort((a, b) => a.startDate.localeCompare(b.startDate));

    const villaName = settings?.villaName || 'Urban Escape Villa';
    const currency = settings?.currency || 'LKR';
    const todayStr = getColomboDateStr();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = villaName;
    workbook.created = new Date();

    // 1. Summary Sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric' },
      { header: 'Value', key: 'value' },
    ];
    const activeEvents = events.filter((e) => !e.isArchived && e.status !== 'Cancelled');
    const activeShoots = shoots.filter((s) => !s.isArchived && s.status !== 'Cancelled');
    const activeRooms = roomBookings.filter((r) => !r.isArchived && r.status !== 'Cancelled');
    const totalRevenue =
      activeEvents.reduce((s, e) => s + e.totalPayment, 0) +
      activeShoots.reduce((s, x) => s + x.totalPayment, 0) +
      activeRooms.reduce((s, r) => s + r.totalPayment, 0);
    const totalAdvance =
      activeEvents.reduce((s, e) => s + e.advancePayment, 0) +
      activeShoots.reduce((s, x) => s + x.advancePayment, 0) +
      activeRooms.reduce((s, r) => s + r.advancePayment, 0);
    const totalDue =
      activeEvents.reduce((s, e) => s + e.duePayment, 0) +
      activeShoots.reduce((s, x) => s + x.duePayment, 0) +
      activeRooms.reduce((s, r) => s + r.duePayment, 0);

    summarySheet.addRows([
      { metric: 'Villa Name', value: villaName },
      { metric: 'Export Date (Asia/Colombo)', value: todayStr },
      { metric: 'Exported At (UTC)', value: new Date().toISOString() },
      { metric: 'Timezone', value: VILLA_TIMEZONE },
      { metric: 'Currency', value: currency },
      { metric: 'Total Event Bookings', value: events.length },
      { metric: 'Total Photoshoot Bookings', value: shoots.length },
      { metric: 'Total Room Bookings', value: roomBookings.length },
      { metric: 'Total Room Suites', value: roomTypes.length },
      { metric: 'Total Payment Transactions', value: payments.length },
      { metric: 'Total Blocked Schedules', value: blockedSchedules.length },
      { metric: `Active Gross Revenue (${currency})`, value: totalRevenue },
      { metric: `Active Collected Payments (${currency})`, value: totalAdvance },
      { metric: `Active Outstanding Due (${currency})`, value: totalDue },
    ]);
    styleExcelSheet(summarySheet);

    // 2. Event Bookings
    const eventSheet = workbook.addWorksheet('Event Bookings');
    eventSheet.columns = [
      { header: 'Booking ID', key: 'bookingCode' },
      { header: 'Event Type', key: 'eventType' },
      { header: 'Venue Resource', key: 'venueResource' },
      { header: 'Event Date', key: 'eventDate' },
      { header: 'Start Time', key: 'startTime' },
      { header: 'End Time', key: 'endTime' },
      { header: 'Pax Count', key: 'paxCount' },
      { header: 'Customer Name', key: 'customerName' },
      { header: 'Customer Phone', key: 'customerPhone' },
      { header: `Total (${currency})`, key: 'totalPayment' },
      { header: `Paid (${currency})`, key: 'advancePayment' },
      { header: `Due (${currency})`, key: 'duePayment' },
      { header: 'Payment Status', key: 'paymentStatus' },
      { header: 'Booking Status', key: 'status' },
      { header: 'Archived', key: 'isArchived' },
      { header: 'Special Notes', key: 'specialNotes' },
      { header: 'Created By', key: 'createdByName' },
      { header: 'Created At (Colombo)', key: 'createdAt' },
    ];
    events.forEach((e) =>
      eventSheet.addRow({
        bookingCode: e.bookingCode,
        eventType: e.eventType,
        venueResource: e.venueResource,
        eventDate: e.eventDate,
        startTime: e.startTime,
        endTime: e.endTime,
        paxCount: e.paxCount,
        customerName: e.customerName,
        customerPhone: e.customerPhone,
        totalPayment: e.totalPayment,
        advancePayment: e.advancePayment,
        duePayment: e.duePayment,
        paymentStatus: e.paymentStatus,
        status: e.status,
        isArchived: e.isArchived ? 'Yes' : 'No',
        specialNotes: e.specialNotes || '',
        createdByName: e.createdByName,
        createdAt: formatColomboTimestamp(e.createdAt),
      })
    );
    styleExcelSheet(eventSheet, [10, 11, 12]);

    // 3. Photoshoot Bookings
    const shootSheet = workbook.addWorksheet('Photoshoot Bookings');
    shootSheet.columns = [
      { header: 'Shoot ID', key: 'bookingCode' },
      { header: 'Shoot Type', key: 'shootType' },
      { header: 'Venue Resource', key: 'venueResource' },
      { header: 'Shoot Date', key: 'shootDate' },
      { header: 'Start Time', key: 'startTime' },
      { header: 'End Time', key: 'endTime' },
      { header: 'Customer Name', key: 'customerName' },
      { header: 'Customer Phone', key: 'customerPhone' },
      { header: `Total (${currency})`, key: 'totalPayment' },
      { header: `Paid (${currency})`, key: 'advancePayment' },
      { header: `Due (${currency})`, key: 'duePayment' },
      { header: 'Payment Status', key: 'paymentStatus' },
      { header: 'Booking Status', key: 'status' },
      { header: 'Archived', key: 'isArchived' },
      { header: 'Special Notes', key: 'specialNotes' },
      { header: 'Created By', key: 'createdByName' },
      { header: 'Created At (Colombo)', key: 'createdAt' },
    ];
    shoots.forEach((s) =>
      shootSheet.addRow({
        bookingCode: s.bookingCode,
        shootType: s.shootType,
        venueResource: s.venueResource,
        shootDate: s.shootDate,
        startTime: s.startTime,
        endTime: s.endTime,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        totalPayment: s.totalPayment,
        advancePayment: s.advancePayment,
        duePayment: s.duePayment,
        paymentStatus: s.paymentStatus,
        status: s.status,
        isArchived: s.isArchived ? 'Yes' : 'No',
        specialNotes: s.specialNotes || '',
        createdByName: s.createdByName,
        createdAt: formatColomboTimestamp(s.createdAt),
      })
    );
    styleExcelSheet(shootSheet, [9, 10, 11]);

    // 4. Room Bookings
    const roomBookingSheet = workbook.addWorksheet('Room Bookings');
    roomBookingSheet.columns = [
      { header: 'Booking ID', key: 'bookingCode' },
      { header: 'Room Suite', key: 'roomTypeName' },
      { header: 'Food Status', key: 'foodStatus' },
      { header: 'Check-in Date', key: 'checkInDate' },
      { header: 'Check-in Time', key: 'checkInTime' },
      { header: 'Check-out Date', key: 'checkOutDate' },
      { header: 'Check-out Time', key: 'checkOutTime' },
      { header: 'Customer Name', key: 'customerName' },
      { header: 'Customer Phone', key: 'customerPhone' },
      { header: `Total (${currency})`, key: 'totalPayment' },
      { header: `Paid (${currency})`, key: 'advancePayment' },
      { header: `Due (${currency})`, key: 'duePayment' },
      { header: 'Payment Status', key: 'paymentStatus' },
      { header: 'Booking Status', key: 'status' },
      { header: 'Archived', key: 'isArchived' },
      { header: 'Special Notes', key: 'specialNotes' },
      { header: 'Created By', key: 'createdByName' },
      { header: 'Created At (Colombo)', key: 'createdAt' },
    ];
    roomBookings.forEach((r) =>
      roomBookingSheet.addRow({
        bookingCode: r.bookingCode,
        roomTypeName: r.roomTypeName,
        foodStatus: r.foodStatus,
        checkInDate: r.checkInDate,
        checkInTime: r.checkInTime,
        checkOutDate: r.checkOutDate,
        checkOutTime: r.checkOutTime,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        totalPayment: r.totalPayment,
        advancePayment: r.advancePayment,
        duePayment: r.duePayment,
        paymentStatus: r.paymentStatus,
        status: r.status,
        isArchived: r.isArchived ? 'Yes' : 'No',
        specialNotes: r.specialNotes || '',
        createdByName: r.createdByName,
        createdAt: formatColomboTimestamp(r.createdAt),
      })
    );
    styleExcelSheet(roomBookingSheet, [10, 11, 12]);

    // 5. Room Suites
    const roomTypeSheet = workbook.addWorksheet('Room Suites');
    roomTypeSheet.columns = [
      { header: 'Room Code', key: 'roomCode' },
      { header: 'Suite Name', key: 'name' },
      { header: 'Max Capacity', key: 'maxCapacity' },
      { header: `Rate (${currency})`, key: 'price' },
      { header: 'Status', key: 'status' },
      { header: 'Archived', key: 'isArchived' },
      { header: 'Description', key: 'description' },
    ];
    roomTypes.forEach((rt) =>
      roomTypeSheet.addRow({
        roomCode: rt.roomCode,
        name: rt.name,
        maxCapacity: rt.maxCapacity,
        price: rt.price,
        status: rt.status,
        isArchived: rt.isArchived ? 'Yes' : 'No',
        description: rt.description,
      })
    );
    styleExcelSheet(roomTypeSheet, [4]);

    // 6. Payments Ledger
    const paymentSheet = workbook.addWorksheet('Payments Ledger');
    paymentSheet.columns = [
      { header: 'Payment ID', key: 'paymentCode' },
      { header: 'Booking ID', key: 'bookingCode' },
      { header: 'Booking Type', key: 'bookingType' },
      { header: 'Customer Name', key: 'customerName' },
      { header: `Amount (${currency})`, key: 'amount' },
      { header: 'Method', key: 'paymentMethod' },
      { header: 'Payment Date', key: 'paymentDate' },
      { header: 'Reference Number', key: 'referenceNumber' },
      { header: 'Adjustment', key: 'isAdjustment' },
      { header: 'Voided', key: 'isVoided' },
      { header: 'Notes / Void Reason', key: 'notes' },
      { header: 'Recorded By', key: 'recordedByName' },
      { header: 'Created At (Colombo)', key: 'createdAt' },
    ];
    payments.forEach((p) =>
      paymentSheet.addRow({
        paymentCode: p.paymentCode,
        bookingCode: p.bookingCode,
        bookingType: p.bookingType,
        customerName: p.customerName,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        paymentDate: p.paymentDate,
        referenceNumber: p.referenceNumber || '',
        isAdjustment: p.isAdjustment ? 'Yes' : 'No',
        isVoided: p.isVoided ? 'Yes' : 'No',
        notes: [p.notes, p.adjustmentReason].filter(Boolean).join(' | '),
        recordedByName: p.recordedByName,
        createdAt: formatColomboTimestamp(p.createdAt),
      })
    );
    styleExcelSheet(paymentSheet, [5]);

    // 7. Blocked Schedules
    const blockSheet = workbook.addWorksheet('Blocked Schedules');
    blockSheet.columns = [
      { header: 'Scope', key: 'scope' },
      { header: 'Suite Name', key: 'roomTypeName' },
      { header: 'Start Date', key: 'startDate' },
      { header: 'Start Time', key: 'startTime' },
      { header: 'End Date', key: 'endDate' },
      { header: 'End Time', key: 'endTime' },
      { header: 'Reason', key: 'reason' },
      { header: 'Created By', key: 'createdByName' },
    ];
    blockedSchedules.forEach((b) =>
      blockSheet.addRow({
        scope: b.scope,
        roomTypeName: b.roomTypeName || '—',
        startDate: b.startDate,
        startTime: b.startTime,
        endDate: b.endDate,
        endTime: b.endTime,
        reason: b.reason,
        createdByName: b.createdByName,
      })
    );
    styleExcelSheet(blockSheet);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="urban-escape-villa-backup-${todayStr}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  } catch (err) {
    handleRouteError(res, err, 'Failed to generate Excel operational backup.');
  }
});
