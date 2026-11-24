import { STAFF_SLOT_NUMBERS } from "../types/villa.js";
function getNextStaffSlot(usedSlots) {
  return STAFF_SLOT_NUMBERS.find((slot) => !usedSlots.has(slot));
}
export {
  getNextStaffSlot
};
