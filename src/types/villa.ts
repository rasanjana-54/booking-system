import type { Timestamp } from 'firebase/firestore';

export type FirestoreTimestampLike = Timestamp | string | null | undefined;

export type StaffRole = 'ADMIN' | 'STAFF';
export type CurrencyCode = 'LKR' | 'USD';

export type BookingCategory = 'EVENT' | 'SHOOT' | 'ROOM';

export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'FULLY_PAID' | 'OVERPAID';

export type VenueResource =
  | 'Full Estate'
  | 'Main Lawn & Poolside'
  | 'Indoor Courtyard'
  | 'Garden Pavilion';

export type EventType =
  | 'Wedding'
  | 'Birthday'
  | 'Engagement'
  | 'Corporate Event'
  | 'Private Party'
  | 'Other';

export type EventStatus = 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';

export type ShootType =
  | 'Photography'
  | 'Videography'
  | 'Wedding Shoot'
  | 'Fashion Shoot'
  | 'Commercial Shoot'
  | 'Other';

export type ShootStatus = 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';

export type RoomTypeStatus = 'Available' | 'Maintenance' | 'Inactive';

export type FoodStatus = 'Included' | 'Not Included' | 'Pending';

export type RoomBookingStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Checked-in'
  | 'Checked-out'
  | 'Cancelled';

export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Card' | 'Other';

export type BlockScope = 'FULL_VILLA' | 'EVENT_GROUNDS' | 'SHOOT_GROUNDS' | 'ROOM';

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  slotNumber: 1 | 2 | 3 | 4;
  phone?: string;
  isActive: boolean;
  uid?: string;
  lastLoginAt?: FirestoreTimestampLike;
  adminEmails: string[];
  createdBy: string;
  createdAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
}

export interface EventBooking {
  id: string;
  bookingCode: string;
  eventType: EventType;
  venueResource: VenueResource;
  eventDate: string; // YYYY-MM-DD (Asia/Colombo)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  paxCount: number;
  customerName: string;
  customerPhone: string;
  totalPayment: number;
  advancePayment: number;
  duePayment: number;
  paymentStatus: PaymentStatus;
  specialNotes?: string;
  status: EventStatus;
  isArchived: boolean;
  archivedAt?: FirestoreTimestampLike;
  archivedBy?: string | null;
  authorizedEmails: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
}

export interface ShootBooking {
  id: string;
  bookingCode: string;
  shootDate: string; // YYYY-MM-DD (Asia/Colombo)
  shootType: ShootType;
  venueResource: VenueResource;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  customerName: string;
  customerPhone: string;
  totalPayment: number;
  advancePayment: number;
  duePayment: number;
  paymentStatus: PaymentStatus;
  specialNotes?: string;
  status: ShootStatus;
  isArchived: boolean;
  archivedAt?: FirestoreTimestampLike;
  archivedBy?: string | null;
  authorizedEmails: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
}

export interface RoomType {
  id: string;
  roomCode: string;
  name: string;
  description: string;
  maxCapacity: number;
  price: number;
  status: RoomTypeStatus;
  imageUrl?: string;
  isArchived: boolean;
  authorizedEmails: string[];
  createdBy: string;
  createdAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
}

export interface RoomBooking {
  id: string;
  bookingCode: string;
  roomTypeId: string;
  roomTypeName: string;
  customerName: string;
  customerPhone: string;
  foodStatus: FoodStatus;
  checkInDate: string; // YYYY-MM-DD
  checkInTime: string; // HH:mm
  checkOutDate: string; // YYYY-MM-DD
  checkOutTime: string; // HH:mm
  totalPayment: number;
  advancePayment: number;
  duePayment: number;
  paymentStatus: PaymentStatus;
  specialNotes?: string;
  status: RoomBookingStatus;
  isArchived: boolean;
  archivedAt?: FirestoreTimestampLike;
  archivedBy?: string | null;
  authorizedEmails: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
}

export interface Payment {
  id: string;
  paymentCode: string;
  bookingId: string;
  bookingCode: string;
  bookingType: BookingCategory;
  customerName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string; // YYYY-MM-DD
  referenceNumber?: string;
  notes?: string;
  isAdjustment: boolean;
  adjustmentReason?: string;
  isVoided: boolean;
  recordedBy: string;
  recordedByName: string;
  authorizedEmails: string[];
  createdAt?: FirestoreTimestampLike;
}

export interface BlockedSchedule {
  id: string;
  scope: BlockScope;
  roomTypeId?: string | null;
  roomTypeName?: string | null;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  authorizedEmails: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: FirestoreTimestampLike;
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  recordType: string;
  recordId: string;
  summary: string;
  adminEmails: string[];
  timestamp?: FirestoreTimestampLike;
}

export interface VillaSettings {
  id: string;
  villaName: string;
  timezone: string;
  currency: CurrencyCode;
  inactivityTimeoutMinutes: number;
  authorizedEmails: string[];
  adminEmails: string[];
  updatedBy: string;
  updatedAt?: FirestoreTimestampLike;
}

export type UnifiedBooking =
  | { category: 'EVENT'; data: EventBooking }
  | { category: 'SHOOT'; data: ShootBooking }
  | { category: 'ROOM'; data: RoomBooking };
