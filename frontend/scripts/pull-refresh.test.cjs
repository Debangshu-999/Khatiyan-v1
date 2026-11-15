const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

// Pull-to-refresh must reload what the screen shows (user, 2026-11-07).
test("a pull waits for the refetched data, then tells screens holding a form copy", () => {
  const view = read("src/components/screen-scroll-view.tsx");
  assert.match(view, /await untilQueriesSettle\(/);
  assert.match(view, /announcePullRefreshed\(\);/);
  // A page that fits still takes the gesture on a phone.
  assert.match(view, /const pullable = refreshable && Platform\.OS !== "web";/);
  assert.match(view, /\? !fits \|\| pullable/);
});

test("screens that copy data into a form reload it after a pull, keeping unsaved edits", () => {
  for (const file of ["app/owner-exit-policies.tsx", "app/owner-tenancy-agreement.tsx", "app/account-settings.tsx", "app/owner-notice-detail.tsx"]) {
    assert.match(read(file), /usePullRefreshed\(\(\) => \{/, file);
  }
  const edit = read("app/owner-edit-property.tsx");
  assert.match(edit, /<RefreshControl/);
  assert.match(edit, /if \(!dirty\) setReloads\(\(count\) => count \+ 1\);/);
});
