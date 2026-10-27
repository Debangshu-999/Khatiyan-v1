import { Text, View } from "react-native";
import { CircleCheck } from "lucide-react-native";

import { UpiQrField } from "@/features/billing/upi-qr-field";
import { FormInput } from "@/features/owner/owner-ui";
import type { IfscLookup } from "@/store/services/payment-intent-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A crisper corner than the app's default 14 on these fields. Bank and UPI
 * details are transcribed from a statement or a banking app, and the squarer
 * box reads as a form to copy into, not a soft settings control.
 */
export const PAYOUT_FIELD_RADIUS = 6;

/** Four letters, a zero, six letters or digits: every Indian branch code. */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const IFSC_NOT_FOUND = "No bank branch uses this IFSC. Check your cheque book or passbook.";
export const ACCOUNT_MISMATCH = "Account numbers do not match.";

/** The four UPI details. They go together: all of them, or none. */
export type UpiDetails = { payeeName: string; upiPhone: string; upiQrImageUrl: string; upiVpa: string };
export type UpiDetailsErrors = Partial<Record<"payeeName" | "upiPhone" | "upiQr" | "upiVpa", string>>;
export const EMPTY_UPI: UpiDetails = { payeeName: "", upiPhone: "", upiQrImageUrl: "", upiVpa: "" };

/** Which of the four are filled, and whether any is. */
export function upiFilled(value: UpiDetails) {
  const filled = { payeeName: Boolean(value.payeeName.trim()), upiPhone: Boolean(value.upiPhone.trim()), upiQr: Boolean(value.upiQrImageUrl), upiVpa: Boolean(value.upiVpa.trim()) };
  const count = Object.values(filled).filter(Boolean).length;
  return { ...filled, any: count > 0, complete: count === 4 };
}

/**
 * A bank account to be paid into. The number is typed a second time and
 * matched before saving: a digit wrong sends money to someone else, and
 * nothing here can check an account number against the bank for free.
 */
export type BankDetails = { account: string; confirm: string; holder: string; ifsc: string };
export type BankDetailsErrors = Partial<Record<"account" | "confirm" | "ifsc", string>>;
export const EMPTY_BANK: BankDetails = { account: "", confirm: "", holder: "", ifsc: "" };

/**
 * The UPI details a payer is shown: the QR to scan, the address, the number
 * and the receiver's name. One set of fields for wherever the app asks for
 * them (2026-10-11, when a booking token gained details of its own).
 */
export function UpiDetailsFields({ errors, onChange, readOnly = false, receiverHint = "What payers will see in their UPI app", value }: {
  errors: UpiDetailsErrors;
  /** Any one change can settle another's "add this too", so the caller clears all four. */
  onChange: (next: UpiDetails) => void;
  receiverHint?: string;
  readOnly?: boolean;
  value: UpiDetails;
}) {
  // Asked for only once any one is filled. Whoever collects another way needs none of them.
  const required = upiFilled(value).any;
  const change = (next: UpiDetails) => { if (!readOnly) onChange(next); };
  return <>
    <UpiQrField error={errors.upiQr} onChange={(upiQrImageUrl) => change({ ...value, upiQrImageUrl })} readOnly={readOnly} required={!readOnly && required} url={value.upiQrImageUrl} />
    <FormInput disabled={readOnly} autoCapitalize="none" error={errors.upiVpa} label="UPI address" onChangeText={(upiVpa) => change({ ...value, upiVpa })} placeholder="name@bank" radius={PAYOUT_FIELD_RADIUS} required={!readOnly && required} value={value.upiVpa} />
    <FormInput disabled={readOnly} error={errors.upiPhone} keyboardType="number-pad" label="UPI phone number" maxLength={10} onChangeText={(text) => change({ ...value, upiPhone: text.replace(/[^0-9]/g, "") })} placeholder="10 digits" radius={PAYOUT_FIELD_RADIUS} required={!readOnly && required} value={value.upiPhone} />
    <FormInput disabled={readOnly} error={errors.payeeName} label="Receiver name" onChangeText={(payeeName) => change({ ...value, payeeName })} placeholder={receiverHint} radius={PAYOUT_FIELD_RADIUS} required={!readOnly && required} value={value.payeeName} />
  </>;
}

