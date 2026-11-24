import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getNextStaffSlot } from "./staffSlots.js";
describe("staff account slots", () => {
  it("assigns the first unoccupied slot, including slots five and six", () => {
    assert.equal(getNextStaffSlot(/* @__PURE__ */ new Set([1, 2, 3, 4])), 5);
    assert.equal(getNextStaffSlot(/* @__PURE__ */ new Set([1, 2, 3, 4, 5])), 6);
  });
  it("returns no slot when all six accounts are assigned", () => {
    assert.equal(getNextStaffSlot(/* @__PURE__ */ new Set([1, 2, 3, 4, 5, 6])), void 0);
  });
});
