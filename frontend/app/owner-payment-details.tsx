import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { OwnerPaymentDetailsSkeleton } from "@/components/skeletons/owner";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { UpiQrField } from "@/features/billing/upi-qr-field";
import { useAppSelector } from "@/store/hooks";
import {
  useGetPropertyPaymentDetailsQuery,
  useUpdatePropertyPaymentDetailsMutation,
} from "@/store/services/payment-intent-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A crisper corner than the app's default 14 on these fields.
 *
 * <p>Local to this screen. Bank and UPI details are transcribed from a
 * statement or a banking app, and the squarer box reads as a form to copy into
 * rather than a soft settings control.
 */
const FIELD_RADIUS = 6;

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
  const form = useFormErrors<"bankAccountNumber" | "bankIfsc" | "upiPhone" | "upiVpa">();

  const [upiVpa, setUpiVpa] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [upiPhone, setUpiPhone] = useState("");
  const [upiQrImageUrl, setUpiQrImageUrl] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankAccountHolder, setBankAccountHolder] = useState("");

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
    setBankIfsc(held.bankIfsc ?? "");
    setBankAccountHolder(held.bankAccountHolder ?? "");
  }, [held, propertyId]);

  /**
   * A QR on its own leaves the tenant with nothing to press.
   *
   * <p>
   * The QR is scanned from a SECOND device — the tenant cannot photograph a
   * code on the phone they are holding. "Scan and pay" is the way out of that,
   * and it fires a {@code upi://pay} link, which needs the address. So a
   * property with a QR and no address is one where the tenant on their own
   * phone sees a picture and no way to act on it.
   */
  const qrNeedsAddress = Boolean(upiQrImageUrl) && !upiVpa.trim();

  const isDirty =
    Boolean(held) &&
    (upiVpa.trim() !== (held?.upiVpa ?? "") ||
      payeeName.trim() !== (held?.payeeName ?? "") ||
      upiPhone.trim() !== (held?.upiPhone ?? "") ||
      upiQrImageUrl !== (held?.upiQrImageUrl ?? "") ||
      bankAccountNumber.trim() !== (held?.bankAccountNumber ?? "") ||
      bankIfsc.trim() !== (held?.bankIfsc ?? "") ||
      bankAccountHolder.trim() !== (held?.bankAccountHolder ?? ""));

  async function submit() {
    // Both halves of the bank reference or neither — the server refuses one
    // without the other, because a tenant cannot transfer to an account number
    // with no IFSC.
    const account = bankAccountNumber.trim();
    const ifsc = bankIfsc.trim();
    const cleared = form.validate({
      ...(qrNeedsAddress
        ? { upiVpa: "Add your UPI address too, or the QR has no Scan and pay button under it." }
        : {}),
      ...(Boolean(account) === Boolean(ifsc)
        ? {}
        : account
          ? { bankIfsc: "Add the IFSC as well, or clear the account number." }
          : { bankAccountNumber: "Add the account number as well, or clear the IFSC." }),
    });
    if (!cleared || !propertyId) {
      return;
    }

    try {
      await save({
        bankAccountHolder: bankAccountHolder.trim() || null,
        bankAccountNumber: account || null,
        bankIfsc: ifsc || null,
        payeeName: payeeName.trim() || null,
        propertyId,
        upiPhone: upiPhone.trim() || null,
        upiQrImageUrl: upiQrImageUrl || null,
        upiVpa: upiVpa.trim() || null,
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
          subtitle="Where your tenants' rent should be paid. Leave it blank to keep collecting offline."
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
        subtitle="Where your tenants' rent should be paid. Leave it blank to keep collecting offline."
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
          <Section title="UPI">
            <Card>
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                Add any of these and tenants can pay their bills from the app. With none of them they are not offered
                the option at all.
              </Text>

              {/* Clears the address error as well as setting the image. Taking
                  the QR off is the other way to resolve it, and without this the
                  owner would fix the problem and stay locked out of Save. */}
              <UpiQrField
                onChange={(value) => {
                  setUpiQrImageUrl(value);
                  form.clearField("upiVpa");
                }}
                url={upiQrImageUrl}
              />
              <Text style={[type.caption, { color: colors.kicker, lineHeight: 17 }]}>
                Shown to tenants. Add your UPI address with it so they also get a Scan and pay button, for paying on
                the phone they are holding.
              </Text>

              <FormInput
                autoCapitalize="none"
                error={form.errors.upiVpa}
                label="UPI address"
                onChangeText={(text) => {
                  setUpiVpa(text);
                  form.clearField("upiVpa");
                }}
                placeholder="name@bank"
                radius={FIELD_RADIUS}
                // Only once a QR is attached. It is genuinely optional on a
                // property collecting by bank transfer alone, and a permanent
                // asterisk would be a lie on that form.
                required={Boolean(upiQrImageUrl)}
                value={upiVpa}
              />
              <FormInput
                error={form.errors.upiPhone}
                keyboardType="number-pad"
                label="UPI phone number"
                maxLength={10}
                onChangeText={(text) => {
                  setUpiPhone(text.replace(/[^0-9]/g, ""));
                  form.clearField("upiPhone");
                }}
                placeholder="10 digits"
                radius={FIELD_RADIUS}
                value={upiPhone}
              />
              <FormInput
                label="Payee name"
                onChangeText={setPayeeName}
                placeholder="What tenants will see in their UPI app"
                radius={FIELD_RADIUS}
                value={payeeName}
              />

            </Card>
          </Section>

          <Section title="Bank transfer">
            <Card>
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                Optional. Fill both fields and tenants get a bank tab alongside UPI, with a reminder to quote the bill
                reference so you can match the transfer.
              </Text>

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
                  setBankAccountNumber(text.replace(/[^0-9]/g, ""));
                  form.clearField("bankAccountNumber");
                }}
                placeholder=""
                radius={FIELD_RADIUS}
                value={bankAccountNumber}
              />
              <FormInput
                autoCapitalize="characters"
                error={form.errors.bankIfsc}
                label="IFSC"
                maxLength={11}
                onChangeText={(text) => {
                  setBankIfsc(text.toUpperCase());
                  form.clearField("bankIfsc");
                }}
                placeholder="HDFC0001234"
                radius={FIELD_RADIUS}
                value={bankIfsc}
              />
            </Card>
          </Section>

          <ActionButton
            disabled={saveState.isLoading || form.blocked || !isDirty}
            label={saveState.isLoading ? "Saving…" : "Save payment setup"}
            onPress={() => void submit()}
          />
        </>
      )}

      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}