/**
 * A bank account's fields: holder, number, the number again, and the IFSC with
 * its branch named back while it is typed.
 */
export function BankDetailsFields({ errors, ifscFetching, ifscLookup, onChange, readOnly = false, value }: {
  errors: BankDetailsErrors;
  ifscFetching: boolean;
  ifscLookup: IfscLookup | undefined;
  onChange: (next: BankDetails) => void;
  readOnly?: boolean;
  value: BankDetails;
}) {
  const ifscWellFormed = IFSC_PATTERN.test(value.ifsc.trim());
  const ifscMissing = !readOnly && ifscWellFormed && !ifscFetching && ifscLookup?.status === "NOT_FOUND";
  // Live, once something is typed in the second field. An empty second field is asked for on Save.
  const mismatch = !readOnly && value.confirm.trim().length > 0 && value.confirm.trim() !== value.account.trim();
  const change = (next: BankDetails) => { if (!readOnly) onChange(next); };
  return <>
    <FormInput disabled={readOnly} label="Account holder" onChangeText={(holder) => change({ ...value, holder })} placeholder="Name on the account" radius={PAYOUT_FIELD_RADIUS} value={value.holder} />
    <FormInput
      disabled={readOnly}
      error={errors.account}
      keyboardType="number-pad"
      label="Account number"
      maxLength={18}
      onChangeText={(text) => {
        const account = text.replace(/[^0-9]/g, "");
        // A changed number is typed again from scratch.
        change({ ...value, account, confirm: account === value.account ? value.confirm : "" });
      }}
      placeholder=""
      radius={PAYOUT_FIELD_RADIUS}
      value={value.account}
    />
    <FormInput disabled={readOnly} error={errors.confirm ?? (mismatch ? ACCOUNT_MISMATCH : undefined)} keyboardType="number-pad" label="Re-enter account number" maxLength={18} noPaste onChangeText={(text) => change({ ...value, confirm: text.replace(/[^0-9]/g, "") })} placeholder="" radius={PAYOUT_FIELD_RADIUS} value={value.confirm} />
    {/* Not an example code: every well-formed example is somebody's real branch, and owners typed it in as a dummy. */}
    <FormInput disabled={readOnly} autoCapitalize="characters" error={errors.ifsc ?? (ifscMissing ? IFSC_NOT_FOUND : undefined)} label="IFSC" maxLength={11} onChangeText={(text) => change({ ...value, ifsc: text.toUpperCase() })} placeholder="On your cheque book or passbook" radius={PAYOUT_FIELD_RADIUS} value={value.ifsc} />
    {ifscWellFormed ? <IfscBranchNote fetching={ifscFetching} lookup={ifscLookup} /> : null}
  </>;
}

/**
 * The branch an IFSC belongs to, named back while the owner types, so a
 * mistyped code is caught before money is sent to it. Quiet when the
 * directory could not be reached: that is not the owner's mistake. A code with
 * no branch shows as the field's own error instead.
 */
export function IfscBranchNote({ fetching, lookup }: { fetching: boolean; lookup: IfscLookup | undefined }) {
  const { colors, fonts, type } = useTheme();
  if (fetching) {
    return <Text style={[type.caption, { color: colors.muted, marginTop: -spacing.xs }]}>Checking branch…</Text>;
  }
  if (lookup?.status !== "FOUND") {
    return null;
  }
  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs, marginTop: -spacing.xs }}>
      <CircleCheck color={colors.successText} size={15} strokeWidth={2.4} style={{ marginTop: 1 }} />
      <Text selectable style={{ color: colors.successText, flex: 1, fontFamily: fonts.sansBold, fontSize: 12.5, lineHeight: 18 }}>
        {[lookup.bank, [lookup.branch, lookup.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
      </Text>
    </View>
  );
}
