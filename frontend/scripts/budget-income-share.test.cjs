const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// The monthly budget's income share (user, 2026-10-18).
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const screen = read("app/owner-expenses.tsx");
const api = read("src/store/services/expense-api.ts");

test("the sheet holds a fixed amount, an income switch with full or part, and the sum", () => {
  for (const words of ['label="Fixed amount"', "Add this month&apos;s income", 'label="Full income"', 'label="Part of income"', 'label="Income amount"', "Budget for ${monthName}"]) {
    assert.ok(screen.includes(words), `Missing ${words}`);
  }
  // A part never adds more than the month received.
  assert.match(screen, /incomeMode === "FULL" \? received : Math\.min\(partPaise \?\? 0, received\)/);
  assert.match(screen, /paise=\{fixedPaise \+ fromIncome \+ budget\.raisedThisMonthPaise\}/);
});

test("a part needs its amount, and only a part sends one", () => {
  assert.match(screen, /if \(value == null \|\| value <= 0\) return "Enter how much of the income to add\.";/);
  assert.match(api, /incomePartPaise: incomeMode === "PART" \? incomePartPaise : null/);
  assert.match(api, /export type BudgetIncomeMode = "NONE" \| "FULL" \| "PART";/);
});

// "No guardrail to prevent an amount higher than income" (user, 2026-10-18).
test("a part above the income received is refused at the field, as it is typed and on save", () => {
  assert.match(screen, /if \(value > received\) return `Enter no more than \$\{formatMoneyPaise\(received\)\}/);
  assert.match(screen, /if \(typed != null && typed > received\) \{\s+form\.validate\(\{ \.\.\.form\.errors, part: partProblem\(typed\)/);
  assert.match(screen, /const tooMuch = chosenMode === "PART" \? partProblem\(partPaise\) : null;/);
});
