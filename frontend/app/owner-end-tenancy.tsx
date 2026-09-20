import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { AlertTriangle, Check, DoorOpen, Info, Plus, Shield, Trash2 } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { OwnerEndTenancySkeleton } from "@/components/skeletons/owner";
import { SingleOptionPicker } from "@/components/option-picker";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import {
  ActionButton,
  ConfirmDialog,
  FormInput,
  NoticeBar,
  formatMoneyPaise,
  rupeesToPaise,
} from "@/features/owner/owner-ui";
import { DepositAccountDetail } from "@/features/billing/deposit-account-ui";
import { SingleImageField } from "@/features/uploads/single-image-field";
import { useAppSelector } from "@/store/hooks";
import {
  billTitle,
  useGetManagedTenancyDepositQuery,
  useListManagedTenancyBillingCyclesQuery,
} from "@/store/services/billing-api";
import type { DepositAccount } from "@/store/services/billing-api";
import { useGetPropertyExitPoliciesQuery } from "@/store/services/property-api";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import type {
  ExitCharge,
  ExitChargeInstrument,
  ExitCollectionMethod,
  ExitCustomCharge,
} from "@/store/services/tenancy-api";
import {
  useEndTenancyMutation,
  useListPropertyTenanciesQuery,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const COLLECTION_METHODS: { label: string; value: ExitCollectionMethod }[] = [
  { label: "Cash", value: "CASH" },
  { label: "UPI", value: "UPI" },
  { label: "Card", value: "CARD" },
  { label: "Cheque", value: "CHEQUE" },
  { label: "Other", value: "OTHER" },
];

const PAYMENT_METHOD_OPTIONS = COLLECTION_METHODS.filter((option) => option.value !== "OTHER");

const INSTRUMENT_OPTIONS: { label: string; value: ExitChargeInstrument }[] = [
  { label: "From deposit", value: "DEPOSIT" },
  { label: "One-off bill", value: "ONE_OFF_BILL" },
];

/**
 * End-tenancy: the one place money moves at the close of a stay.
 *
 * <p>Everything assessed here — the early-exit charge, the deposit's fate,
 * damages — is submitted as a single call and applied in one transaction. That
 * is why the screen collects it all before doing anything: a deposit deducted
 * against a tenancy that then failed to end would leave no screen showing the
 * actor what half-happened.
 *
 * <p>The dues gate blocks. The checklist does not — it is the actor's
 * assessment, recorded, and a missing towel should never be what keeps a
 * tenancy legally open.
 */
export default function OwnerEndTenancyScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const toast = useToast();
  // Every refusal on this screen arrives mid-operation — an instrument that
  // cannot be used, a server that says no. There is no field to correct, so
  // they all go to the modal.
  const opErrors = useFormErrors<never>();
  const { tenancyId: tenancyIdParam } = useLocalSearchParams<{ tenancyId?: string }>();
  const tenancyId = typeof tenancyIdParam === "string" ? tenancyIdParam : "";

  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const tenanciesQuery = useListPropertyTenanciesQuery({ includePast: true, propertyId }, { skip: !propertyId });
  const tenancy = tenanciesQuery.data?.find((item) => item.id === tenancyId) ?? null;
  const isDaily = tenancy?.billingType === "DAILY";

  const { canManage: canManageResource } = usePropertyPermissions(propertyId);
  const canManageDeposits = canManageResource("DEPOSITS");

  const policiesQuery = useGetPropertyExitPoliciesQuery(propertyId, { skip: !propertyId });
  const checklist = policiesQuery.data?.exitChecklist ?? [];
  const damageCharges = useMemo(() => policiesQuery.data?.damageCharges ?? [], [policiesQuery.data]);

  const depositQuery = useGetManagedTenancyDepositQuery(tenancyId, { skip: !tenancyId || isDaily });
  const deposit = depositQuery.data ?? null;

  // Read off the TENANCY, not out of the agreement's prose.
  //
  // This used to dig the rule out of the VALIDITY clause's machine-readable
  // value, guarding against the tenancy's copy going stale — the deed was
  // stamped onto the tenancy at ACCEPTANCE, so amending the agreement afterwards
  // left the two disagreeing.
  //
  // That drift is now structurally impossible: the term is stamped at
  // ONBOARDING, and amending a pending deed re-assembles it FROM the tenancy.
  // The tenancy is the source and the document follows it, so there is one value
  // and this screen reads the one being enforced.
  const agreementRule = tenancy?.earlyExitRule?.trim() ?? "";

  const cyclesQuery = useListManagedTenancyBillingCyclesQuery(tenancyId, { skip: !tenancyId });
  // Every bill counts — rent cycles AND one-off bills. Mirrors the backend exit
  // gate, which blocks on any unpaid bill.
  const unpaidBills = useMemo(
    () => (cyclesQuery.data ?? []).filter(
      (cycle) => cycle.status === "UNPAID" || cycle.status === "OVERDUE" || cycle.status === "CONFIRMATION_PENDING",
    ),
    [cyclesQuery.data],
  );
  const duesCleared = unpaidBills.length === 0;
  const currentBill = useMemo(
    () => [...(cyclesQuery.data ?? [])]
      .filter((cycle) => cycle.category === "RENT_CYCLE" && cycle.status !== "UPCOMING" && cycle.status !== "CANCELLED")
      .sort((left, right) => {
        const periodDifference = new Date(right.periodStartDate).getTime() - new Date(left.periodStartDate).getTime();
        return periodDifference !== 0 ? periodDifference : (right.cycleNumber ?? 0) - (left.cycleNumber ?? 0);
      })[0] ?? null,
    [cyclesQuery.data],
  );
  const currentBillTitle = currentBill == null
    ? "Current bill"
    : currentBill.status === "PAID"
      ? "Current bill paid"
      : currentBill.status === "CONFIRMATION_PENDING"
        ? "Payment confirmation pending"
        : currentBill.status === "OVERDUE"
          ? "Current bill overdue"
          : "Current bill unpaid";
  const currentBillMessage = currentBill == null
    ? "No current billing cycle is available for this tenancy."
    : `${billTitle(currentBill)} (${currentBill.referenceCode}) of ${formatMoneyPaise(currentBill.totalAmountPaise)} is ${
        currentBill.status === "PAID"
          ? "paid"
          : currentBill.status === "CONFIRMATION_PENDING"
            ? "awaiting payment confirmation"
            : currentBill.status === "OVERDUE"
              ? "overdue"
              : "unpaid"
      }.`;
  const currentBillTone = currentBill == null
    ? "info" as const
    : currentBill.status === "PAID"
      ? "success" as const
      : currentBill.status === "CONFIRMATION_PENDING"
        ? "warning" as const
        : "danger" as const;

  // ---------------------------------------------------------------- 1 of 3
  // An early exit is one that ends before the day the agreement named. Only a
  // fixed term names one, so an indefinite tenancy is never "early".
  const isEarlyExit = useMemo(() => {
    if (isDaily || !tenancy?.fixedTerm || !tenancy.agreementEndDate) {
      return false;
    }
    const checkout = tenancy.endDate ?? tenancy.plannedEndDate;
    return checkout != null && checkout < tenancy.agreementEndDate;
  }, [isDaily, tenancy]);

  // An open-ended stay has no term to leave early from, so "early" means leaving
  // without serving notice — priced by the property's premature-exit policy
  // rather than the agreement's validity rule. Same charge mechanics either way,
  // which is why one section covers both.
  const prematureExitPolicy = policiesQuery.data?.prematureExitPolicy?.trim() ?? "";
  const isPrematureExit = Boolean(
    !isDaily && tenancy && !tenancy.fixedTerm && tenancy.status === "ON_PREMATURE_NOTICE",
  );
  const showsExitCharge = isEarlyExit || isPrematureExit;

  // Whichever policy governs this exit. The agreement's rule wins when there is
  // a term; otherwise the property's premature-exit policy.
  const governingRule = isEarlyExit ? agreementRule : prematureExitPolicy;

  const [earlyExitRupees, setEarlyExitRupees] = useState("");
  const [earlyExitInstrument, setEarlyExitInstrument] = useState<ExitChargeInstrument | null>(null);
  // The instrument being confirmed, held aside until the actor agrees to it.
  const [pendingInstrument, setPendingInstrument] = useState<ExitChargeInstrument | null>(null);
  const [instrumentPreviewOpen, setInstrumentPreviewOpen] = useState(false);
  const [collectedVia, setCollectedVia] = useState<ExitCollectionMethod>("CASH");
  /** Cloudinary URL once uploaded — never a device URI. "" while unset. */
  const [proofImageUrl, setProofImageUrl] = useState("");
  // When the charge outgrows the deposit the actor can split it: the deposit
  // takes what it covers and the rest is billed. Null means no split.
  const [splitDepositPaise, setSplitDepositPaise] = useState<number | null>(null);
  const earlyExitPaise = rupeesToPaise(earlyExitRupees) ?? 0;

  // ---------------------------------------------------------------- 2 of 3
  const [ruleInfoOpen, setRuleInfoOpen] = useState(false);
  const [depositPayable, setDepositPayable] = useState(true);
  const [depositSheetOpen, setDepositSheetOpen] = useState(false);

  // ---------------------------------------------------------------- 3 of 3
  const [damageSelected, setDamageSelected] = useState<Record<string, boolean>>({});
  const [damageInstrument, setDamageInstrument] = useState<ExitChargeInstrument | null>(null);
  const [pendingDamageInstrument, setPendingDamageInstrument] = useState<ExitChargeInstrument | null>(null);
  const [damagePreviewOpen, setDamagePreviewOpen] = useState(false);
  const [customCharges, setCustomCharges] = useState<ExitCustomCharge[]>([]);
  const [addDamageOpen, setAddDamageOpen] = useState(false);
  const selectedDamageNames = damageCharges.filter((item) => damageSelected[item.name]).map((item) => item.name);
  const scheduleDamagePaise = damageCharges
    .filter((item) => damageSelected[item.name])
    .reduce((sum, item) => sum + item.chargePaise, 0);
  const damageTotalPaise = scheduleDamagePaise + customCharges.reduce((sum, row) => sum + row.amountPaise, 0);

  // ------------------------------------------------------------- checklist
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const [endTenancy, endState] = useEndTenancyMutation();

  // Mirrors the server's running-balance rule so the actor sees the problem
  // while they can still fix it, rather than as a rejection after submitting.
  const depositBalancePaise = deposit?.currentBalancePaise ?? 0;
  // Nothing to deduct from: offering the deposit here would only produce a
  // rejection at submit, or a split whose deposit half is zero.
  const depositUnavailable = deposit == null || depositBalancePaise <= 0;
  const depositCollectionBlocked = !isDaily && !depositPayable;

  // A forfeited deposit is the settlement itself, not a pool that can also pay
  // charges. Clear any older deposit choice immediately when the disposition
  // changes, including an inconsistent configuration loaded for editing.
  useEffect(() => {
    if (!depositCollectionBlocked) {
      return;
    }
    setEarlyExitInstrument((current) => current === "DEPOSIT" ? null : current);
    setDamageInstrument((current) => current === "DEPOSIT" ? null : current);
    setPendingInstrument((current) => current === "DEPOSIT" ? null : current);
    setPendingDamageInstrument((current) => current === "DEPOSIT" ? null : current);
    setSplitDepositPaise(null);
    setInstrumentPreviewOpen(false);
    setDamagePreviewOpen(false);
  }, [depositCollectionBlocked]);

  // One list, used for the payload, the deposit projection and the summary row —
  // so the three can never disagree about what is being charged.
  const earlyExitCharges = useMemo<ExitCharge[]>(() => {
    if (!showsExitCharge || earlyExitPaise <= 0 || earlyExitInstrument == null) {
      return [];
    }
    if (earlyExitInstrument === "DEPOSIT" && splitDepositPaise != null) {
      return [
        { amountPaise: splitDepositPaise, collectedVia: null, instrument: "DEPOSIT", reason: "Early exit charge" },
        {
          amountPaise: earlyExitPaise - splitDepositPaise,
          collectedVia,
          instrument: "ONE_OFF_BILL",
          reason: "Early exit charge (balance)",
        },
      ];
    }
    return [
      {
        amountPaise: earlyExitPaise,
        collectedVia: earlyExitInstrument === "ONE_OFF_BILL" ? collectedVia : null,
        instrument: earlyExitInstrument,
        reason: "Early exit charge",
      },
    ];
  }, [collectedVia, earlyExitInstrument, earlyExitPaise, showsExitCharge, splitDepositPaise]);

  const billedEarlyExitPaise = earlyExitCharges
    .filter((charge) => charge.instrument === "ONE_OFF_BILL")
    .reduce((sum, charge) => sum + charge.amountPaise, 0);
  const earlyExitFromDepositPaise = earlyExitCharges
    .filter((charge) => charge.instrument === "DEPOSIT")
    .reduce((sum, charge) => sum + charge.amountPaise, 0);
  const depositDemandPaise =
    earlyExitFromDepositPaise + (damageInstrument === "DEPOSIT" ? damageTotalPaise : 0);
  const damageOnDeposit = damageInstrument === "DEPOSIT" ? damageTotalPaise : 0;
  // A charge with no instrument would be silently dropped on submit.
  const earlyExitNeedsInstrument = showsExitCharge && earlyExitPaise > 0 && earlyExitInstrument == null;
  const damageNeedsInstrument = damageTotalPaise > 0 && damageInstrument == null;
  const overdrawnPaise = Math.max(depositDemandPaise - depositBalancePaise, 0);
  const forfeitConflict = !isDaily && !depositPayable && depositDemandPaise > 0;
  // Cash actually changes hands only when something is billed. A settlement
  // taken entirely from the deposit moves no money at move-out, so there is
  // nothing to photograph and the field would be asking for a fiction.
  const collectsMoney = billedEarlyExitPaise > 0 || (damageInstrument === "ONE_OFF_BILL" && damageTotalPaise > 0);

  const blockingMessage = !duesCleared
    ? unpaidBills.length === 1
      ? "Clear the outstanding bill before ending the tenancy."
      : "Clear all outstanding bills before ending the tenancy."
    : earlyExitNeedsInstrument
      ? "Choose how the early exit charge is collected."
      : damageNeedsInstrument
        ? "Choose how the damage charges are collected."
      : forfeitConflict
      ? "A deposit that is not being refunded cannot also be deducted from. Move those charges to a one-off bill."
      : overdrawnPaise > 0
        ? `The deposit is short by ${formatMoneyPaise(overdrawnPaise)}. Move the excess to a one-off bill.`
        : null;

  async function end() {
    // The button is already disabled while anything is blocking, and the reason
    // is stated on screen in the "Action needed" bar — repeating it here would
    // be a second copy of a message the reader is already looking at.
    if (!tenancyId || blockingMessage) {
      return;
    }
    try {
      await endTenancy({
        checklistConfirmed: checklist.filter((_, index) => checked[index]),
        // Narrowed on the instrument: a damage charge with none chosen is
        // blocked above, so this can never drop one silently.
        damages:
          damageInstrument != null && (selectedDamageNames.length > 0 || customCharges.length > 0)
            ? {
                collectedVia: damageInstrument === "ONE_OFF_BILL" ? collectedVia : null,
                customCharges,
                instrument: damageInstrument,
                itemNames: selectedDamageNames,
              }
            : null,
        depositPayable: isDaily || !deposit ? null : depositPayable,
        earlyExitCharges,
        // Guarded on `collectsMoney` as well as on the value: someone can
        // attach a proof, then move every charge onto the deposit, and the
        // photo would otherwise be filed against a payment that never happened.
        proofImageUrl: collectsMoney ? proofImageUrl.trim() || null : null,
        tenancyId,
      }).unwrap();
      toast.success("Tenancy ended.");
      router.back();
    } catch (error) {
      opErrors.failFromServer(errorMessage(error) || "Could not end the tenancy. Please try again.");
    }
  }

  const loading = tenanciesQuery.isFetching && !tenancy;

  // Numbering is derived from what is on screen. A daily stay shows only damage
  // charges; a monthly stay at the end of its term shows deposit and damages but
  // no early-exit section.
  const sections = [
    ...(showsExitCharge ? (["earlyExit"] as const) : []),
    ...(!isDaily ? (["deposit"] as const) : []),
    "damages" as const,
  ];
  const stepCount = sections.length;
  const stepOf = (name: (typeof sections)[number]) => sections.indexOf(name) + 1;

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView safeAreaEdges={["top"]} contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE }}>
        <ScreenHeader
          title="End"
          italicTail="tenancy."
          subtitle={
            tenancy
              ? `Check out ${tenancy.tenantName?.trim() || "the tenant"} and settle up.`
              : "Ending a tenancy."
          }
        />

        {loading ? (
          <OwnerEndTenancySkeleton />
        ) : !tenancy ? (
          <EmptyState
            icon={DoorOpen}
            title="Tenancy unavailable"
            description="This tenancy could not be loaded for the selected property."
          />
        ) : (
          <>
            <ExitInfoPanel
              message={currentBillMessage}
              title={currentBillTitle}
              tone={currentBillTone}
            />

            {/* Sits with the dues gate rather than beside the section that
                caused it: both answer the same question — why the button at the
                bottom will not move — so they belong in one place the actor
                reads before scrolling, not scattered down the page. */}
            {blockingMessage && duesCleared ? (
              <NoticeBar message={blockingMessage} title="Action needed" tone="warning" />
            ) : null}

            {showsExitCharge ? (
              <Card>
                <StepLabel
                  index={stepOf("earlyExit")}
                  of={stepCount}
                  title={isEarlyExit ? "Leaving early" : "Leaving without notice"}
                />
                {/* A stay ending before its term or before notice is the whole
                    reason this section exists, and it changes what the owner is
                    entitled to charge. Set as a plain caption it read as a
                    footnote to the heading; it is a warning. */}
                <ExitInfoPanel
                  message={
                    isEarlyExit
                      ? tenancy.agreementEndDate
                        ? `The agreement runs to ${formatDate(tenancy.agreementEndDate)}.`
                        : "The agreement has a fixed term."
                      : "This stay is open-ended and is ending before notice was served."
                  }
                  title={isEarlyExit ? "Ending before the term" : "Ending without notice"}
                  tone="warning"
                />

                {governingRule ? (
                  <ExitInfoPanel
                    emphasis="message"
                    message={governingRule}
                    onInfo={() => setRuleInfoOpen(true)}
                    title={isEarlyExit ? "Early exit policy" : "Premature exit policy"}
                    tone="info"
                  />
                ) : (
                  <ExitInfoPanel
                    message={
                      isEarlyExit
                      ? "No early-exit rule was written into this agreement, so nothing is owed unless you charge it here."
                      : "No premature exit policy is set for this property, so nothing is owed unless you charge it here."
                    }
                    title="No policy configured"
                    tone="info"
                  />
                )}

                <SectionDivider />

                <FormInput
                  keyboardType="number-pad"
                  label="Charge"
                  onChangeText={(text) => {
                    setEarlyExitRupees(text);
                    // The confirmation named a figure. Change the figure and
                    // that agreement no longer covers what would happen, so it
                    // is withdrawn rather than carried over silently.
                    setEarlyExitInstrument(null);
                    setSplitDepositPaise(null);
                  }}
                  placeholder="0"
                  prefix="₹"
                  value={earlyExitRupees}
                />
                {/* <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  Nothing is calculated automatically, enter what the set rule works out to, or leave it empty to charge nothing.
                </Text> */}
                <InlineInfoText
                  message={"Nothing is calculated automatically, enter what the set rule works out to, or leave it empty to charge nothing."}
                />
                <ExitChoiceRow
                  disabled={earlyExitPaise <= 0}
                  label="Collect charges from"
                  onChange={(next) => {
                    // Selecting an instrument is a decision about someone's
                    // money, so it is confirmed before it sticks rather than
                    // toggled by a stray tap.
                    if (next === "DEPOSIT" && (depositUnavailable || depositCollectionBlocked)) {
                      opErrors.failFromServer(
                        depositCollectionBlocked
                          ? "Mark the deposit refundable before using it for charges."
                          : "There is no deposit to charge against.",
                      );
                      return;
                    }
                    setPendingInstrument(next);
                    setSplitDepositPaise(null);
                    setInstrumentPreviewOpen(true);
                  }}
                  options={INSTRUMENT_OPTIONS.map((option) => ({
                    ...option,
                    disabled: option.value === "DEPOSIT" && depositCollectionBlocked,
                  }))}
                  value={earlyExitInstrument}
                />
                {earlyExitCharges.length === 0 ? (
                  earlyExitPaise <= 0
                        ? <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>Enter a charge above to choose how it is collected</Text>
                        : <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>Choose how this charge is collected.</Text>
                ) : (
                  /* Rendered from the same list the payload is built from, so a
                     split charge shows as the two lines it actually becomes
                     rather than as one that quietly means two. */
                  <View style={{ gap: spacing.sm }}>
                    {earlyExitCharges.map((charge, index) => (
                      <View
                        key={`${charge.instrument}-${index}`}
                        style={{
                          alignItems: "center",
                          backgroundColor: colors.surfaceSunken,
                          borderColor: colors.borderStrong,
                          borderCurve: "continuous",
                          borderRadius: 12,
                          borderWidth: 1,
                          flexDirection: "row",
                          gap: spacing.sm,
                          paddingHorizontal: 12,
                          paddingVertical: spacing.xs,
                        }}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[type.eyebrow, { color: colors.kicker }]}>
                            {charge.instrument === "DEPOSIT" ? "From deposit" : "One-off bill"}
                          </Text>
                          <Text selectable style={[type.body, { color: colors.ink, fontSize: 13, lineHeight: 19 }]}>
                            {charge.instrument === "DEPOSIT"
                              ? `${formatMoneyPaise(charge.amountPaise)} comes off the deposit`
                              : `${formatMoneyPaise(charge.amountPaise)} billed, collected by ${
                                  COLLECTION_METHODS.find((m) => m.value === charge.collectedVia)?.label ?? "cash"
                                }`}
                          </Text>
                        </View>
                        {index === 0 ? (
                          <AnimatedPressable
                            accessibilityLabel="Remove this charge"
                            accessibilityRole="button"
                            hitSlop={10}
                            onPress={() => {
                              setEarlyExitInstrument(null);
                              setSplitDepositPaise(null);
                            }}
                          >
                            <Text style={[type.caption, { color: colors.danger }]}>
                              Remove
                            </Text>
                          </AnimatedPressable>
                        ) : null}
                      </View>
                    ))}
                    {splitDepositPaise != null ? (
                      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                        Split because the charge is larger than the deposit. Remove to start over.
                      </Text>
                    ) : null}
                  </View>
                )}
              </Card>
            ) : null}

            {!isDaily ? (
              <Card>
                <StepLabel index={stepOf("deposit")} of={stepCount} title="Deposit" />
                {!deposit ? (
                  <ExitInfoPanel
                    message="This tenancy has no deposit account, so there is nothing to settle."
                    title="No deposit account"
                    tone="info"
                  />
                ) : (
                  <>
                    <View
                      style={{
                        backgroundColor: colors.primarySoft,
                        borderColor: colors.border,
                        borderCurve: "continuous",
                        borderRadius: 14,
                        borderWidth: 1,
                        gap: 4,
                        padding: 12,
                      }}
                    >
                      <Text style={[type.eyebrow, { color: colors.muted }]}>Current balance</Text>
                      <Text selectable style={[type.metric, { color: colors.ink, fontSize: 23, lineHeight: 28 }]}>
                        {formatMoneyPaise(depositBalancePaise)}
                      </Text>
                    </View>

                    {/* The payability question is asked of the remainder, so the
                        remainder is the figure shown large. The workings stay
                        visible underneath: an actor deciding whether to refund
                        needs to see what reduced it, not just the result. */}
                    {depositDemandPaise > 0 ? (
                      <View
                        style={{
                          borderColor: colors.border,
                          borderCurve: "continuous",
                          borderRadius: 14,
                          borderWidth: 1,
                          gap: spacing.xs,
                          padding: 12,
                        }}
                      >
                        <Row label="Deposit held" value={formatMoneyPaise(depositBalancePaise)} />
                        {earlyExitInstrument === "DEPOSIT" && earlyExitPaise > 0 ? (
                          <Row label="Early exit charge" value={`− ${formatMoneyPaise(earlyExitPaise)}`} />
                        ) : null}
                        {damageInstrument === "DEPOSIT" && damageTotalPaise > 0 ? (
                          <Row label="Damage charges" value={`− ${formatMoneyPaise(damageTotalPaise)}`} />
                        ) : null}
                      </View>
                    ) : null}

                    <SectionDivider />

                    <ExitChoiceRow
                      label="Settle remaining deposit as"
                      onChange={(value) => {
                        const refundable = value === "REFUND";
                        setDepositPayable(refundable);
                        if (!refundable) {
                          setEarlyExitInstrument((current) => current === "DEPOSIT" ? null : current);
                          setDamageInstrument((current) => current === "DEPOSIT" ? null : current);
                          setPendingInstrument(null);
                          setPendingDamageInstrument(null);
                          setSplitDepositPaise(null);
                          setInstrumentPreviewOpen(false);
                          setDamagePreviewOpen(false);
                        }
                      }}
                      options={[
                        { label: "Refundable", value: "REFUND" },
                        { label: "Not refundable", value: "FORFEIT" },
                      ]}
                      value={depositPayable ? "REFUND" : "FORFEIT"}
                    />
                    <InlineInfoText
                      message={
                        depositPayable
                          ? `${formatMoneyPaise(Math.max(depositBalancePaise - depositDemandPaise, 0))} is returned when you settle the deposit.`
                          : "Nothing is returned. A deposit you are keeping cannot also be deducted from."
                      }
                    />

                    {canManageDeposits ? (
                      <ActionButton
                        label="Open deposit manager"
                        onPress={() => setDepositSheetOpen(true)}
                        variant="outline"
                      />
                    ) : null}
                  </>
                )}
              </Card>
            ) : null}

            <Card>
              <StepLabel index={stepOf("damages")} of={stepCount} title="Damage charges" />
              <Text style={[type.bodyStrong, { color: colors.muted, fontSize: 13, lineHeight: 18 }]}>
                Select any damaged items
              </Text>
              {damageCharges.length === 0 ? (
                <ExitInfoPanel
                  message="This agreement set no damage-charge schedule, so nothing here is pre-agreed. Anything you charge must be evidenced at move-out."
                  title="No agreed damage charges"
                  tone="warning"
                />
              ) : (
                <View
                  style={{
                    borderColor: colors.border,
                    borderCurve: "continuous",
                    borderRadius: 14,
                    borderWidth: 1,
                    overflow: "hidden",
                  }}
                >
                  {damageCharges.map((item, index) => (
                    <DamageChargeRow
                      amount={formatMoneyPaise(item.chargePaise)}
                      checked={Boolean(damageSelected[item.name])}
                      key={item.name}
                      label={item.name}
                      last={index === damageCharges.length - 1}
                      onToggle={() =>
                        setDamageSelected((current) => ({ ...current, [item.name]: !current[item.name] }))
                      }
                    />
                  ))}
                </View>
              )}

              <Text style={[type.bodyStrong, { color: colors.muted, fontSize: 13, lineHeight: 18 }]}>
                Custom charges
              </Text>
              {customCharges.length > 0 ? (
                <View
                  style={{
                    borderColor: colors.border,
                    borderCurve: "continuous",
                    borderRadius: 14,
                    borderWidth: 1,
                    overflow: "hidden",
                  }}
                >
                  {customCharges.map((charge, index) => (
                    <View
                      key={`${charge.reason}-${index}`}
                      style={{
                        alignItems: "center",
                        borderBottomColor: colors.border,
                        borderBottomWidth: index === customCharges.length - 1 ? 0 : 1,
                        flexDirection: "row",
                        gap: spacing.sm,
                        minHeight: 48,
                        paddingHorizontal: 12,
                        paddingVertical: spacing.xs,
                      }}
                    >
                      <Text
                        selectable
                        style={[type.bodyStrong, { color: colors.ink, flex: 1, fontSize: 14, lineHeight: 19 }]}
                      >
                        {charge.reason}
                      </Text>
                      <Text selectable style={[type.bodyStrong, { color: colors.ink, fontSize: 14, lineHeight: 19 }]}>
                        {formatMoneyPaise(charge.amountPaise)}
                      </Text>
                      <AnimatedPressable
                        accessibilityLabel={`Remove ${charge.reason}`}
                        accessibilityRole="button"
                        hitSlop={10}
                        onPress={() => setCustomCharges((rows) => rows.filter((_, i) => i !== index))}
                      >
                        <Trash2 color={colors.danger} size={17} strokeWidth={2.2} />
                      </AnimatedPressable>
                    </View>
                  ))}
                </View>
              ) : null}

              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => setAddDamageOpen(true)}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                  borderCurve: "continuous",
                  borderRadius: 12,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: spacing.sm,
                  justifyContent: "center",
                  minHeight: 44,
                  paddingHorizontal: spacing.md,
                }}
              >
                <Plus color={colors.onPrimary} size={18} strokeWidth={2.2} />
                <Text style={[type.bodyStrong, { color: colors.onPrimary, fontSize: 14, lineHeight: 19 }]}>
                  Add custom damage charge
                </Text>
              </AnimatedPressable>

              <View
                style={{
                  alignItems: "center",
                  borderColor: colors.border,
                  borderCurve: "continuous",
                  borderRadius: 14,
                  borderWidth: 1,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  minHeight: 52,
                  paddingHorizontal: 12,
                  paddingVertical: spacing.sm,
                }}
              >
                <Text style={[type.bodyStrong, { color: colors.muted, fontSize: 13, lineHeight: 18 }]}>Total</Text>
                <Text selectable style={[type.metric, { color: colors.ink, fontSize: 20, lineHeight: 25 }]}>
                  {formatMoneyPaise(damageTotalPaise)}
                </Text>
              </View>

              <ExitChoiceRow
                disabled={damageTotalPaise <= 0}
                label="Collect charges from"
                onChange={(next) => {
                  if (next === "DEPOSIT" && (depositUnavailable || depositCollectionBlocked)) {
                    opErrors.failFromServer(
                      depositCollectionBlocked
                        ? "Mark the deposit refundable before using it for charges."
                        : "There is no deposit left to charge against.",
                    );
                    return;
                  }
                  setPendingDamageInstrument(next);
                  setDamagePreviewOpen(true);
                }}
                options={INSTRUMENT_OPTIONS.map((option) => ({
                  ...option,
                  disabled: option.value === "DEPOSIT" && depositCollectionBlocked,
                }))}
                value={damageInstrument}
              />

              {damageTotalPaise > 0 ? (
                <InlineInfoText
                  message={
                    damageInstrument == null && depositUnavailable
                      ? "No deposit is available, so these must be collected as a bill."
                      : "Choose how these charges are collected."
                  }
                />
              ) : null}

              {damageInstrument != null ? (
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.surfaceSunken,
                    borderColor: colors.border,
                    borderCurve: "continuous",
                    borderRadius: 12,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: spacing.sm,
                    paddingHorizontal: 12,
                    paddingVertical: spacing.xs,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.eyebrow, { color: colors.kicker }]}>
                      {damageInstrument === "DEPOSIT" ? "From deposit" : "One-off bill"}
                    </Text>
                    <Text selectable style={[type.body, { color: colors.ink, fontSize: 13, lineHeight: 19 }]}>
                      {damageInstrument === "DEPOSIT"
                        ? `${formatMoneyPaise(damageTotalPaise)} comes off the deposit`
                        : billedEarlyExitPaise > 0
                          ? `${formatMoneyPaise(damageTotalPaise)} added to the same bill`
                          : `${formatMoneyPaise(damageTotalPaise)} billed, recorded paid`}
                    </Text>
                  </View>
                  <AnimatedPressable
                    accessibilityLabel="Remove damage charge collection"
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={() => setDamageInstrument(null)}
                  >
                    <Text style={[type.caption, { color: colors.danger }]}>Remove</Text>
                  </AnimatedPressable>
                </View>
              ) : null}
            </Card>

            {/* Unnumbered, like the checklist below it — the numbered steps are
                the decisions that move money, and this only records one that
                has already been made. */}
            {collectsMoney ? (
              <Card>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>
                  Collection proof
                </Text>
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  Attach a photo of the payment you collect at move-out.
                </Text>
                <SingleImageField
                  attachedLabel="Proof attached"
                  label="Photo (optional)"
                  onChange={setProofImageUrl}
                  target="PAYMENT_PROOF"
                  url={proofImageUrl}
                />
              </Card>
            ) : null}

            <Card>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Move-out checklist
              </Text>
              {checklist.length === 0 ? (
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  No checklist configured for this property. Add items under exit policies.
                </Text>
              ) : (
                <>
                  {checklist.map((item, index) => (
                    <CheckRow
                      key={`${item}-${index}`}
                      checked={Boolean(checked[index])}
                      label={item}
                      onToggle={() => setChecked((current) => ({ ...current, [index]: !current[index] }))}
                    />
                  ))}
                  <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                    Recorded as your assessment. It does not hold up the exit.
                  </Text>
                </>
              )}
            </Card>
          </>
        )}
      </ScreenScrollView>

      {tenancy ? (
        <PinnedFooter>
          <ActionButton
            disabled={endState.isLoading || Boolean(blockingMessage)}
            label={endState.isLoading ? "Ending..." : "End tenancy"}
            onPress={() => void end()}
            variant="danger"
          />
        </PinnedFooter>
      ) : null}

      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}

      {instrumentPreviewOpen && pendingInstrument === "DEPOSIT" ? (
        <DepositDeductionSheet
          balancePaise={depositBalancePaise}
          chargePaise={earlyExitPaise}
          onCancel={() => {
            setInstrumentPreviewOpen(false);
            setPendingInstrument(null);
          }}
          onContinue={() => setInstrumentPreviewOpen(false)}
          onSplit={(fromDepositPaise) => {
            setSplitDepositPaise(fromDepositPaise);
            setInstrumentPreviewOpen(false);
          }}
        />
      ) : null}

      {instrumentPreviewOpen && pendingInstrument === "ONE_OFF_BILL" ? (
        <BillPreviewSheet
          amountPaise={earlyExitPaise}
          method={collectedVia}
          onCancel={() => {
            setInstrumentPreviewOpen(false);
            setPendingInstrument(null);
          }}
          onChangeMethod={setCollectedVia}
          onContinue={() => setInstrumentPreviewOpen(false)}
          tenantName={tenancy?.tenantName?.trim() || "the tenant"}
        />
      ) : null}

      {pendingInstrument === "DEPOSIT" && !instrumentPreviewOpen ? (
        <ConfirmDialog
          bullets={
            splitDepositPaise != null
              ? [
                  `${formatMoneyPaise(splitDepositPaise)} comes off the deposit, leaving ${formatMoneyPaise(0)}.`,
                  `${formatMoneyPaise(earlyExitPaise - splitDepositPaise)} is billed and recorded paid — collect it at move-out.`,
                ]
              : [
                  `${formatMoneyPaise(earlyExitPaise)} comes off the deposit when the tenancy ends.`,
                  `${formatMoneyPaise(Math.max(depositBalancePaise - earlyExitPaise, 0))} would remain before any damage charges.`,
                ]
          }
          confirmLabel={splitDepositPaise != null ? "Split charge" : "Deduct from deposit"}
          footnote="Nothing moves until you end the tenancy."
          message={
            splitDepositPaise != null
              ? "The charge is larger than the deposit, so it is split across both."
              : "The early exit charge will be taken from this tenant's deposit."
          }
          onCancel={() => {
            setPendingInstrument(null);
            setSplitDepositPaise(null);
          }}
          onConfirm={() => {
            setEarlyExitInstrument("DEPOSIT");
            setPendingInstrument(null);
          }}
          title={splitDepositPaise != null ? "Split this charge?" : "Deduct from deposit?"}
        />
      ) : null}

      {pendingInstrument === "ONE_OFF_BILL" && !instrumentPreviewOpen ? (
        <ConfirmDialog
          bullets={[
            `A one-off bill of ${formatMoneyPaise(earlyExitPaise)} is raised against this tenancy.`,
            "It is recorded as paid, because the money is collected at move-out.",
          ]}
          confirmLabel="Create bill"
          footnote="Nothing is created until you end the tenancy."
          message="The early exit charge will be billed instead of taken from the deposit."
          onCancel={() => setPendingInstrument(null)}
          onConfirm={() => {
            setEarlyExitInstrument("ONE_OFF_BILL");
            setPendingInstrument(null);
          }}
          title="Create a one-off bill?"
        />
      ) : null}

      {damagePreviewOpen && pendingDamageInstrument === "DEPOSIT" ? (
        <DepositDeductionSheet
          balancePaise={Math.max(depositBalancePaise - earlyExitFromDepositPaise, 0)}
          chargePaise={damageTotalPaise}
          label="Damage charges"
          onCancel={() => {
            setDamagePreviewOpen(false);
            setPendingDamageInstrument(null);
          }}
          onContinue={() => setDamagePreviewOpen(false)}
          onSplit={null}
        />
      ) : null}

      {damagePreviewOpen && pendingDamageInstrument === "ONE_OFF_BILL" ? (
        <BillPreviewSheet
          amountPaise={damageTotalPaise}
          existingBillPaise={billedEarlyExitPaise}
          method={collectedVia}
          onCancel={() => {
            setDamagePreviewOpen(false);
            setPendingDamageInstrument(null);
          }}
          onChangeMethod={setCollectedVia}
          onContinue={() => setDamagePreviewOpen(false)}
          reason="Damage charges"
          tenantName={tenancy?.tenantName?.trim() || "the tenant"}
        />
      ) : null}

      {pendingDamageInstrument != null && !damagePreviewOpen ? (
        <ConfirmDialog
          bullets={
            pendingDamageInstrument === "DEPOSIT"
              ? [
                  `${formatMoneyPaise(damageTotalPaise)} comes off the deposit when the tenancy ends.`,
                  `${formatMoneyPaise(Math.max(depositBalancePaise - earlyExitFromDepositPaise - damageTotalPaise, 0))} would remain.`,
                ]
              : billedEarlyExitPaise > 0
                ? [
                    `${formatMoneyPaise(damageTotalPaise)} is added to the existing one-off bill.`,
                    `That bill becomes ${formatMoneyPaise(billedEarlyExitPaise + damageTotalPaise)}, recorded paid.`,
                  ]
                : [
                    `A one-off bill of ${formatMoneyPaise(damageTotalPaise)} is raised against this tenancy.`,
                    "It is recorded as paid, because the money is collected at move-out.",
                  ]
          }
          confirmLabel={pendingDamageInstrument === "DEPOSIT" ? "Deduct from deposit" : "Add to bill"}
          footnote="Nothing moves until you end the tenancy."
          message="How the damage charges assessed above are collected."
          onCancel={() => setPendingDamageInstrument(null)}
          onConfirm={() => {
            setDamageInstrument(pendingDamageInstrument);
            setPendingDamageInstrument(null);
          }}
          title={pendingDamageInstrument === "DEPOSIT" ? "Deduct from deposit?" : "Collect as a bill?"}
        />
      ) : null}

      {addDamageOpen ? (
        <AddDamageChargeSheet
          onAdd={(charge) => {
            setCustomCharges((rows) => [...rows, charge]);
            setAddDamageOpen(false);
          }}
          onCancel={() => setAddDamageOpen(false)}
        />
      ) : null}

      {ruleInfoOpen ? (
        <ConfirmDialog
          acknowledgeOnly
          confirmLabel="Got it"
          footnote="Please act according to the agreement rule."
          message={
            isEarlyExit
              ? "This is the rule as accepted with the tenant when the agreement was signed. It may differ from any later changes to your agreement settings, which apply only to agreements issued after them."
              : "This is the property's current premature exit policy, shown in open-ended agreements."
          }
          onCancel={() => setRuleInfoOpen(false)}
          onConfirm={() => setRuleInfoOpen(false)}
          title={isEarlyExit ? "About this rule" : "About this policy"}
        />
      ) : null}

      {depositSheetOpen && deposit ? (
        <DepositSheet
          deposit={deposit}
          onClose={() => setDepositSheetOpen(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * What the early-exit charge does to the deposit, before it is agreed to.
 *
 * <p>Shown as its own step rather than folded into the confirmation, because
 * the number that matters — what is left afterwards — is the one the actor is
 * about to answer a payability question about.
 */
function DepositDeductionSheet({
  balancePaise,
  chargePaise,
  label = "Early exit charge",
  onCancel,
  onContinue,
  onSplit,
}: {
  balancePaise: number;
  chargePaise: number;
  label?: string;
  onCancel: () => void;
  onContinue: () => void;
  /** Take what the deposit covers and bill the rest. Null where no split applies. */
  onSplit: ((fromDepositPaise: number) => void) | null;
}) {
  const { colors, type } = useTheme();
  const remaining = balancePaise - chargePaise;
  const short = remaining < 0;
  const shortfall = Math.abs(remaining);

  return (
    <SheetShell animated onClose={onCancel} title="Deduct from deposit">
      <Row label="Deposit held" value={formatMoneyPaise(balancePaise)} />
      <Row label={label} value={`− ${formatMoneyPaise(chargePaise)}`} />
      <View style={{ backgroundColor: colors.border, height: 1 }} />
      <Row
        label={short ? "Short by" : "Remaining"}
        strong
        tone={short ? colors.danger : colors.ink}
        value={formatMoneyPaise(shortfall)}
      />

      {short ? (
        <>
          <Text style={[type.caption, { color: colors.danger, lineHeight: 18 }]}>
            The deposit does not cover this charge on its own.
          </Text>
          {/* Splitting keeps the deposit doing the work it can, instead of
              forcing an all-or-nothing choice that makes the actor round the
              figure or abandon the deposit entirely. */}
          <View style={{ borderColor: colors.borderStrong, borderWidth: 1, gap: spacing.xs, padding: spacing.md }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              Split it
            </Text>
            <Row label="From deposit" value={formatMoneyPaise(balancePaise)} />
            <Row label="Collected as a bill" value={formatMoneyPaise(shortfall)} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ActionButton label="Cancel" onPress={onCancel} variant="secondary" />
            </View>
            <View style={{ flex: 1 }}>
              <ActionButton
                disabled={onSplit == null}
                label={onSplit == null ? "Not enough deposit" : "Split charge"}
                onPress={() => onSplit?.(balancePaise)}
              />
            </View>
          </View>
        </>
      ) : (
        <>
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
            Damage charges below are taken from what is left.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ActionButton label="Cancel" onPress={onCancel} variant="secondary" />
            </View>
            <View style={{ flex: 1 }}>
              <ActionButton label="Continue" onPress={onContinue} />
            </View>
          </View>
        </>
      )}
    </SheetShell>
  );
}

/** The existing Deposit Manager account UI, presented read-only during exit setup. */
function DepositSheet({ deposit, onClose }: { deposit: DepositAccount; onClose: () => void }) {
  return (
    <SheetShell animated onClose={onClose} title="Deposit account">
      <DepositAccountDetail busy={false} canManage deposit={deposit} />
    </SheetShell>
  );
}

/**
 * What raising a one-off bill will produce, before it is agreed to.
 *
 * <p>The deposit path shows its arithmetic, so this one does too. A charge is
 * the same decision either way and should not feel lighter because it happens
 * to leave the deposit alone.
 */
function BillPreviewSheet({
  amountPaise,
  existingBillPaise = 0,
  method,
  onCancel,
  onChangeMethod,
  onContinue,
  reason = "Early exit charge",
  tenantName,
}: {
  amountPaise: number;
  /** Already going onto this exit's bill, so this charge joins it. */
  existingBillPaise?: number;
  method: ExitCollectionMethod;
  onCancel: () => void;
  onChangeMethod: (method: ExitCollectionMethod) => void;
  onContinue: () => void;
  reason?: string;
  tenantName: string;
}) {
  const { colors } = useTheme();

  return (
    <SheetShell animated onClose={onCancel} title="One-off bill">
      <Row label="Billed to" value={tenantName} />
      <Row label="Reason" value={reason} />
      <View style={{ backgroundColor: colors.border, height: 1 }} />
      {existingBillPaise > 0 ? (
        <>
          <Row label="Already on this bill" value={formatMoneyPaise(existingBillPaise)} />
          <Row label="This charge" value={`+ ${formatMoneyPaise(amountPaise)}`} />
          <View style={{ backgroundColor: colors.border, height: 1 }} />
          <Row label="Bill total" strong value={formatMoneyPaise(existingBillPaise + amountPaise)} />
        </>
      ) : (
        <Row label="Amount" strong value={formatMoneyPaise(amountPaise)} />
      )}

      {/* The same single-choice payment picker as Billing's Mark paid flow. */}
      <SingleOptionPicker<ExitCollectionMethod>
        centered
        emptyLabel="Select how it was paid"
        label="Payment method"
        onChange={onChangeMethod}
        options={PAYMENT_METHOD_OPTIONS}
        required
        showIcon={false}
        title="Payment method"
        value={method}
      />

      <NoticeBar
        message="This bill is recorded as already paid. Collect the money from the tenant during the exit — nothing will chase it afterwards."
        title="Collect this manually"
        tone="warning"
      />

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <ActionButton label="Cancel" onPress={onCancel} variant="secondary" />
        </View>
        <View style={{ flex: 1 }}>
          <ActionButton label="Continue" onPress={onContinue} />
        </View>
      </View>
    </SheetShell>
  );
}

/** Adds a damage charge the property's schedule does not cover. */
function AddDamageChargeSheet({
  onAdd,
  onCancel,
}: {
  onAdd: (charge: ExitCustomCharge) => void;
  onCancel: () => void;
}) {
  const { colors, type } = useTheme();
  const [item, setItem] = useState("");
  const [rupees, setRupees] = useState("");
  const form = useFormErrors<"item" | "rupees">();
  const amountPaise = rupeesToPaise(rupees) ?? 0;

  function submit() {
    const cleared = form.validate({
      ...(item.trim() ? {} : { item: "Name what was damaged." }),
      ...(amountPaise > 0 ? {} : { rupees: "Enter an amount greater than zero." }),
    });
    if (!cleared) {
      return;
    }
    onAdd({ amountPaise, reason: item.trim() });
  }

  return (
    <SheetShell animated onClose={onCancel} title="Add damage charge">
      <FormInput
        error={form.errors.item}
        label="Item"
        onChangeText={(text) => {
          setItem(text);
          form.clearField("item");
        }}
        placeholder="e.g. Repainting"
        required
        value={item}
      />
      <FormInput
        error={form.errors.rupees}
        keyboardType="number-pad"
        label="Price"
        onChangeText={(text) => {
          setRupees(text);
          form.clearField("rupees");
        }}
        placeholder="0"
        prefix="₹"
        required
        value={rupees}
      />

      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        Not pre-agreed in the agreement, so keep evidence of it.
      </Text>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <ActionButton label="Cancel" onPress={onCancel} variant="secondary" />
        </View>
        <View style={{ flex: 1 }}>
          <ActionButton disabled={form.blocked} label="Add charge" onPress={submit} />
        </View>
      </View>
    </SheetShell>
  );
}

function Row({
  label,
  strong,
  tone,
  value,
}: {
  label: string;
  strong?: boolean;
  tone?: string;
  value: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, fontSize: 13, lineHeight: 19 }]}>
        {label}
      </Text>
      <Text
        selectable
        style={[strong ? type.bodyStrong : type.body, { color: tone ?? colors.ink, fontSize: 13, lineHeight: 19 }]}
      >
        {value}
      </Text>
    </View>
  );
}

function SectionDivider() {
  const { colors } = useTheme();
  return <View style={{ borderBottomColor: colors.border, borderBottomWidth: 1 }} />;
}

function InlineInfoText({ message }: { message: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderRadius: 999,
          height: 18,
          justifyContent: "center",
          width: 18,
        }}
      >
        <Info color={colors.muted} size={11} strokeWidth={2.4} />
      </View>
      <Text style={[type.caption, { color: colors.muted, flex: 1, lineHeight: 18 }]}>
        {message}
      </Text>
    </View>
  );
}

