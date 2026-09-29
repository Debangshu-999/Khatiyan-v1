import { useEffect, useState, type ReactNode } from "react";
import { Switch, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CircleCheck } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerPaymentDetailsSkeleton } from "@/components/skeletons/owner";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput, NoticeBar } from "@/features/owner/owner-ui";
import { UpiQrField } from "@/features/billing/upi-qr-field";
import { PaymentMethodToggle } from "@/features/billing/payment-method-toggle";
import { METHOD_LABEL, METHOD_ORDER, type TenderMethod } from "@/features/billing/payment-methods";
import { useAppSelector } from "@/store/hooks";
import {
  useGetPropertyPaymentDetailsQuery,
  useLookupIfscQuery,
  useUpdatePropertyPaymentDetailsMutation,
  type IfscLookup,
} from "@/store/services/payment-intent-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A crisper corner than the app's default 14 on these fields.
 *
 * <p>Local to this screen. Bank and UPI details are transcribed from a
 * statement or a banking app, and the squarer box reads as a form to copy into
 * rather than a soft settings control.
 */
const FIELD_RADIUS = 6;

/** Four letters, a zero, six letters or digits: every Indian branch code. */
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const IFSC_NOT_FOUND = "No bank branch uses this IFSC. Check your cheque book or passbook.";
const ACCOUNT_MISMATCH = "Account numbers do not match.";

/**
 * Where this property's rent should be paid to.
 *
 * <p>
 * <b>Owner only</b>, to read as well as to write. This is their payout
 * destination and their bank account — a manager who runs the bills has no
 * business seeing which account the money lands in, and the server refuses them
 * too.
 *
 * <p>
 * Everything is optional. An owner collecting only in cash saves this empty and
 * their tenants are simply never offered a Pay button.
 */
