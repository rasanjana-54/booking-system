# Urban Escape Villa — Private Villa Management System

A private internal operations portal built for **up to 4 authorized villa management staff accounts** (`ADMIN` and `STAFF` roles). Public registration and public customer access are strictly disabled.

## Architecture Overview

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, React Router, Axios, React Hook Form, Zod validation, Lucide Icons.
- **Backend**: Node.js + Express.js (`server.ts`, `src/server/routes/api.ts`), TypeScript REST API, Helmet security headers, `express-rate-limit`, CSRF origin/header verification, and server-side Firebase ID token verification.
- **Database & Auth**: Firebase Authentication (email/password) + Cloud Firestore with hardened zero-trust security rules (`firestore.rules`) and schema blueprint (`firebase-blueprint.json`).
- **Timezone Standard**: All date filtering, availability checks, and timestamps strictly evaluate in `Asia/Colombo` (`UTC+05:30`).

## Data Model & Relationships

1. **`staff/{staffId}`**: Stores up to 4 authorized staff slots (`slotNumber` 1–4), email allowlist, role (`ADMIN` | `STAFF`), active flag, and last login timestamp.
2. **`events/{eventId}`**: Event bookings (`EVT-YYYY-NNNN`) with venue resource (`Full Estate`, `Main Lawn & Poolside`, `Indoor Courtyard`, `Garden Pavilion`), date, time window, guest count, payment summary, and archival flags.
3. **`shoots/{shootId}`**: Photoshoot & video shoot bookings (`SHT-YYYY-NNNN`) sharing venue conflict checks with events and blocked schedules.
4. **`room_types/{roomTypeId}`**: Suite inventory (code, name, description, capacity, nightly rate, status, photography).
5. **`room_bookings/{bookingId}`**: Suite reservations (`ROM-YYYY-NNNN`) referencing `roomTypeId`, with meal status (`Included`, `Not Included`, `Pending`), check-in/out dates and times, and overlap protection per suite.
6. **`payments/{paymentId}`**: Centralized transactional ledger (`PAY-YYYY-NNNN`) linked to `bookingId` and `bookingType` (`EVENT` | `SHOOT` | `ROOM`), supporting multi-payment history, automatic due calculation, and Admin-only void/adjustment workflows.
7. **`blocked_schedules/{blockId}`**: Staff-managed unavailability windows (`FULL_VILLA`, `EVENT_GROUNDS`, `SHOOT_GROUNDS`, `ROOM`).
8. **`audit_logs/{logId}`**: Immutable chronological trail (Admin-readable only) recording logins, logouts, session expirations, bookings, payments, staff provisioning, and settings updates.
9. **`villa_settings/general`**: Villa name, currency (`LKR` / `USD`), `Asia/Colombo` timezone, and inactivity timeout duration.

## Security Safeguards

- **4-Account Private Allowlist**: Bootstrapped administrator (`rnimsara54@gmail.com`) provisions up to 3 additional staff email accounts in Staff Management. Unauthorized or deactivated accounts are denied across React routes, Express API middleware, and Firestore Security Rules.
- **Role-Based Access Control (RBAC)**: Only `ADMIN` accounts can manage staff, view audit logs, restore or permanently delete archived records, void/adjust payments, export backups, and update villa settings.
- **Express API Security**: Helmet headers, rate limiting on auth and API endpoints, CSRF validation on state-changing requests, Zod input validation, and server-side schedule conflict enforcement.
- **Inactivity Session Expiration**: Tracks user activity and automatically signs out after the configured idle timeout (default 30 minutes) with a 2-minute warning prompt.
- **Hardened Firestore Security Rules**: Enforces strict field schemas (`isValid*`), server timestamps (`request.time`), immutable creator fields, terminal state locking, and non-blanket `allow list` resource filtering.

## Setup & Deployment

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Configure Firebase Authentication**: Enable the Email/Password provider in Firebase Console and create a password-based Firebase Authentication user for each authorized staff email. Staff Management only maintains the application allowlist; it does not create Authentication users. Staff must use verified email accounts.
3. **Lint security rules & TypeScript**:
   ```bash
   npx eslint firestore.rules
   npm run lint
   ```
4. **Run full-stack development server (Express + Vite middleware on port 3000)**:
   ```bash
   npm run dev
   ```
5. **Build & run production server**:
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```
