import assert from "node:assert/strict";
import test from "node:test";
import { restoreApiRequestUrl } from "./vercelRouting.js";

test("restores nested API paths and preserves caller query parameters", () => {
  assert.equal(
    restoreApiRequestUrl(
      "/api/dispatch?__vercelApiPath=staff%2Fmanager%40example.com&filter=active&filter=admin"
    ),
    "/api/staff/manager@example.com?filter=active&filter=admin"
  );
});

test("rejects missing or ambiguous rewritten API paths", () => {
  assert.equal(restoreApiRequestUrl("/api/dispatch"), null);
  assert.equal(
    restoreApiRequestUrl(
      "/api/dispatch?__vercelApiPath=staff%2Fone&__vercelApiPath=staff%2Ftwo"
    ),
    null
  );
});