export default function OwnerPaymentDetailsScreen() {
  const { colors, type } = useTheme();
  const toast = useToast();
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const hydrated = useAppSelector((state) => state.auth.hydrated);
  const detailsQuery = useGetPropertyPaymentDetailsQuery(propertyId ?? "", { skip: !propertyId });
  const [save, saveState] = useUpdatePropertyPaymentDetailsMutation();
  const form = useFormErrors<
    "bankAccountConfirm" | "bankAccountNumber" | "bankIfsc" | "payeeName" | "upiPhone" | "upiQr" | "upiVpa"
  >();

  const [upiVpa, setUpiVpa] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [upiPhone, setUpiPhone] = useState("");
  const [upiQrImageUrl, setUpiQrImageUrl] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  // Typed a second time and matched before saving (user, 2026-09-29). A digit
  // wrong sends a tenant's rent to someone else, and nothing here can check
  // an account number against the bank for free.
  const [bankAccountConfirm, setBankAccountConfirm] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankAccountHolder, setBankAccountHolder] = useState("");
  // Checked against the bank directory once the code is well formed, which is
  // also the debounce: nothing goes out mid-word. A directory that cannot be
  // reached blocks nothing, only a definite "no such branch" does.
  const ifscCode = bankIfsc.trim();
  const ifscWellFormed = IFSC_PATTERN.test(ifscCode);
  const ifscLookup = useLookupIfscQuery(ifscCode, { skip: !ifscWellFormed });
  const ifscMissing = ifscWellFormed && !ifscLookup.isFetching && ifscLookup.data?.status === "NOT_FOUND";
  // Live, once something is typed in the second field: a mismatch is said
  // under it and holds Save back. An empty second field is asked for on Save.
  const accountMismatch =
    bankAccountConfirm.trim().length > 0 && bankAccountConfirm.trim() !== bankAccountNumber.trim();
  // Which ways the property takes money, and whether cash needs the tenant's
  // code (2026-09-28). Cash only, no code, until the owner changes it.
  const [accepted, setAccepted] = useState<Set<TenderMethod>>(() => new Set<TenderMethod>(["CASH"]));
  const [cashOtp, setCashOtp] = useState(false);
  /** The method the owner just tried to untick while it was the last one on. */
  const [lastMethod, setLastMethod] = useState<TenderMethod | null>(null);

  // Seeded once the server copy lands, keyed on the property so switching
  // workspaces reloads rather than carrying one property's payout details onto
  // another — which is the one mistake here that moves money to the wrong place.
  const held = detailsQuery.data;
  useEffect(() => {
    if (!held) {
      return;
    }
    setUpiVpa(held.upiVpa ?? "");
    setPayeeName(held.payeeName ?? "");
    setUpiPhone(held.upiPhone ?? "");
    setUpiQrImageUrl(held.upiQrImageUrl ?? "");
    setBankAccountNumber(held.bankAccountNumber ?? "");
    // The saved number was matched when it was saved.
    setBankAccountConfirm(held.bankAccountNumber ?? "");
    setBankIfsc(held.bankIfsc ?? "");
    setBankAccountHolder(held.bankAccountHolder ?? "");
    setAccepted(new Set(held.acceptedMethods.filter((method): method is TenderMethod => method !== "OTHER")));
    setCashOtp(held.cashOtpRequired);
  }, [held, propertyId]);

  /**
   * One method is always on (user, 2026-09-28): unticking the last one is
   * refused with a warning, rather than leaving tenants no way to pay.
   */
  function toggleMethod(method: TenderMethod) {
    if (accepted.has(method) && accepted.size === 1) {
      setLastMethod(method);
      return;
    }
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(method)) {
        next.delete(method);
      } else {
        next.add(method);
      }
      return next;
    });
    form.clearField("upiVpa");
    form.clearField("bankAccountNumber");
  }
  const heldMethods = (held?.acceptedMethods ?? []).filter((method) => method !== "OTHER");
  const methodsChanged =
    heldMethods.length !== accepted.size || heldMethods.some((method) => !accepted.has(method as TenderMethod));

  /**
   * The four UPI details go together: all of them, or none.
   *
   * <p>
   * Each covers a way a tenant pays. The QR is scanned from a second device,
   * the address powers Scan and pay on the phone they are holding, the phone
   * number is what many UPI apps pay to, and the receiver name is how the
   * tenant checks the money is going to the right person. A partial set leaves
   * some tenants a picture with no button, or a button with no name to check.
   * The server enforces the same rule.
   */
  const upiFilled = {
    payeeName: Boolean(payeeName.trim()),
    upiPhone: Boolean(upiPhone.trim()),
    upiQr: Boolean(upiQrImageUrl),
    upiVpa: Boolean(upiVpa.trim()),
  };
  const anyUpi = Object.values(upiFilled).some(Boolean);

  const isDirty =
    Boolean(held) &&
    (upiVpa.trim() !== (held?.upiVpa ?? "") ||
      payeeName.trim() !== (held?.payeeName ?? "") ||
      upiPhone.trim() !== (held?.upiPhone ?? "") ||
      upiQrImageUrl !== (held?.upiQrImageUrl ?? "") ||
      bankAccountNumber.trim() !== (held?.bankAccountNumber ?? "") ||
      bankIfsc.trim() !== (held?.bankIfsc ?? "") ||
      bankAccountHolder.trim() !== (held?.bankAccountHolder ?? "") ||
      methodsChanged ||
      cashOtp !== (held?.cashOtpRequired ?? false));

  function clearUpiErrors() {
    form.clearField("upiQr");
    form.clearField("upiVpa");
    form.clearField("upiPhone");
    form.clearField("payeeName");
  }

  async function submit() {
    // Both halves of the bank reference or neither — the server refuses one
    // without the other, because a tenant cannot transfer to an account number
    // with no IFSC.
    const account = bankAccountNumber.trim();
    const ifsc = bankIfsc.trim();
    const confirm = bankAccountConfirm.trim();
    // A ticked UPI or bank transfer needs its details: tenants are offered it.
    const takesUpi = accepted.has("UPI");
    const takesBank = accepted.has("BANK_TRANSFER");
    const incomplete = takesUpi ? "Needed to take UPI." : "Add this too, or clear the other UPI details.";
    const needUpi = anyUpi || takesUpi;
    const cleared = form.validate({
      ...(needUpi && !upiFilled.upiQr ? { upiQr: incomplete } : {}),
      ...(needUpi && !upiFilled.upiVpa ? { upiVpa: incomplete } : {}),
      ...(needUpi && !upiFilled.upiPhone ? { upiPhone: incomplete } : {}),
      ...(needUpi && !upiFilled.payeeName ? { payeeName: incomplete } : {}),
      ...(takesBank && !account ? { bankAccountNumber: "Needed to take bank transfers." } : {}),
      ...(account && !confirm ? { bankAccountConfirm: "Re-enter the account number." } : {}),
      ...(account && confirm && confirm !== account ? { bankAccountConfirm: ACCOUNT_MISMATCH } : {}),
      ...(takesBank && !ifsc ? { bankIfsc: "Needed to take bank transfers." } : {}),
      ...(ifsc && !IFSC_PATTERN.test(ifsc) ? { bankIfsc: "Enter a valid IFSC. It is 11 characters: 4 letters, a 0, then 6 letters or digits." } : {}),
      ...(ifscMissing ? { bankIfsc: IFSC_NOT_FOUND } : {}),
      ...(!takesBank && Boolean(account) !== Boolean(ifsc)
        ? account
          ? { bankIfsc: "Add the IFSC as well, or clear the account number." }
          : { bankAccountNumber: "Add the account number as well, or clear the IFSC." }
        : {}),
    });
    if (!cleared || !propertyId) {
      return;
    }

    try {
      await save({
        // The setup as loaded (2026-09-29). 0 before its first save.
        version: held?.version ?? 0,
        bankAccountHolder: bankAccountHolder.trim() || null,
        bankAccountNumber: account || null,
        bankIfsc: ifsc || null,
        payeeName: payeeName.trim() || null,
        propertyId,
        upiPhone: upiPhone.trim() || null,
        upiQrImageUrl: upiQrImageUrl || null,
        upiVpa: upiVpa.trim() || null,
        acceptedMethods: METHOD_ORDER.filter((method) => accepted.has(method)),
        cashOtpRequired: cashOtp,
      }).unwrap();
      toast.success("Payment setup saved.");
    } catch (caught) {
      form.failFromServer(errorMessage(caught) || "Could not save that. Try again.");
    }
  }

  // The selected property is read from persisted state, which rehydrates
  // asynchronously — so before it lands `propertyId` is null and this screen
  // told an owner who HAS one selected to go and select one. The shape first,
  // and the empty state only once we know it is true.
  if (!hydrated) {
    return (
      <ScreenScrollView
        background={
          <View style={{ backgroundColor: colors.surface, flex: 1 }}>
            <LinearGradient
              colors={[colors.primarySoft, colors.surface]}
              end={{ x: 0.5, y: 1 }}
              locations={[0, 1]}
              start={{ x: 0.5, y: 0 }}
              style={{ height: 260 }}
            />
          </View>
        }
        safeAreaEdges={["top", "bottom"]}
        surface={colors.surface}
      >
        <ScreenHeader
          title="Payment"
          italicTail="setup."
          subtitle="How your tenants can pay. Tick the ways you take money."
        />
        <OwnerPaymentDetailsSkeleton />
      </ScreenScrollView>
    );
  }

  if (!propertyId) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <EmptyState
          description="Payment setup is per property. Choose one on Home first."
          title="Select a property"
        />
      </ScreenScrollView>
    );
  }

  return (
    <ScreenScrollView
      background={
        <View style={{ backgroundColor: colors.surface, flex: 1 }}>
          <LinearGradient
            colors={[colors.primarySoft, colors.surface]}
            end={{ x: 0.5, y: 1 }}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }}
            style={{ height: 260 }}
          />
        </View>
      }
      safeAreaEdges={["top", "bottom"]}
      surface={colors.surface}
    >
      <ScreenHeader
        title="Payment"
        italicTail="setup."
        subtitle="How your tenants can pay. Tick the ways you take money."
      />

      {/* The screen's shape: two sections, each a card of fields, and the save
          button. One card stood in for all of it — and worse, the form beneath
          rendered its inputs EMPTY while the saved details were still arriving,
          so an owner with a UPI address on file was shown a blank form telling
          them they had none. */}
      {detailsQuery.isLoading ? (
        <OwnerPaymentDetailsSkeleton />
      ) : (
        <>
          <MethodBlock
            checked={accepted.has("CASH")}
            description="Tenants hand over cash at your desk. No claim is raised, you mark the bill paid."
            method="CASH"
            onToggle={() => toggleMethod("CASH")}
          >
            {/* Its own grey panel, so the one setting cash has reads as a
                control and not as more of the explanation above it. */}
            <View
              style={{
                backgroundColor: colors.surfaceSunken,
                borderCurve: "continuous",
                borderRadius: radii.card,
                padding: spacing.md,
              }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.ink }]}>Verify cash with OTP</Text>
                  <Text style={[type.description, { color: colors.muted }]}>
                    The tenant reads out a code sent to their phone before you mark the bill paid.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Verify cash with OTP"
                  onValueChange={setCashOtp}
                  thumbColor={colors.surface}
                  trackColor={{ false: colors.neutralSoft, true: colors.primary }}
                  value={cashOtp}
                />
              </View>
            </View>
          </MethodBlock>

          <MethodBlock
            checked={accepted.has("UPI")}
            description="Tenants pay from their UPI app, then raise a claim you confirm."
            method="UPI"
            onToggle={() => toggleMethod("UPI")}
          >
            <Card>
              {/* Changing any one UPI detail can resolve another's "add this
                  too" error (clearing everything is a valid answer), so each
                  change clears all four rather than only its own. */}
              <UpiQrField
                error={form.errors.upiQr}
                onChange={(value) => {
                  setUpiQrImageUrl(value);
                  clearUpiErrors();
                }}
                required={anyUpi}
                url={upiQrImageUrl}
              />

              <FormInput
                autoCapitalize="none"
                error={form.errors.upiVpa}
                label="UPI address"
                onChangeText={(text) => {
                  setUpiVpa(text);
                  clearUpiErrors();
                }}
                placeholder="name@bank"
                radius={FIELD_RADIUS}
                // Only once any UPI detail is filled. A property collecting by
                // bank transfer alone needs none of them, and a permanent
                // asterisk would be a lie on that form.
                required={anyUpi}
                value={upiVpa}
              />
              <FormInput
                error={form.errors.upiPhone}
                keyboardType="number-pad"
                label="UPI phone number"
                maxLength={10}
                onChangeText={(text) => {
                  setUpiPhone(text.replace(/[^0-9]/g, ""));
                  clearUpiErrors();
                }}
                placeholder="10 digits"
                radius={FIELD_RADIUS}
                required={anyUpi}
                value={upiPhone}
              />
              <FormInput
                error={form.errors.payeeName}
                label="Receiver name"
                onChangeText={(text) => {
                  setPayeeName(text);
                  clearUpiErrors();
                }}
                placeholder="What tenants will see in their UPI app"
                radius={FIELD_RADIUS}
                required={anyUpi}
                value={payeeName}
              />

            </Card>
          </MethodBlock>

          <MethodBlock
            checked={accepted.has("BANK_TRANSFER")}
            description="Tenants transfer to this account quoting the bill reference, then raise a claim you confirm."
            method="BANK_TRANSFER"
            onToggle={() => toggleMethod("BANK_TRANSFER")}
          >
            <Card>
              <FormInput
                label="Account holder"
                onChangeText={setBankAccountHolder}
                placeholder="Name on the account"
                radius={FIELD_RADIUS}
                value={bankAccountHolder}
              />
              <FormInput
                error={form.errors.bankAccountNumber}
                keyboardType="number-pad"
                label="Account number"
                maxLength={18}
                onChangeText={(text) => {
                  const digits = text.replace(/[^0-9]/g, "");
                  // A changed number is typed again from scratch.
                  if (digits !== bankAccountNumber) {
                    setBankAccountConfirm("");
                  }
                  setBankAccountNumber(digits);
                  form.clearField("bankAccountNumber");
                  form.clearField("bankAccountConfirm");
                }}
                placeholder=""
                radius={FIELD_RADIUS}
                value={bankAccountNumber}
              />
              <FormInput
                error={form.errors.bankAccountConfirm ?? (accountMismatch ? ACCOUNT_MISMATCH : undefined)}
                keyboardType="number-pad"
                label="Re-enter account number"
                maxLength={18}
                noPaste
                onChangeText={(text) => {
                  setBankAccountConfirm(text.replace(/[^0-9]/g, ""));
                  form.clearField("bankAccountConfirm");
                }}
                placeholder=""
                radius={FIELD_RADIUS}
                value={bankAccountConfirm}
              />
              <FormInput
                autoCapitalize="characters"
                error={form.errors.bankIfsc ?? (ifscMissing ? IFSC_NOT_FOUND : undefined)}
                label="IFSC"
                maxLength={11}
                onChangeText={(text) => {
                  setBankIfsc(text.toUpperCase());
                  form.clearField("bankIfsc");
                }}
                // Not an example code: every well-formed example is somebody's
                // real branch (HDFC0001234 is HDFC Park Street, Jaipur), and
                // owners typed it in as a dummy.
                placeholder="On your cheque book or passbook"
                radius={FIELD_RADIUS}
                value={bankIfsc}
              />
              {ifscWellFormed ? <IfscBranchNote fetching={ifscLookup.isFetching} lookup={ifscLookup.data} /> : null}
            </Card>
          </MethodBlock>

          <MethodBlock
            checked={accepted.has("CARD")}
            description="Tenants pay by card at your desk, then raise a claim with the slip's approval code or a photo."
            method="CARD"
            onToggle={() => toggleMethod("CARD")}
          />

          <MethodBlock
            checked={accepted.has("CHEQUE")}
            description="Tenants hand over a cheque, then raise a claim with its number or a photo."
            method="CHEQUE"
            onToggle={() => toggleMethod("CHEQUE")}
          />

          {/* Bank transfer is never saved against an IFSC with no branch
              (user, 2026-09-28), nor while the check is still out. */}
          <ActionButton
            disabled={
              saveState.isLoading ||
              form.blocked ||
              !isDirty ||
              ifscMissing ||
              (ifscWellFormed && ifscLookup.isFetching) ||
              accountMismatch
            }
            label={saveState.isLoading ? "Saving…" : "Save payment setup"}
            onPress={() => void submit()}
          />
        </>
      )}

      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
      {lastMethod ? (
        <AlertModal
          message={`${METHOD_LABEL[lastMethod]} is the only way tenants can pay right now. Tick another method before turning it off.`}
          onClose={() => setLastMethod(null)}
          tone="warning"
        />
      ) : null}
    </ScreenScrollView>
  );
}

/**
 * One payment method in Payment setup: its checkbox as the heading, what it
 * means for tenants in a blue notice, then its settings. Everything stays open
 * whether it is ticked or not, so an owner can read what a method does before
 * turning it on.
 */
function MethodBlock({
  checked,
  children,
  description,
  method,
  onToggle,
}: {
  checked: boolean;
  children?: ReactNode;
  description: string;
  method: TenderMethod;
  onToggle: () => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <PaymentMethodToggle checked={checked} method={method} onToggle={onToggle} />
      <NoticeBar message={description} title="How it works" tone="info" />
      {children}
    </View>
  );
}

/**
 * The branch an IFSC belongs to, named back while the owner types, so a
 * mistyped code is caught before a tenant sends money to it. Quiet when the
 * directory could not be reached: that is not the owner's mistake. A code with
 * no branch shows as the field's own error instead.
 */
function IfscBranchNote({ fetching, lookup }: { fetching: boolean; lookup: IfscLookup | undefined }) {
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
