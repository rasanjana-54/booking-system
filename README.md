# Urban Escape Villa — Private Villa Management System

A private internal operations portal built for **up to 6 authorized villa management staff accounts** (`ADMIN` and `STAFF` roles). Public registration and public customer access are strictly disabled.

## Architecture Overview

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, React Router, Axios, React Hook Form, Zod validation, Lucide Icons.
- **Backend**: Node.js + Express.js (`server.ts`, `src/server/routes/api.ts`), TypeScript REST API, Helmet security headers, `express-rate-limit`, CSRF origin/header verification, and server-side Firebase ID token verification.
- **Database & Auth**: Firebase Authentication (Google Sign-In) + Cloud Firestore with hardened zero-trust security rules (`firestore.rules`) and schema blueprint (`firebase-blueprint.json`).
- **Timezone Standard**: All date filtering, availability checks, and timestamps strictly evaluate in `Asia/Colombo` (`UTC+05:30`).

## Data Model & Relationships

1. **`staff/{staffId}`**: Stores up to 6 authorized staff slots (`slotNumber` 1–6), email allowlist, role (`ADMIN` | `STAFF`), active flag, and last login timestamp.
2. **`events/{eventId}`**: Event bookings (`EVT-YYYY-NNNN`) with venue resource (`Full Estate`, `Main Lawn & Poolside`, `Indoor Courtyard`, `Garden Pavilion`), date, time window, guest count, payment summary, and archival flags.
3. **`shoots/{shootId}`**: Photoshoot & video shoot bookings (`SHT-YYYY-NNNN`) sharing venue conflict checks with events and blocked schedules.
4. **`room_types/{roomTypeId}`**: Suite inventory (code, name, description, capacity, nightly rate, status, photography).
5. **`room_bookings/{bookingId}`**: Suite reservations (`ROM-YYYY-NNNN`) referencing `roomTypeId`, with meal status (`Included`, `Not Included`, `Pending`), check-in/out dates and times, and overlap protection per suite.
6. **`payments/{paymentId}`**: Centralized transactional ledger (`PAY-YYYY-NNNN`) linked to `bookingId` and `bookingType` (`EVENT` | `SHOOT` | `ROOM`), supporting multi-payment history, automatic due calculation, and Admin-only void/adjustment workflows.
7. **`blocked_schedules/{blockId}`**: Staff-managed unavailability windows (`FULL_VILLA`, `EVENT_GROUNDS`, `SHOOT_GROUNDS`, `ROOM`).
8. **`audit_logs/{logId}`**: Immutable chronological trail (Admin-readable only) recording logins, logouts, session expirations, bookings, payments, staff provisioning, and settings updates.
9. **`villa_settings/general`**: Villa name, currency (`LKR` / `USD`), `Asia/Colombo` timezone, and inactivity timeout duration.
10. **`whatsapp_reminders/{reminderId}`**: Idempotent weekly photoshoot reminder attempts, staff recipient, delivery state, timestamps, and failure/skip reasons.

## Security Safeguards

- **6-Account Private Allowlist**: Bootstrapped administrator (`rnimsara54@gmail.com`) provisions up to 5 additional staff Google accounts in Staff Management. Unauthorized or deactivated Google accounts are denied across React routes, Express API middleware, and Firestore Security Rules.
- **Role-Based Access Control (RBAC)**: Only `ADMIN` accounts can manage staff, view audit logs, restore or permanently delete archived records, void/adjust payments, export backups, and update villa settings.
- **Express API Security**: Helmet headers, rate limiting on auth and API endpoints, CSRF validation on state-changing requests, Zod input validation, and server-side schedule conflict enforcement.
- **Inactivity Session Expiration**: Tracks user activity and automatically signs out after the configured idle timeout (default 30 minutes) with a 2-minute warning prompt.
- **Hardened Firestore Security Rules**: Enforces strict field schemas (`isValid*`), server timestamps (`request.time`), immutable creator fields, terminal state locking, and non-blanket `allow list` resource filtering.

## Setup & Deployment

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Lint security rules & TypeScript**:
   ```bash
   npx eslint firestore.rules
   npm run lint
   ```
3. **Run full-stack development server (Express + Vite middleware on port 3000)**:
   ```bash
   npm run dev
   ```
4. **Build & run production server**:
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```

## Weekly WhatsApp Photoshoot Reminders

- The Vercel production cron runs every Sunday at `06:30 UTC`, which is 12:00 noon in `Asia/Colombo`. It considers shoots from that Sunday up to (but not including) the following Sunday.
- Each shoot requires an assigned active staff account. Enter that staff member's WhatsApp number in Staff Management using E.164 format, such as `+94771234567`. Legacy shoots without assignments or valid numbers are recorded as skipped.
- Reminder documents use a deterministic week-and-booking ID and a Firestore transaction to claim sends. A previously sent reminder is not sent again if the cron is invoked again. Failed messages are available to admins on the WhatsApp Reminders page. An attempt left pending after a timeout is treated as ambiguous and is not automatically resent.
- Firestore is schemaless, so there is no SQL migration. Deploy the updated `firestore.rules` and `firebase-blueprint.json`; the new collection is created when a reminder is first recorded.

### Meta WhatsApp Cloud API configuration

1. Create/configure a Meta WhatsApp Business Cloud API sender and confirm the staff recipients have opted in to receive operational WhatsApp notifications.
2. Create and get approval for a business-initiated message template in Meta. Configure seven body text parameters in this order: client name, shoot date, time range, shoot type, guests/pax, villa/location, and special notes. The cron sends the approved template, not an arbitrary free-form message.
3. Add the server-only values from `.env.example` to Vercel Project Settings → Environment Variables for Production:
   - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_API_VERSION` for the Cloud API.
   - `WHATSAPP_TEMPLATE_NAME` and `WHATSAPP_TEMPLATE_LANGUAGE` matching the approved template.
   - `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` for signed delivery-status callbacks.
   - `CRON_SECRET` as a long random secret. Vercel uses it to send `Authorization: Bearer <CRON_SECRET>` with cron requests.
   - `FIREBASE_SERVICE_ACCOUNT_JSON` as the service account JSON string with Firestore data access, and optionally `VILLA_LOCATION` to override the villa name in the message.
   Do not use a `VITE_` prefix, expose these values to the browser, or commit real credentials.
4. Configure the Meta webhook callback URL as `https://<production-host>/api/webhooks/whatsapp`, set its verify token to `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and subscribe to WhatsApp message status updates. Incoming callbacks are accepted only when their `X-Hub-Signature-256` matches `WHATSAPP_APP_SECRET`.
5. Deploy to Vercel Production. Vercel Cron jobs run only for production deployments; this repository's `vercel.json` maps Sunday noon Colombo to `30 6 * * 0` UTC. Verify the cron invocation and review delivery/failure state in the admin WhatsApp Reminders page.

The app's `/api/cron/whatsapp-reminders` endpoint is authenticated and should not be invoked by an external unauthenticated scheduler. A cron run with missing Meta configuration is recorded as failed rather than silently reporting success.
