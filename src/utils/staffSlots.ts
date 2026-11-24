import { STAFF_SLOT_NUMBERS, type StaffSlotNumber } from '../types/villa.ts';

export function getNextStaffSlot(usedSlots: ReadonlySet<number>): StaffSlotNumber | undefined {
  return STAFF_SLOT_NUMBERS.find((slot) => !usedSlots.has(slot));
}
