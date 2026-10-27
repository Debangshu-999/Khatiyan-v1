const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../src/features/compliance/onboarding-validation.ts"), "utf8");
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: exportsObject, Date });
const { dateOfBirthIssue, monthlyAmountErrors, agreementTermIssue, identityErrors } = exportsObject;
const identity = { mode: "MANUAL", dob: "", gender: null, documentType: "PASSPORT", lastFour: "1234", verificationAttempts: [], today: "2026-10-08" };

test("manual verification requires DOB and gender; eKYC can leave both blank", () => {
  const manual = identityErrors(identity);
  assert.ok(manual.idDob);
  assert.ok(manual.idGender);
  assert.equal(Object.keys(identityErrors({ ...identity, mode: "KYC", verificationAttempts: [2] })).length, 0);
  assert.equal(Object.keys(identityErrors({ ...identity, dob: "1998-10-08", gender: "FEMALE" })).length, 0);
});

test("verification cannot proceed with no route or missing checks", () => {
  assert.ok(identityErrors({ ...identity, mode: null }).verification);
  for (const attempts of [[], [0], [6], [1.5]]) {
    assert.ok(identityErrors({ ...identity, mode: "KYC", verificationAttempts: attempts }).verification);
  }
  assert.ok(identityErrors({ ...identity, gender: "UNDECLARED" }).idGender);
});

test("rent and deposit must be entered and greater than zero before continuing", () => {
  assert.ok(monthlyAmountErrors("10000", "").deposit);
  assert.ok(monthlyAmountErrors("", "0").rent);
  assert.ok(monthlyAmountErrors("10000", "0").deposit);
  assert.equal(Object.keys(monthlyAmountErrors("10000", "10000")).length, 0);
  for (const value of ["0", "0.00", "-1", "Infinity", "NaN", "1.234", "1e8"]) {
    assert.ok(monthlyAmountErrors(value, "10000").rent);
    assert.ok(monthlyAmountErrors("10000", value).deposit);
  }
});

test("agreement duration accepts only whole months 1 through 11 or indefinite", () => {
  for (const months of [null, 0, 12, 24, 1.5]) assert.ok(agreementTermIssue(true, months));
  for (let months = 1; months <= 11; months++) assert.equal(agreementTermIssue(true, months), null);
  assert.equal(agreementTermIssue(false, null), null);
});

test("manual DOB is adult and a real calendar date; monthly optional DOB can be blank", () => {
  assert.equal(dateOfBirthIssue("", identity.today, false, false), null);
  assert.equal(dateOfBirthIssue("2008-10-08", identity.today), null);
  for (const dob of ["", "2008-10-09", "1999-02-30", "2027-01-01"]) assert.ok(dateOfBirthIssue(dob, identity.today));
});
