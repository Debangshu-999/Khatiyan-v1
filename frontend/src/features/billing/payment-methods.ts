import type { MaterialCommunityIcons } from "@expo/vector-icons";

import type { ManualPaymentMethod } from "@/store/services/billing-api";

/**
 * The ways a property can take money (2026-09-28), named and ordered once, so
 * Payment setup, the tenant's pay sheet, a tenant's claim and the owner's Mark
 * paid all say the same thing. OTHER is a legacy value for old rows and is
 * never offered.
 */
export type TenderMethod = Exclude<ManualPaymentMethod, "OTHER">;

/** The order every list of methods follows. Cash leads: every property starts with it. */
export const METHOD_ORDER: TenderMethod[] = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE"];

export const METHOD_LABEL: Record<ManualPaymentMethod, string> = {
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  CASH: "Cash",
  CHEQUE: "Cheque",
  OTHER: "Other",
  UPI: "UPI",
};

export const METHOD_ICON: Record<TenderMethod, keyof typeof MaterialCommunityIcons.glyphMap> = {
  BANK_TRANSFER: "bank-outline",
  CARD: "credit-card-outline",
  CASH: "cash",
  CHEQUE: "checkbook",
  UPI: "qrcode-scan",
};

/**
 * What proves a payment by each method: its own reference, or a photo. The
 * tenant's claim asks for either, and neither is required there. The owner's
 * Mark paid asks for the same things and requires one of the two.
 */
export const PROOF_FIELD: Record<Exclude<TenderMethod, "CASH">, {
  keyboard: "default" | "number-pad";
  label: string;
  maxLength: number;
  photoLabel: string;
  placeholder: string;
  /** The reference's name on the owner's claim card. */
  shortLabel: string;
  /** Where the owner checks a claim that came with no proof. */
  checkWhere: string;
}> = {
  BANK_TRANSFER: {
    keyboard: "default",
    label: "UTR / transaction reference",
    maxLength: 22,
    photoLabel: "Screenshot of the payment",
    placeholder: "From your bank's transfer receipt",
    shortLabel: "Transfer reference",
    checkWhere: "on your bank statement",
  },
  CARD: {
    keyboard: "default",
    label: "Approval code or RRN from the slip",
    maxLength: 12,
    photoLabel: "Photo of the card slip",
    placeholder: "6-digit approval code",
    shortLabel: "Approval code",
    checkWhere: "in your card machine's report",
  },
  CHEQUE: {
    keyboard: "number-pad",
    label: "Cheque number (6 digits)",
    maxLength: 6,
    photoLabel: "Photo of the cheque",
    placeholder: "123456",
    shortLabel: "Cheque number",
    checkWhere: "against the cheques you were handed",
  },
  UPI: {
    keyboard: "number-pad",
    label: "UTR / transaction reference (12 digits)",
    maxLength: 12,
    photoLabel: "Screenshot of the payment",
    placeholder: "123456789012",
    shortLabel: "UPI reference",
    checkWhere: "on your banking or UPI app",
  },
};
