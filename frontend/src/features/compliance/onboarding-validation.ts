export function dateOfBirthIssue(dob: string, today: string, required = true, adult = true): string | null {
  const value = dob.trim();
  if (!value && !required) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return "Enter a valid date of birth.";
  }
  if (value >= today) return "Date of birth must be in the past.";
  const [year, month, day] = today.split("-");
  const latestAdultBirthday = `${String(Number(year) - 18).padStart(4, "0")}-${month}-${day}`;
  const earliestBirthday = `${String(Number(year) - 120).padStart(4, "0")}-${month}-${day}`;
  if (adult && value < earliestBirthday) return "Enter the date of birth shown on the ID.";
  return adult && value > latestAdultBirthday ? "The tenant must be 18 or older." : null;
}

export function monthlyAmountErrors(rent: string, deposit: string) {
  const validAmount = (value: string) => /^\d+(\.\d{1,2})?$/.test(value.trim())
    && Number.isSafeInteger(Math.round(Number(value) * 100));
  return {
    ...(validAmount(rent) && Number(rent) > 0 ? {} : { rent: "Enter a rent amount greater than zero." }),
    ...(validAmount(deposit) && Number(deposit) > 0 ? {} : { deposit: "Enter a deposit amount greater than zero." }),
  };
}

export function agreementTermIssue(fixed: boolean, months: number | null): string | null {
  return !fixed || (months !== null && Number.isInteger(months) && months >= 1 && months <= 11)
    ? null
    : "Choose an agreement term between 1 and 11 months.";
}

export function identityErrors(input: {
  mode: "MANUAL" | "KYC" | null;
  dob: string;
  gender: string | null;
  documentType: string | null;
  lastFour: string;
  verificationAttempts: number[];
  today: string;
}) {
  if (input.mode === null) return { verification: "Choose a verification method." };
  if (input.mode === "KYC") {
    return input.verificationAttempts.length > 0
      && input.verificationAttempts.every((attempts) => Number.isInteger(attempts) && attempts >= 1 && attempts <= 5)
      ? {}
      : { verification: "Choose at least one check with 1 to 5 attempts." };
  }
  const dobIssue = dateOfBirthIssue(input.dob, input.today);
  return {
    ...(input.documentType ? {} : { idDocumentType: "Select which ID you checked." }),
    ...(/^\d{4}$/.test(input.lastFour) ? {} : { idLastFour: "Enter the last four digits." }),
    ...(input.gender && input.gender !== "UNDECLARED" ? {} : { idGender: "Select the gender as you checked it." }),
    ...(dobIssue ? { idDob: dobIssue } : {}),
  };
}
