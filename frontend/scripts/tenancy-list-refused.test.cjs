const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// The active stays list can now refuse a manager (2026-10-31). A refusal must not read as "nobody".
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("Move-ins says it could not show them, rather than that nobody moved in", () => {
  const screen = read("app/owner-move-ins-today.tsx");
  assert.match(screen, /tenanciesQuery\.isError \? \(\s+<LoadFailed error=\{tenanciesQuery\.error\}/);
  assert.match(screen, /!tenanciesQuery\.isLoading && !tenanciesQuery\.isError && startingToday\.length === 0/);
});

test("the Manage tab's Tenants tile shows no count it could not read", () => {
  assert.match(read("app/(tabs)/owner.tsx"), /value=\{tenanciesQuery\.isError \? "-" : String\(activeTenancies\.length\)\}/);
});

test("the refusal is an expected answer on this endpoint only", () => {
  assert.match(read("src/store/api.ts"), /listPropertyTenancies: \[403\]/);
});
