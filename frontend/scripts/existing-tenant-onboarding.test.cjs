const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Existing-tenant onboarding (P1.1, user, 2026-10-28): someone already living in a running PG,
// brought onto Khatiyan from their next bill, in the monthly wizard.
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const wizard = read("app/owner-onboard-tenant.tsx");
const api = read("src/store/services/compliance-api.ts");

test("Existing tenant is a kind beside Monthly, and it is a monthly stay", () => {
  assert.match(wizard, /title="Existing tenant"\s+subtitle="Someone already living here, brought onto Khatiyan from their next bill"/);
  assert.match(wizard, /onPress=\{\(\) => chooseBilling\("MONTHLY", true\)\}/);
  assert.match(wizard, /selected=\{billingType === "MONTHLY" && !existingTenant\}/);
});

test("their address is required on the tenant step, marked and checked there (user, 2026-10-29)", () => {
  assert.doesNotMatch(wizard, /addressOptional/);
  assert.match(wizard, /<Field error=\{addressError\} label="Permanent address" required>/);
  assert.match(wizard, /<Field error=\{pincodeError\} label="PIN code" required>/);
});

test("room and dates keep what came before Khatiyan: move-in, deposit held, dues, first bill", () => {
  assert.match(wizard, /label=\{existingTenant \? "Deposit already held" : "Deposit"\}/);
  assert.match(wizard, /label=\{existingTenant \? "First Khatiyan bill" : "Start date"\}/);
  assert.match(wizard, /maximumDate=\{existingTenant \? addDays\(startOfToday\(\), 31\) : undefined\}/);
  assert.match(wizard, /<Field error=\{form\.errors\.movedInOn\} label="Moved in on" required>/);
  assert.match(wizard, /<Field error=\{form\.errors\.dues\} label="Dues at the switch">/);
  // No eyebrow on the card: the deposit and dues notes sit behind a question mark (user, 2026-10-28).
  assert.doesNotMatch(wizard, />\s*Before Khatiyan\s*</);
  assert.match(wizard, /<IconButton accessibilityLabel="How the deposit and dues work" icon=\{CircleHelp\}/);
  assert.match(wizard, /eyebrow="Existing tenant"[\s\S]{0,600}title="Deposit and dues"/);
  // Their bed has to be free now: no bed freed later is offered.
  assert.match(wizard, /const selectedRoomAvailableFrom = !existingTenant && selectedRoom/);
});

test("the deposit held is typed by the owner, never taken from the room or property policy", () => {
  // Part of it may already have been used before Khatiyan (user, 2026-10-28).
  assert.match(wizard, /if \(selectedProperty && !existingTenant\) \{\s+setDeposit\(String\(Math\.round\(selectedProperty\.standardDepositPaise/);
  assert.match(wizard, /if \(!existingTenant\) setDeposit\(""\);/);
  assert.match(wizard, /\{ deposit: "Enter the deposit you hold for them now, 0 if none\." \}/);
  assert.match(read("../src/main/java/com/khatiyan/d_modules/compliance/api/dto/OnboardExistingTenantRequest.java"),
    /@NotNull\(message = "Enter the deposit you hold for them now, 0 if none"\)\s+@Min\(value = 0/);
});

test("an existing tenant is either verified before, with a declaration, or verified now by either route", () => {
  assert.match(wizard, />\s*Tenant verification\s*</);
  assert.doesNotMatch(wizard, /Establish who this person is before the tenancy is created/);
  assert.match(wizard, /title="Already verified"/);
  assert.match(wizard, /title="Verify now"/);
  assert.match(wizard, /useGetLegalStatementQuery\("EXISTING_TENANT_VERIFIED_DECLARATION"\)/);
  assert.match(wizard, /checked=\{verifiedBeforeConfirmed\}/);
  // The declaration stands instead of either check, never beside one.
  assert.match(wizard, /const idCheckPayload = verificationMode === "KYC" \|\| verifiedBefore \? null : manualIdCheck;/);
  assert.match(wizard, /verifiedBeforeStatementText: verifiedBefore \? beforeStatement : null,/);
});

test("their agreement carries over on paper, with photos, or as a Khatiyan deed to sign", () => {
  assert.match(wizard, /title="Upload existing agreement"/);
  assert.match(wizard, /title="Create new agreement"/);
  // Photos or a PDF from one Device button, in an "Agreement document" box (user, 2026-10-28).
  assert.match(wizard, /<CollapsibleSection accentTail="document" collapsible=\{false\} title="Agreement">/);
  // Neither term card collapses, and the months note carries an info mark (user, 2026-10-29).
  assert.match(wizard, /<CollapsibleSection collapsible=\{false\} contentGap=\{spacing\.md\} title=\{paperChosen \? "Remaining" : "Agreement"\}/);
  assert.match(wizard, /<AgreementMonthDropdown label="Months"/);
  assert.match(wizard, /<MultiImageField\s+documentTarget="AGREEMENT_DOCUMENT"\s+label="Photos or PDF"\s+max=\{10\}/);
  assert.match(read("src/features/uploads/multi-image-field.tsx"), /type: \["application\/pdf", "image\/\*"\]/);
  assert.doesNotMatch(wizard, /Their agreement\n/);
  assert.match(wizard, /target="AGREEMENT_PHOTO"/);
  assert.match(read("src/features/uploads/upload-asset.ts"), /\| "AGREEMENT_PHOTO"[\s\S]{0,80}\| "AGREEMENT_DOCUMENT"/);
  // On paper there is no deed to preview and nothing for the profile gate to stop.
  assert.match(wizard, /\{paperChosen \? null : \(\s+<ActionButton/);
  assert.match(wizard, /const agreementGateBlocked = gateBlocked && !existingTenant;/);
});

test("submitted through its own endpoint, with what a carried-over stay needs", () => {
  assert.match(api, /url: "\/api\/v1\/compliance\/tenancies\/onboard-existing"/);
  for (const field of ["movedInOn: dateToStr(movedInOn)", "firstBillOn: dateToStr(startDate)", "depositHeldPaise:", "openingDuesPaise:", "paperAgreementPhotoUrls: onPaper ? paperPhotos : null"]) {
    assert.ok(wizard.includes(field), field);
  }
  assert.match(wizard, /\? handleOnboardExisting\(\)/);
});
