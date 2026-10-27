const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// The End tenancy screen (user, 2026-10-18).
const screen = fs.readFileSync(path.join(__dirname, "..", "app/owner-end-tenancy.tsx"), "utf8");

test("End tenancy asks before ending, and only the dialog ends the stay", () => {
  assert.match(screen, /label=\{endState\.isLoading \? "Ending\.\.\." : "End tenancy"\}\s+onPress=\{\(\) => setConfirmEndOpen\(true\)\}/);
  assert.match(screen, /title="End this tenancy\?"/);
  assert.match(screen, /onConfirm=\{\(\) => \{\s+setConfirmEndOpen\(false\);\s+void end\(\);/);
  assert.equal(screen.match(/void end\(\)/g).length, 1);
});

test("no pull-to-refresh, so the status carousel takes its swipes at the top of the page", () => {
  assert.match(screen, /<ScreenScrollView safeAreaEdges=\{\["top"\]\} refreshable=\{false\}/);
});
