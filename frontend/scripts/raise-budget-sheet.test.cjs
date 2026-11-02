const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// The Raise budget sheet hugs its short form (user, 2026-10-31).
const screen = fs.readFileSync(path.join(__dirname, "..", "app/owner-expenses.tsx"), "utf8");

test("Raise budget, Recurring expenses and Reverse expense hug their content, and the other expense sheets keep their size", () => {
  assert.match(screen, /<Sheet onClose=\{onClose\} size="content" title="Raise budget">/);
  assert.match(screen, /size="content"\s+title="Recurring expenses"/);
  assert.match(screen, /<Sheet onClose=\{onClose\} size="content" title="Reverse expense">/);
  assert.equal(screen.match(/size="content"/g).length, 3);
  assert.match(screen, /<SheetShell onClose=\{onClose\} size=\{size\} title=\{title\}>/);
});

test("Reverse expense is a filled red button, under its message beside an i, and only this month's can be reversed", () => {
  const sheet = screen.slice(screen.indexOf('title="Reverse expense"'), screen.indexOf("function RecurringSheet"));
  assert.match(sheet, /<Info [^>]*\/>\s+<View style=\{\{ flex: 1 \}\}>\s+<BodyNote>\s+Reversing posts/);
  assert.match(sheet, /label=\{state\.isLoading \? "Reversing" : "Reverse expense"\}[^\n]*variant="dangerFilled"/);
  assert.match(screen, /canReverse = [^\n]*expense\.incurredDate\.slice\(0, 7\) >= currentMonth\(\)/);
});

test("a recurring expense has no day of the month to pick or show", () => {
  assert.doesNotMatch(screen, /dayOfMonth|Day of month/);
});

test("its button sits in a row, so it cannot stretch the sheet", () => {
  assert.match(screen, /<View style=\{\{ flexDirection: "row" \}\}>\s+<ActionButton disabled=\{state\.isLoading \|\| form\.blocked\} icon=\{Plus\} label=\{state\.isLoading \? "Saving" : "Raise budget"\}/);
});
