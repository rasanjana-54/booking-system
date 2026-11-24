# Villa Management System — Security Specification

## 1. Data Invariants

1. **Zero Public Access**: No unauthenticated or non-staff user can read, list, create, update, or delete any villa operational document (`staff`, `events`, `shoots`, `room_types`, `room_bookings`, `payments`, `blocked_schedules`, `audit_logs`, `villa_settings`).
2. **6-Staff Account Cap**: Only the bootstrapped administrator (`rnimsara54@gmail.com`) and up to 5 additional authorized staff accounts (`slotNumber` in `{1, 2, 3, 4, 5, 6}`) can hold active access.
3. **Admin-Only Governance**: Only `ADMIN` users can create, edit, activate/deactivate, or delete `staff` records; permanently delete or restore archived bookings; void/adjust payment records; update `villa_settings`; or read `audit_logs`.
4. **Temporal & Identity Integrity**: All `createdAt`, `updatedAt`, and `timestamp` fields are strictly enforced against `request.time`. All creator/recorder UID fields must equal `request.auth.uid`.
5. **Terminal State Locking**: Bookings in terminal states (`Cancelled`, `Completed`, `Checked-out`) cannot be altered by `STAFF` accounts; only `ADMIN` overrides are permitted.
6. **Immutable Audit & Payment Trail**: `audit_logs` cannot be updated or deleted by anyone; `payments` cannot be deleted.
7. **PII & Query Isolation**: `allow list` rules strictly evaluate `resource.data` (`authorizedEmails` / `adminEmails` / self `email`) without `get()`/`exists()` lookups.

## 2. The "Dirty Dozen" Attack Payloads

1. **Unauthenticated Booking Read**: `auth = null` attempting `get(/events/evt_1)` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'x', token: { email: 'rnimsara54@gmail.com', email_verified: false } }` -> `PERMISSION_DENIED`.
3. **External Google User Blanket List**: Authenticated user `outsider@gmail.com` querying `list(/events)` -> `PERMISSION_DENIED`.
4. **Staff Self-Promotion**: `STAFF` user updating `/staff/staff_email_key` with `{ role: 'ADMIN' }` -> `PERMISSION_DENIED`.
5. **Exceeding 6-Staff Limit**: Creating a `staff` doc with `slotNumber: 7` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: Creating an `events` doc with extra field `isVipOverride: true` -> `PERMISSION_DENIED`.
7. **ID Poisoning**: Creating `/events/invalid$id..` or 200-char ID -> `PERMISSION_DENIED`.
8. **Backdated Timestamp Spoofing**: Creating a booking with `createdAt: '2020-01-01T00:00:00Z'` instead of `request.time` -> `PERMISSION_DENIED`.
9. **Identity Spoofing on Payment**: Creating a payment with `recordedBy: 'another_staff_uid'` -> `PERMISSION_DENIED`.
10. **Staff Negative Payment / Adjustment**: `STAFF` user creating a payment with `amount: -5000` or `isAdjustment: true` -> `PERMISSION_DENIED`.
11. **Staff Restoring or Deleting Archived Booking**: `STAFF` user setting `isArchived: false` or calling `deleteDoc` -> `PERMISSION_DENIED`.
12. **Staff Reading Audit Logs**: `STAFF` user attempting `get(/audit_logs/log_1)` or `list(/audit_logs)` -> `PERMISSION_DENIED`.
