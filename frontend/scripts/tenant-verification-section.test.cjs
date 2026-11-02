const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// How a tenant was verified, on the tenant profile (user, 2026-10-31).
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const section = read("src/features/tenancy/tenant-verification-section.tsx");
const screen = read("app/owner-active-tenancy-detail.tsx");

test("the profile reads the record, and the dummy rows are gone", () => {
  assert.match(screen, /<TenantVerificationSection tenancyId=\{tenancyId\} \/>/);
  assert.doesNotMatch(screen, /Aadhaar verification|PAN verification/);
  assert.match(read("src/store\/services/compliance-api.ts"), /tenancies\/\$\{tenancyId\}\/identity-checks/);
});

test("nobody verified them is said plainly, and only once the record has loaded", () => {
  assert.match(section, /checks && checks\.ekycChecks\.length === 0 && !checks\.manualCheck && !checks\.verifiedBeforeKhatiyan/);
  assert.match(section, /nothingOnRecord \? \(\s+<CheckCard\s+icon=\{ShieldX\}\s+subtitle="No identity check is on record for this stay\."\s+title="Not verified"/);
  assert.match(section, /!checks && query\.isError \? <LoadFailedCard/);
});

test("an e-KYC pass shows what the check established", () => {
  for (const fact of ["Name on Aadhaar", "Aadhaar number", "Name match", "Face check", "Age check", "Aadhaar mobile", "Verified on"]) {
    assert.ok(section.includes(fact), fact);
  }
});

test("a check that has not passed never reads as verified", () => {
  assert.match(section, /check\.status !== "VERIFIED"/);
  assert.match(section, /outOfAttempts \? "Not verified\. The tenant used every attempt\." : "Pending\. Waiting/);
  assert.match(section, /<AttemptsMeter granted=\{check\.attemptsGranted\} remaining=\{check\.attemptsRemaining\} \/>/);
});

test("a different Aadhaar mobile is a note, not a failure", () => {
  assert.match(section, /check\.phoneMatched \? "passed" : "noted"/);
});

test("a manual check names the document and who made it", () => {
  for (const fact of ["Manual ID check", "DOCUMENT_NAMES", "Checked by", "Checked on"]) {
    assert.ok(section.includes(fact), fact);
  }
});

test("no status chip on the card: the disc and the line under the title say it", () => {
  assert.doesNotMatch(section, /pill/i);
});

test("no semicolons in the copy", () => {
  assert.doesNotMatch(section, /(subtitle|title)="[^"]*;[^"]*"/);
});
