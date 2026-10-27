import { ACCOUNT_MISMATCH, IFSC_NOT_FOUND, IFSC_PATTERN, upiFilled, type BankDetails, type UpiDetails } from "@/features/billing/payout-fields";
import type { PropertyPaymentDetails } from "@/store/services/payment-intent-api";

export type BookingPaymentDraft = { useBilling: boolean; upi: UpiDetails; bank: BankDetails };
export type BookingPaymentErrors = Partial<Record<"details" | "upiQr" | "upiVpa" | "upiPhone" | "payeeName" | "account" | "confirm" | "ifsc", string>>;

export function billPaymentFields(details: PropertyPaymentDetails) {
  return {
    upi: { upiVpa: details.upiVpa ?? "", payeeName: details.payeeName ?? "", upiPhone: details.upiPhone ?? "", upiQrImageUrl: details.upiQrImageUrl ?? "" },
    bank: { account: details.bankAccountNumber ?? "", confirm: details.bankAccountNumber ?? "", holder: details.bankAccountHolder ?? "", ifsc: details.bankIfsc ?? "" },
  };
}

export function bookingPaymentDraft(details: PropertyPaymentDetails): BookingPaymentDraft {
  return {
    useBilling: details.tokenUsesBillDetails ?? true,
    upi: { upiVpa: details.tokenUpiVpa ?? "", payeeName: details.tokenPayeeName ?? "", upiPhone: details.tokenUpiPhone ?? "", upiQrImageUrl: details.tokenUpiQrImageUrl ?? "" },
    bank: { account: details.tokenBankAccountNumber ?? "", confirm: details.tokenBankAccountNumber ?? "", holder: details.tokenBankAccountHolder ?? "", ifsc: details.tokenBankIfsc ?? "" },
  };
}

export function bookingPaymentErrors(draft: BookingPaymentDraft, ifscMissing: boolean): BookingPaymentErrors {
  if (draft.useBilling) return {};
  const upi = upiFilled(draft.upi);
  const account = draft.bank.account.trim();
  const ifsc = draft.bank.ifsc.trim();
  const confirm = draft.bank.confirm.trim();
  const incomplete = "Add this too, or clear the other UPI details.";
  return {
    ...(upi.any && !upi.upiQr ? { upiQr: incomplete } : {}),
    ...(upi.any && !upi.upiVpa ? { upiVpa: incomplete } : {}),
    ...(upi.any && !upi.upiPhone ? { upiPhone: incomplete } : {}),
    ...(upi.any && !upi.payeeName ? { payeeName: incomplete } : {}),
    ...(account && !confirm ? { confirm: "Re-enter the account number." } : {}),
    ...(account && confirm && confirm !== account ? { confirm: ACCOUNT_MISMATCH } : {}),
    ...(ifsc && !IFSC_PATTERN.test(ifsc) ? { ifsc: "Enter a valid IFSC. It is 11 characters: 4 letters, a 0, then 6 letters or digits." } : {}),
    ...(ifscMissing ? { ifsc: IFSC_NOT_FOUND } : {}),
    ...(Boolean(account) !== Boolean(ifsc) ? account ? { ifsc: "Add the IFSC as well, or clear the account number." } : { account: "Add the account number as well, or clear the IFSC." } : {}),
    ...(!upi.any && !account && !ifsc ? { details: "Add UPI or bank details for booking tokens, or use billing payment details." } : {}),
  };
}

function tokenValues(draft: BookingPaymentDraft) {
  return {
    tokenUsesBillDetails: draft.useBilling,
    tokenUpiVpa: draft.useBilling ? null : draft.upi.upiVpa.trim() || null,
    tokenPayeeName: draft.useBilling ? null : draft.upi.payeeName.trim() || null,
    tokenUpiPhone: draft.useBilling ? null : draft.upi.upiPhone.trim() || null,
    tokenUpiQrImageUrl: draft.useBilling ? null : draft.upi.upiQrImageUrl.trim() || null,
    tokenBankAccountNumber: draft.useBilling ? null : draft.bank.account.trim() || null,
    tokenBankIfsc: draft.useBilling ? null : draft.bank.ifsc.trim() || null,
    tokenBankAccountHolder: draft.useBilling ? null : draft.bank.holder.trim() || null,
  };
}

export function bookingPaymentDirty(details: PropertyPaymentDetails, draft: BookingPaymentDraft) {
  return JSON.stringify(tokenValues(draft)) !== JSON.stringify(tokenValues(bookingPaymentDraft(details)));
}

/** Preserve billing fields and their version; the shared endpoint rejects concurrent edits. */
export function bookingPaymentPayload(propertyId: string, details: PropertyPaymentDetails, draft: BookingPaymentDraft) {
  return {
    propertyId, version: details.version,
    upiVpa: details.upiVpa, payeeName: details.payeeName, upiPhone: details.upiPhone, upiQrImageUrl: details.upiQrImageUrl,
    bankAccountNumber: details.bankAccountNumber, bankIfsc: details.bankIfsc, bankAccountHolder: details.bankAccountHolder,
    acceptedMethods: details.acceptedMethods, cashOtpRequired: details.cashOtpRequired,
    ...tokenValues(draft),
  };
}
