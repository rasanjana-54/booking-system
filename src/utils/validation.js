import { z } from "zod";
const dateRegex = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const timeRegex = /^[0-9]{2}:[0-9]{2}$/;
const phoneRegex = /^[+0-9\s\-()]{5,30}$/;
const whatsAppPhoneRegex = /^\+[1-9][0-9]{7,14}$/;
const whatsAppPhoneSchema = z.string().trim().optional().or(z.literal("")).refine((value) => !value || whatsAppPhoneRegex.test(value), {
  message: "Enter a WhatsApp number in international format, e.g. +94771234567"
});
const venueResources = [
  "Full Estate",
  "Main Lawn & Poolside",
  "Indoor Courtyard",
  "Garden Pavilion"
];
const eventBookingSchema = z.object({
  eventType: z.enum([
    "Wedding",
    "Birthday",
    "Engagement",
    "Corporate Event",
    "Private Party",
    "Other"
  ]),
  venueResource: z.enum(venueResources),
  eventDate: z.string().regex(dateRegex, "Valid date (YYYY-MM-DD) is required"),
  startTime: z.string().regex(timeRegex, "Valid start time is required"),
  endTime: z.string().regex(timeRegex, "Valid end time is required"),
  paxCount: z.coerce.number().int("Guest count must be a whole number").min(1, "At least 1 guest required").max(1e3, "Maximum 1000 guests"),
  customerName: z.string().trim().min(2, "Customer name must be at least 2 characters").max(120, "Maximum 120 characters"),
  customerPhone: z.string().trim().regex(phoneRegex, "Enter a valid phone number (5\u201330 digits/characters)"),
  totalPayment: z.coerce.number().min(0, "Total payment cannot be negative"),
  advancePayment: z.coerce.number().min(0, "Advance payment cannot be negative"),
  paymentMethod: z.enum(["Cash", "Bank Transfer", "Card", "Other"]).default("Bank Transfer"),
  referenceNumber: z.string().trim().max(80).optional().or(z.literal("")),
  specialNotes: z.string().trim().max(1e3, "Maximum 1000 characters").optional().or(z.literal("")),
  status: z.enum(["Pending", "Confirmed", "Completed", "Cancelled"])
}).refine((data) => data.endTime > data.startTime, {
  message: "End time must be after start time",
  path: ["endTime"]
}).refine((data) => data.advancePayment <= data.totalPayment, {
  message: "Initial advance payment cannot exceed total booking payment",
  path: ["advancePayment"]
});
const shootBookingSchema = z.object({
  shootDate: z.string().regex(dateRegex, "Valid date (YYYY-MM-DD) is required"),
  shootType: z.enum([
    "Photography",
    "Videography",
    "Wedding Shoot",
    "Fashion Shoot",
    "Commercial Shoot",
    "Other"
  ]),
  venueResource: z.enum(venueResources),
  startTime: z.string().regex(timeRegex, "Valid start time is required"),
  endTime: z.string().regex(timeRegex, "Valid end time is required"),
  paxCount: z.coerce.number().int("Guest count must be a whole number").min(1, "At least 1 guest required").max(1e3, "Maximum 1000 guests"),
  assignedStaffId: z.string().trim().email("Select an assigned staff member"),
  customerName: z.string().trim().min(2, "Customer name must be at least 2 characters").max(120),
  customerPhone: z.string().trim().regex(phoneRegex, "Enter a valid phone number"),
  totalPayment: z.coerce.number().min(0, "Total payment cannot be negative"),
  advancePayment: z.coerce.number().min(0, "Advance payment cannot be negative"),
  paymentMethod: z.enum(["Cash", "Bank Transfer", "Card", "Other"]).default("Bank Transfer"),
  referenceNumber: z.string().trim().max(80).optional().or(z.literal("")),
  specialNotes: z.string().trim().max(1e3).optional().or(z.literal("")),
  status: z.enum(["Pending", "Confirmed", "Completed", "Cancelled"])
}).refine((data) => data.endTime > data.startTime, {
  message: "End time must be after start time",
  path: ["endTime"]
}).refine((data) => data.advancePayment <= data.totalPayment, {
  message: "Initial advance payment cannot exceed total booking payment",
  path: ["advancePayment"]
});
const roomTypeSchema = z.object({
  roomCode: z.string().trim().min(2, "Room ID/Code required").max(20),
  name: z.string().trim().min(2, "Room name required").max(100),
  description: z.string().trim().max(1e3),
  maxCapacity: z.coerce.number().int().min(1, "Minimum capacity is 1").max(50),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  status: z.enum(["Available", "Maintenance", "Inactive"]),
  imageUrl: z.string().trim().max(500).optional().or(z.literal(""))
});
const roomBookingSchema = z.object({
  roomTypeId: z.string().min(1, "Select a room type"),
  customerName: z.string().trim().min(2, "Customer name required").max(120),
  customerPhone: z.string().trim().regex(phoneRegex, "Enter a valid phone number"),
  foodStatus: z.enum(["Included", "Not Included", "Pending"]),
  checkInDate: z.string().regex(dateRegex, "Valid check-in date required"),
  checkInTime: z.string().regex(timeRegex, "Valid check-in time required"),
  checkOutDate: z.string().regex(dateRegex, "Valid check-out date required"),
  checkOutTime: z.string().regex(timeRegex, "Valid check-out time required"),
  totalPayment: z.coerce.number().min(0, "Total payment cannot be negative"),
  advancePayment: z.coerce.number().min(0, "Advance payment cannot be negative"),
  paymentMethod: z.enum(["Cash", "Bank Transfer", "Card", "Other"]).default("Bank Transfer"),
  referenceNumber: z.string().trim().max(80).optional().or(z.literal("")),
  specialNotes: z.string().trim().max(1e3).optional().or(z.literal("")),
  status: z.enum(["Pending", "Confirmed", "Checked-in", "Checked-out", "Cancelled"])
}).refine(
  (data) => `${data.checkOutDate}T${data.checkOutTime}` > `${data.checkInDate}T${data.checkInTime}`,
  {
    message: "Check-out date and time must be after check-in date and time",
    path: ["checkOutDate"]
  }
).refine((data) => data.advancePayment <= data.totalPayment, {
  message: "Initial advance payment cannot exceed total booking payment",
  path: ["advancePayment"]
});
const paymentSchema = z.object({
  amount: z.coerce.number().refine((v) => v !== 0, "Amount must be non-zero"),
  paymentMethod: z.enum(["Cash", "Bank Transfer", "Card", "Other"]),
  paymentDate: z.string().regex(dateRegex, "Valid payment date required"),
  referenceNumber: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  isAdjustment: z.boolean().default(false),
  adjustmentReason: z.string().trim().max(300).optional().or(z.literal("")),
  allowOverpayment: z.boolean().default(false)
});
const blockedScheduleSchema = z.object({
  scope: z.enum(["FULL_VILLA", "EVENT_GROUNDS", "SHOOT_GROUNDS", "ROOM"]),
  roomTypeId: z.string().optional().or(z.literal("")),
  startDate: z.string().regex(dateRegex, "Start date required"),
  endDate: z.string().regex(dateRegex, "End date required"),
  startTime: z.string().regex(timeRegex, "Start time required"),
  endTime: z.string().regex(timeRegex, "End time required"),
  reason: z.string().trim().min(2, "Reason is required").max(300)
}).refine(
  (data) => `${data.endDate}T${data.endTime}` > `${data.startDate}T${data.startTime}`,
  {
    message: "End date/time must be after start date/time",
    path: ["endDate"]
  }
);
const staffSchema = z.object({
  email: z.string().trim().email("Valid Google email address required").max(120),
  name: z.string().trim().min(2, "Full name required").max(100),
  role: z.enum(["ADMIN", "STAFF"]),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  whatsappPhone: whatsAppPhoneSchema,
  isActive: z.boolean().default(true)
});
const settingsSchema = z.object({
  villaName: z.string().trim().min(2).max(100),
  currency: z.enum(["LKR", "USD"]),
  inactivityTimeoutMinutes: z.coerce.number().int().min(5).max(240)
});
export {
  blockedScheduleSchema,
  eventBookingSchema,
  paymentSchema,
  roomBookingSchema,
  roomTypeSchema,
  settingsSchema,
  shootBookingSchema,
  staffSchema,
  venueResources,
  whatsAppPhoneSchema
};
