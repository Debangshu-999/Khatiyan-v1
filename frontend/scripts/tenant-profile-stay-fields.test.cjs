const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// The stay fields on the tenant profile (user, 2026-10-31).
const screen = fs.readFileSync(path.join(__dirname, "..", "app/owner-active-tenancy-detail.tsx"), "utf8");

test("an indefinite stay states a planned checkout where a fixed term states its end date", () => {
  assert.match(screen, /isDaily \? "Checkout" : fixedTerm \? "End date" : "Planned checkout"/);
  assert.match(screen, /fixedTerm \? agreedEndDate : tenancy\?\.checkoutDate \?\? plannedEndDate/);
});

test("a definite stay shows End date with its date, even before the record loads", () => {
  assert.match(screen, /tenancy \? Boolean\(tenancy\.fixedTerm\) : stringParam\(params\.fixedTerm\) === "true"/);
  assert.match(screen, /fixedTerm\s+\? tenancy\?\.checkoutDate \?\? tenancy\?\.agreementEndDate \?\? \(stringParam\(params\.plannedEndDate\) \|\| null\)/);
  const opener = fs.readFileSync(path.join(__dirname, "..", "app/owner-tenancy.tsx"), "utf8");
  assert.match(opener, /fixedTerm: tenancy\.fixedTerm \? "true" : "false"/);
  assert.match(opener, /agreementValidityMonths: tenancy\.agreementValidityMonths\?\.toString\(\) \?\? ""/);
});

test("stay duration runs to today, or to the day the stay ended", () => {
  assert.match(screen, /tenancy\?\.endDate && tenancy\.endDate < today \? tenancy\.endDate : today/);
  assert.match(screen, /label="Stay duration" value=\{formatDuration\(stayStartDate, stayedUntil\)\}/);
});

test("Tenancy details names the agreement type, not a planned checkout", () => {
  assert.match(screen, /label="Agreement type" value=\{agreementTypeLabel\(isDaily, fixedTerm, agreementMonths\)\}/);
  assert.equal(screen.match(/"Planned checkout"/g).length, 1);
  assert.match(screen, /`Definite \(\$\{months\} \$\{months === 1 \? "month" : "months"\}\)`/);
  assert.match(screen, /return "Indefinite"/);
});

test("the Tenancy agreement card is the tenant's agreement card, in the owner's words", () => {
  // As on the tenant's Tenancy tab (user, 2026-11-14).
  const module = fs.readFileSync(path.join(__dirname, "..", "app/owner-tenancy.tsx"), "utf8");
  assert.match(module, /<AgreementHeroCard[\s\S]*?title="Tenancy agreement"/);
  assert.match(module, /<AgreementHeroCard[\s\S]*?router\.push\("\/owner-tenancy-agreement"\)/);
});