function ExitInfoPanel({
  emphasis = "title",
  message,
  onInfo,
  onTrailingInfo,
  trailingInfoLabel = "More information",
  title,
  tone,
}: {
  emphasis?: "message" | "title";
  message: string;
  onInfo?: () => void;
  onTrailingInfo?: () => void;
  trailingInfoLabel?: string;
  title: string;
  tone: "danger" | "info" | "success" | "warning";
}) {
  const { colors, type } = useTheme();
  const warning = tone === "warning";
  const danger = tone === "danger";
  const success = tone === "success";
  const panelBackground = danger
    ? colors.dangerSoft
    : success
      ? colors.successSoft
      : warning
        ? colors.warningSoft
        : colors.primarySoft;
  const iconBadge = (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: danger
          ? colors.danger
          : success
            ? colors.successText
            : warning
              ? "transparent"
              : colors.surface,
        borderRadius: 999,
        height: danger ? 28 : 34,
        justifyContent: "center",
        width: danger ? 28 : 34,
      }}
    >
      {danger ? (
        <Text style={[type.bodyStrong, { color: colors.onPrimary, fontSize: 16, lineHeight: 18 }]}>!</Text>
      ) : success ? (
        <Check color={colors.onPrimary} size={19} strokeWidth={3} />
      ) : warning ? (
        <AlertTriangle color={colors.onPrimary} fill={colors.warning} size={28} strokeWidth={2.2} />
      ) : (
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <Shield color={colors.primaryDeep} fill={colors.primaryDeep} size={23} strokeWidth={2.2} />
          <Text
            style={{
              color: colors.onPrimary,
              fontSize: 12,
              fontWeight: "900",
              lineHeight: 14,
              position: "absolute",
            }}
          >
            i
          </Text>
        </View>
      )}
    </View>
  );
  return (
    <View
      style={{
        backgroundColor: panelBackground,
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 0,
        flexDirection: "row",
        gap: spacing.sm,
        padding: 12,
      }}
    >
      {onInfo ? (
        <AnimatedPressable
          accessibilityLabel="About this policy"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onInfo}
        >
          {iconBadge}
        </AnimatedPressable>
      ) : iconBadge}
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={[
            emphasis === "message" ? type.eyebrow : type.bodyStrong,
            {
              color: emphasis === "message" ? colors.primaryDeep : colors.ink,
              fontSize: emphasis === "message" ? 10 : 15,
              lineHeight: emphasis === "message" ? 14 : 20,
            },
          ]}
        >
          {title}
        </Text>
        <Text
          selectable
          style={[
            emphasis === "message" ? type.bodyStrong : type.body,
            {
              color: emphasis === "message" ? colors.ink : colors.muted,
              fontSize: emphasis === "message" ? 15 : 13,
              lineHeight: emphasis === "message" ? 21 : 19,
            },
          ]}
        >
          {message}
        </Text>
      </View>
      {onTrailingInfo ? (
        <AnimatedPressable
          accessibilityLabel={trailingInfoLabel}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onTrailingInfo}
          style={{
            alignItems: "center",
            alignSelf: "flex-start",
            backgroundColor: colors.surfaceSunken,
            borderRadius: 999,
            height: 28,
            justifyContent: "center",
            width: 28,
          }}
        >
          <Info color={colors.muted} size={16} strokeWidth={2.2} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

function ExitChoiceRow<T extends string>({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: T) => void;
  options: readonly { disabled?: boolean; label: string; value: T }[];
  value: T | null;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        style={[type.bodyStrong, { color: disabled ? colors.kicker : colors.ink, fontSize: 13, lineHeight: 18 }]}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        {options.map((option) => {
          const selected = option.value === value;
          const optionDisabled = Boolean(disabled || option.disabled);
          return (
            <AnimatedPressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: optionDisabled }}
              disabled={optionDisabled}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={{
                alignItems: "center",
                backgroundColor: selected ? colors.primarySoft : colors.surface,
                borderColor: colors.borderStrong,
                borderCurve: "continuous",
                borderRadius: 12,
                borderWidth: 1,
                flex: 1,
                flexDirection: "row",
                gap: spacing.xs,
                minHeight: 50,
                opacity: optionDisabled ? 0.45 : 1,
                paddingHorizontal: spacing.sm,
              }}
            >
              <View
                style={{
                  alignItems: "center",
                  borderColor: selected ? colors.primary : colors.borderStrong,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  height: 20,
                  justifyContent: "center",
                  width: 20,
                }}
              >
                {selected ? (
                  <View style={{ backgroundColor: colors.primary, borderRadius: 999, height: 10, width: 10 }} />
                ) : null}
              </View>
              <Text
                numberOfLines={2}
                style={[
                  type.bodyStrong,
                  { color: optionDisabled ? colors.kicker : colors.ink, flex: 1, fontSize: 13, lineHeight: 18 },
                ]}
              >
                {option.label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

function DamageChargeRow({
  amount,
  checked,
  label,
  last,
  onToggle,
}: {
  amount: string;
  checked: boolean;
  label: string;
  last: boolean;
  onToggle: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={{
        alignItems: "center",
        borderBottomColor: colors.border,
        borderBottomWidth: last ? 0 : 1,
        flexDirection: "row",
        gap: spacing.sm,
        minHeight: 48,
        paddingHorizontal: 12,
        paddingVertical: spacing.xs,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: checked ? colors.primary : "transparent",
          borderColor: checked ? colors.primary : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 5,
          borderWidth: 1.25,
          height: 20,
          justifyContent: "center",
          width: 20,
        }}
      >
        {checked ? <Check color={colors.onPrimary} size={13} strokeWidth={3} /> : null}
      </View>
      <Text style={[type.bodyStrong, { color: colors.ink, flex: 1, fontSize: 14, lineHeight: 19 }]}>{label}</Text>
      <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 14, lineHeight: 19 }]}>{amount}</Text>
    </AnimatedPressable>
  );
}

function StepLabel({ index, of, title }: { index: number; of: number; title: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        {index} OF {of}
      </Text>
      <Text style={[type.metric, { color: colors.ink, fontSize: 21, lineHeight: 26 }]}>
        {title}
      </Text>
    </View>
  );
}

function CheckRow({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: checked ? colors.primary : "transparent",
          borderColor: checked ? colors.primary : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 6,
          borderWidth: 1.5,
          height: 22,
          justifyContent: "center",
          width: 22,
        }}
      >
        {checked ? <Check color={colors.onPrimary} size={14} strokeWidth={3} /> : null}
      </View>
      <Text style={[type.body, { color: colors.ink, flex: 1 }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
