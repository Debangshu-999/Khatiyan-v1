import { useRef, useState, type ReactNode } from "react";
import { Switch, Text, View } from "react-native";
import { LockKeyhole } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerPaymentDetailsSkeleton } from "@/components/skeletons/owner";
import { useToast } from "@/components/toast";
import { PaymentMethodBand, PaymentMethodIcon } from "@/features/billing/payment-method-toggle";
import { BankDetailsFields, IFSC_PATTERN, UpiDetailsFields } from "@/features/billing/payout-fields";
import { billPaymentFields, bookingPaymentDraft, bookingPaymentDirty, bookingPaymentErrors, bookingPaymentPayload, type BookingPaymentErrors } from "@/features/booking/booking-payment-setup";
import { useBookingProperty } from "@/features/booking/use-booking-property";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useGetPropertyPaymentDetailsQuery, useLookupIfscQuery, useUpdatePropertyPaymentDetailsMutation, type PropertyPaymentDetails } from "@/store/services/payment-intent-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Payout destinations stay owner-only, even for a manager with booking access. */
export default function OwnerBookingPaymentSetupScreen() {
  const scope = useBookingProperty();
  const { colors } = useTheme();
  const query = useGetPropertyPaymentDetailsQuery(scope.property?.id ?? "", {
    skip: !scope.property || !scope.owner || Boolean(scope.error),
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const details = query.currentData;
  if (scope.property && scope.owner && !scope.error && details) {
    return <BookingPaymentSetupEditor key={scope.property.id} propertyId={scope.property.id} propertyName={scope.property.name}
      details={details} readError={query.isError ? errorMessage(query.error) : null} onReload={() => query.refetch().unwrap()} />;
  }
  const failed = scope.error || (scope.owner && query.isError ? query.error : null);
  const loading = scope.loading || Boolean(scope.property && scope.owner && !details && !query.isError);
  return <ScreenScrollView safeAreaEdges={["top", "bottom"]} surface={colors.surface}>
    <ScreenHeader title="Payment" italicTail="setup." subtitle="Where booking token payments are sent." />
    {loading ? <OwnerPaymentDetailsSkeleton /> : failed ? <>
      <NoticeBar title="Could not load payment setup" message={errorMessage(failed)} tone="danger" />
      <ActionButton label="Try again" onPress={() => { if (scope.error) scope.retry(); else void query.refetch(); }} />
    </> : <EmptyState icon={LockKeyhole} title={scope.property ? "Owner only" : "Select a property"}
      description={scope.property ? "Only the property owner can view or change payment details." : "Choose an active property on Home before setting up booking payments."} />}
  </ScreenScrollView>;
}

function BookingPaymentSetupEditor({ propertyId, propertyName, details, readError, onReload }: {
  propertyId: string; propertyName: string; details: PropertyPaymentDetails; readError: string | null;
  onReload: () => Promise<PropertyPaymentDetails>;
}) {
  const { colors, type } = useTheme();
  const router = useGuardedRouter();
  const toast = useToast();
  const [baseline, setBaseline] = useState(details);
  const [draft, setDraft] = useState(() => bookingPaymentDraft(details));
  const [save, saveState] = useUpdatePropertyPaymentDetailsMutation();
  const busy = useRef(false);
  const form = useFormErrors<keyof BookingPaymentErrors>();
  const changed = details.version > baseline.version;
  const locked = saveState.isLoading || changed || Boolean(readError);
  const displayed = draft.useBilling ? billPaymentFields(baseline) : draft;
  const ifsc = displayed.bank.ifsc.trim();
  const lookup = useLookupIfscQuery(ifsc, { skip: !IFSC_PATTERN.test(ifsc) });
  const ifscMissing = !draft.useBilling && IFSC_PATTERN.test(ifsc) && !lookup.isFetching && lookup.data?.status === "NOT_FOUND";
  const mismatch = !draft.useBilling && draft.bank.confirm.trim().length > 0 && draft.bank.confirm.trim() !== draft.bank.account.trim();
  const dirty = bookingPaymentDirty(baseline, draft);

  async function submit(nextDraft = draft) {
    if (busy.current || locked || !bookingPaymentDirty(baseline, nextDraft) || !form.validate(bookingPaymentErrors(nextDraft, !nextDraft.useBilling && ifscMissing))) return false;
    busy.current = true;
    try {
      const saved = await save(bookingPaymentPayload(propertyId, baseline, nextDraft)).unwrap();
      setBaseline(saved);
      setDraft(bookingPaymentDraft(saved));
      toast.success("Booking payment setup saved.");
      return true;
    } catch (caught) {
      form.failFromServer(errorMessage(caught) || "Could not save payment setup. Try again.");
      return false;
    } finally { busy.current = false; }
  }

  async function chooseSource(useBilling: boolean) {
    if (busy.current || locked) return;
    const nextDraft = { ...draft, useBilling };
    setDraft(nextDraft);
    form.clearAll();
    // Inherited details have no save button: choosing them applies the source immediately.
    // Keep an unsaved separate draft when Billing is already the saved source.
    if (useBilling && !baseline.tokenUsesBillDetails && !await submit(nextDraft)) setDraft(draft);
  }

  async function reload() {
    if (busy.current) return;
    try {
      const latest = await onReload();
      setBaseline(latest); setDraft(bookingPaymentDraft(latest)); form.clearAll();
    } catch (caught) { form.failFromServer(errorMessage(caught)); }
  }

  return <ScreenScrollView safeAreaEdges={["top", "bottom"]} surface={colors.surface} onRefresh={() => void reload()}>
    <ScreenHeader title="Payment" italicTail="setup." subtitle={`Booking token payment details for ${propertyName}.`} />
    {changed || readError ? <>
      <NoticeBar tone="warning" title="Reload payment details" message={readError || "Payment details changed elsewhere. Reload before saving."} />
      <ActionButton label="Reload details" onPress={() => void reload()} variant="secondary" />
    </> : null}
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[type.bodyStrong, { color: colors.ink }]}>Use billing payment details</Text>
          <Text style={[type.description, { color: colors.muted }]}>{draft.useBilling ? "Billing details are shown below, read-only." : "Enter separate UPI or bank details for booking tokens."}</Text>
        </View>
        <Switch accessibilityLabel="Use billing payment details" disabled={locked} value={draft.useBilling}
          onValueChange={(useBilling) => void chooseSource(useBilling)}
          thumbColor={colors.surface} trackColor={{ false: colors.neutralSoft, true: colors.primary }} />
      </View>
      {draft.useBilling ? <ActionButton label="Edit billing payment details" variant="secondary" onPress={() => router.push("/owner-payment-details")} /> : null}
      {form.errors.details ? <Text style={[type.description, { color: colors.danger }]}>{form.errors.details}</Text> : null}
    </Card>
    <BookingPaymentSection method="UPI" title="UPI payment" description="Tenants pay the booking token from their UPI app, then submit proof for your team to confirm.">
      <UpiDetailsFields value={displayed.upi} readOnly={draft.useBilling || locked}
        errors={{ upiQr: form.errors.upiQr, upiVpa: form.errors.upiVpa, upiPhone: form.errors.upiPhone, payeeName: form.errors.payeeName }}
        onChange={(upi) => { if (!draft.useBilling && !locked) { setDraft((current) => ({ ...current, upi })); form.clearAll(); } }} />
    </BookingPaymentSection>
    <BookingPaymentSection method="BANK_TRANSFER" title="Bank transfer" description="Tenants transfer the booking token to this account, then submit proof for your team to confirm.">
      <BankDetailsFields value={displayed.bank} readOnly={draft.useBilling || locked} ifscFetching={lookup.isFetching} ifscLookup={lookup.data}
        errors={{ account: form.errors.account, confirm: form.errors.confirm, ifsc: form.errors.ifsc }}
        onChange={(bank) => { if (!draft.useBilling && !locked) { setDraft((current) => ({ ...current, bank })); form.clearAll(); } }} />
    </BookingPaymentSection>
    {!draft.useBilling ? <ActionButton disabled={locked || form.blocked || !dirty || mismatch || ifscMissing} label={saveState.isLoading ? "Saving…" : "Save payment setup"} onPress={() => void submit()} /> : null}
    {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
  </ScreenScrollView>;
}

function BookingPaymentSection({ children, method, title, description }: {
  children: ReactNode; method: "UPI" | "BANK_TRANSFER"; title: string; description: string;
}) {
  const { colors, fonts } = useTheme();
  return <View style={{ gap: spacing.sm }}>
    {/* The same grey band Payment setup's own method rows sit on (user, 2026-10-11). */}
    <PaymentMethodBand>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 32 }}>
        <PaymentMethodIcon method={method} size={20} />
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>{title}</Text>
      </View>
    </PaymentMethodBand>
    <NoticeBar title="How it works" message={description} tone="info" />
    <Card>{children}</Card>
  </View>;
}
