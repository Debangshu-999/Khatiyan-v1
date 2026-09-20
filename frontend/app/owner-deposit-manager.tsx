import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, Image, Modal, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { AlertTriangle, CalendarDays, ChevronRight, ChevronUp, Clock, History, Landmark, Minus, Plus, UserRound, Wallet } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import {
  OwnerDataCardSkeleton,
  OwnerDepositOverviewSkeleton,
} from "@/components/skeletons/owner";
import { AlertModal } from "@/components/alert-modal";
import { FieldError } from "@/components/field-error";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAvailableAccounts } from "@/features/account/accounts";
import { DepositAccountDetail, DepositAccountHeader, DepositAccountTenantCard } from "@/features/billing/deposit-account-ui";
import {
  ActionButton,
  ConfirmDialog,
  FormInput,
  NoticeBar,
  formatMoneyPaise,
  humanizeToken,
  rupeesToPaise,
  shortId,
  ViewOnlyChip,
} from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  useAddDepositCorrectionMutation,
  useDeductDepositCorrectionMutation,
  useGetManagedTenancyDepositQuery,
  useListPropertyDepositsQuery,
  useCloseDepositUnpaidMutation,
  useSettleManagedDepositMutation,
} from "@/store/services/billing-api";
import type { TenancyStatus, TenancySummary } from "@/store/services/tenancy-api";
import { tenancyStatusLabel, useListPropertyTenanciesQuery } from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { PropertyArtwork } from "@/components/artwork-icon";
import { DepositHistoryArtwork } from "@/features/billing/deposit-account-ui";

type CorrectionMode = "add" | "deduct";

const ACTIVE_STATUSES: TenancyStatus[] = ["ACTIVE", "ON_NOTICE", "ON_PREMATURE_NOTICE"];
const DEPOSIT_HEADER_ILLUSTRATION = require("../assets/workspace/deposit-header.png");

export default function OwnerDepositManagerScreen() {
  const router = useGuardedRouter();
  const { tenancyId: tenancyIdParam } = useLocalSearchParams<{ tenancyId?: string }>();
  const { colors, type } = useTheme();
  const toast = useToast();
  // Settlement executes a decision made at end-tenancy — a refusal here is the
  // server declining, with nothing on screen to correct.
  const settleErrors = useFormErrors<never>();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  // VIEW sees the ledger and every movement; MANAGE adds corrections and
  // settlement.
  const { canManage: canManageResource } = usePropertyPermissions(propertyId);
  const canManageDeposits = canManageResource("DEPOSITS");

  const tenanciesQuery = useListPropertyTenanciesQuery({ includePast: true, propertyId }, { skip: !propertyId });
  const tenancies = useMemo(() => tenanciesQuery.data ?? [], [tenanciesQuery.data]);
  const tenancyById = useMemo(() => new Map(tenancies.map((tenancy) => [tenancy.id, tenancy])), [tenancies]);
  const activeTenancies = useMemo(
    () => tenancies.filter((tenancy) => ACTIVE_STATUSES.includes(tenancy.status) && tenancy.billingType === "MONTHLY"),
    [tenancies],
  );

  const [selectedTenancyId, setSelectedTenancyId] = useState<string | null>(
    typeof tenancyIdParam === "string" ? tenancyIdParam : null,
  );
  const [pickerOpen, setPickerOpen] = useState(!tenancyIdParam);
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const selectedTenancy = selectedTenancyId ? tenancyById.get(selectedTenancyId) ?? null : null;

  const depositQuery = useGetManagedTenancyDepositQuery(selectedTenancyId ?? "", { skip: !selectedTenancyId });
  const deposit = depositQuery.data;

  // Deposits waiting to be settled. The action centre already counts these; the
  // screen that settles them showed no sign they existed, so the badge sent you
  // somewhere that looked empty.
  const pendingQuery = useListPropertyDepositsQuery(
    { propertyId, size: 50, status: "PENDING_SETTLEMENT" },
    { skip: !propertyId || Boolean(selectedTenancyId) },
  );
  const pendingDeposits = pendingQuery.data?.items ?? [];
  const pendingTotalPaise = pendingDeposits.reduce((sum, account) => sum + account.currentBalancePaise, 0);

  const [correctionMode, setCorrectionMode] = useState<CorrectionMode | null>(null);
  const [addCorrection, addState] = useAddDepositCorrectionMutation();
  const [deductCorrection, deductState] = useDeductDepositCorrectionMutation();
  const [settleDeposit, settleState] = useSettleManagedDepositMutation();
  const [closeUnpaid, closeState] = useCloseDepositUnpaidMutation();

  // Opening an account swaps this screen's content rather than pushing a
  // route, so "back" has two meanings here. Both the header arrow and the
  // device button run this: close the account first, leave only when nothing
  // is open. Without the hardware handler the phone button unmounted the whole
  // screen and landed on home.
  const goBack = useCallback(() => {
    if (selectedTenancyId) {
      setSelectedTenancyId(null);
      setPickerOpen(true);
      return true;
    }
    router.back();
    return true;
  }, [router, selectedTenancyId]);

  // Focus-scoped, not a plain effect. Expo Router keeps screens mounted, so an
  // unscoped listener stays registered after you navigate away and then eats
  // the back press on whatever screen you are actually looking at.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", goBack);
      return () => subscription.remove();
    }, [goBack]),
  );

  /**
   * Follows the route param when this screen is REUSED rather than mounted.
   *
   * <p>
   * The deposit history navigates back to this screen with a tenancyId instead
   * of pushing a second copy of it, so the param can change while the screen
   * stays mounted — and `useState`'s initial value is read exactly once. Without
   * this, opening an account from history returned to the picker with nothing
   * selected.
   */
  useEffect(() => {
    if (typeof tenancyIdParam === "string" && tenancyIdParam) {
      setSelectedTenancyId(tenancyIdParam);
      setPickerOpen(false);
    }
  }, [tenancyIdParam]);

  function chooseTenancy(tenancyId: string) {
    setSelectedTenancyId(tenancyId);
    setPickerOpen(false);
  }

  async function submitCorrection(amountPaise: number, reason: string) {
    if (!selectedTenancyId) {
      return;
    }
    const payload = { amountPaise, reason, tenancyId: selectedTenancyId };
    if (correctionMode === "add") {
      await addCorrection(payload).unwrap();
    } else {
      await deductCorrection(payload).unwrap();
    }
    setCorrectionMode(null);
  }

  // Executes the decision recorded at end-tenancy — it never makes one. Which
  // of the two actions is even offered is chosen by payableAtExit, so there is
  // no path here that can contradict what was agreed at move-out.
  const payable = deposit?.payableAtExit ?? null;

  async function submitSettlement() {
    if (!selectedTenancyId || payable == null) {
      return;
    }
    try {
      if (payable) {
        await settleDeposit({ reason: "Deposit settled at exit", tenancyId: selectedTenancyId }).unwrap();
        toast.success("Deposit settled.");
      } else {
        await closeUnpaid({ reason: "Deposit forfeited at exit", tenancyId: selectedTenancyId }).unwrap();
        toast.success("Deposit account closed.");
      }
      setSettleModalOpen(false);
    } catch (error) {
      settleErrors.failFromServer(settleErrorMessage(error));
    }
  }

  return (
    <ScreenScrollView
      background={
        <View style={{ backgroundColor: colors.surface, flex: 1 }}>
          <LinearGradient
            colors={[selectedTenancy ? colors.surface : "#F1F7FF", colors.surface]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ height: 420 }}
          />
        </View>
      }
      contentContainerStyle={{ paddingTop: spacing.xs }}
      surface={colors.surface}
    >
      {selectedTenancy ? (
        <DepositAccountHeader canManage={canManageDeposits} tenantName={selectedTenancy?.tenantName ?? null} />
      ) : (
        <ScreenHeader
          artwork={DEPOSIT_HEADER_ILLUSTRATION}
          badge={!canManageDeposits ? <ViewOnlyChip /> : null}
          italicTail="manager."
          subtitle={property ? `Deposit accounts workspace for ${property.name}.` : "Select a property on Home first."}
          title="Deposit"
        />
      )}

      {!property ? (
        <EmptyState
          artworkNode={<DepositHistoryArtwork size={124} />}

          title="Choose a property first"
          description="Open the workspace tab on the home screen and select the property you want to manage deposits for."
        />
      ) : (
        <>
          {selectedTenancy ? (
            <DepositAccountTenantCard tenancy={selectedTenancy} onPress={goBack} />
          ) : (
            <TenancyPicker
              activeTenancies={activeTenancies}
              loading={tenanciesQuery.isFetching && tenancies.length === 0}
              onSelect={chooseTenancy}
              onToggle={() => setPickerOpen((open) => !open)}
              open={pickerOpen}
              selectedTenancy={null}
            />
          )}

          {/* Only while nothing is open: the screen is either "choose someone"
              or "work on this account", never both. */}
          {!selectedTenancy && pendingDeposits.length > 0 ? (
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => chooseTenancy(pendingDeposits[0].tenancyId)}
            >
              <NoticeBar
                message={
                  pendingDeposits.length === 1
                    ? `1 deposit · ${formatMoneyPaise(pendingTotalPaise)} held`
                    : `${pendingDeposits.length} deposits · ${formatMoneyPaise(pendingTotalPaise)} held`
                }
                title="Needs settlement"
                tone="warning"
              />
            </AnimatedPressable>
          ) : null}

          {selectedTenancy && !pickerOpen ? (
            selectedTenancy.billingType === "DAILY" ? (
              <EmptyState
                artworkNode={<DepositHistoryArtwork size={124} />}

                title="No deposit for daily stays"
                description="Daily tenancies are billed per night and do not carry a refundable security deposit, so there is no deposit ledger to manage."
              />
            ) : depositQuery.isFetching && !deposit ? (
              <OwnerDepositOverviewSkeleton />
            ) : deposit ? (
              <DepositAccountDetail
                key={deposit.id}
                busy={addState.isLoading || deductState.isLoading || settleState.isLoading || closeState.isLoading}
                canManage={canManageDeposits}
                deposit={deposit}
                onDeduct={() => setCorrectionMode("deduct")}
                onAdd={() => setCorrectionMode("add")}
                onSettle={() => setSettleModalOpen(true)}
              />
            ) : (
              <EmptyState
                artworkNode={<DepositHistoryArtwork size={124} />}

                title="Deposit not opened yet"
                description="A deposit account opens automatically once this tenant's first monthly cycle is paid."
              />
            )
          ) : null}

          {!selectedTenancy ? (
            <HistoryEntryCard onPress={() => router.navigate("/owner-deposit-history")} />
          ) : null}
        </>
      )}

      {correctionMode ? (
        <CorrectionModal
          balancePaise={deposit?.currentBalancePaise ?? 0}
          mode={correctionMode}
          onCancel={() => setCorrectionMode(null)}
          onSubmit={submitCorrection}
        />
      ) : null}

      {settleModalOpen && deposit && selectedTenancy && payable != null ? (
        <ConfirmDialog
          bullets={
            payable
              ? [
                  `${formatMoneyPaise(deposit.currentBalancePaise)} is refunded to ${
                    selectedTenancy.tenantName?.trim() || "the tenant"
                  }.`,
                  "The deposit account closes and the ledger is final.",
                ]
              : [
                  "Nothing is paid out — this deposit was marked not refundable at exit.",
                  `The ${formatMoneyPaise(deposit.currentBalancePaise)} balance stays on the ledger as a record.`,
                  "The deposit account closes and the ledger is final.",
                ]
          }
          confirmLabel={payable ? "Continue" : "Close account"}
          destructive={!payable}
          footnote="Decided when the tenancy ended. Amounts cannot be changed here."
          message={
            payable
              ? "This pays out the remaining balance and closes the account."
              : "This closes the account without paying anything out."
          }
          onCancel={() => setSettleModalOpen(false)}
          onConfirm={submitSettlement}
          title={payable ? "Settle deposit" : "Close deposit account"}
        />
      ) : null}
      {settleErrors.serverError ? <AlertModal message={settleErrors.serverError} onClose={settleErrors.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}

function TenancyPicker({
  activeTenancies,
  loading,
  onSelect,
  onToggle,
  open,
  selectedTenancy,
}: {
  activeTenancies: TenancySummary[];
  loading: boolean;
  onSelect: (tenancyId: string) => void;
  onToggle: () => void;
  open: boolean;
  selectedTenancy: TenancySummary | null;
}) {
  const { colors, fonts, type } = useTheme();
  const title = selectedTenancy ? selectedTenancy.tenantName ?? "Unnamed tenant" : "Select a tenancy";
  const subtitle = selectedTenancy
    ? `${selectedTenancy.referenceCode} · ${tenancyStatusLabel(selectedTenancy.status)}`
    : activeTenancies.length > 0
      ? "Choose an active tenant to manage their deposit."
      : "No active monthly tenancies on this property.";

  if (loading) {
    return <OwnerDataCardSkeleton bodyLines={1} />;
  }

  return (
    <View style={{ gap: spacing.md }}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${open ? "Hide" : "Show"} active tenancies`}
        accessibilityState={{ disabled: activeTenancies.length === 0, expanded: open }}
        disabled={activeTenancies.length === 0}
        onPress={activeTenancies.length > 0 ? onToggle : undefined}
        style={{
          // The history card's shape, so the two controls on this screen read
          // as one family. The pale blue fill made the picker the loudest
          // thing on the page and left the history card looking like the
          // afterthought — when the picker is the thing you use first.
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 16,
          borderWidth: 1,
          elevation: 1,
          flexDirection: "row",
          gap: spacing.md,
          // Shorter. At 126 the card was mostly air around two lines of text.
          minHeight: 100,
          overflow: "hidden",
          padding: spacing.md,
          shadowColor: colors.primaryDeep,
          shadowOffset: { height: 4, width: 0 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
        }}
      >
        <Svg accessible={false} pointerEvents="none" width={190} height={65} viewBox="0 0 190 65" style={{ bottom: 0, position: "absolute", right: 0 }}>
          <Path d="M0 65 C58 18 83 53 125 30 C151 16 170 5 190 0 V65 Z" fill={colors.primarySoft} />
          <Path d="M62 65 C111 43 150 53 190 29 V65 Z" fill={colors.primary} opacity={0.08} />
        </Svg>
        <View
          style={{
            alignItems: "center",
            height: 44,
            justifyContent: "center",
            width: 44,
          }}
        >
          {/* The property artwork with a person on it. A house with a rupee
              inside read as "property value" rather than "whose deposit", which
              is the one thing this control exists to choose.

              The person is filled, not outlined: at 19pt against the artwork's
              own detail an open glyph disappeared into it, and a solid shape
              is the only thing that still reads as a person at that size. */}
          <PropertyArtwork size={34} />
          <UserRound
            color={colors.primary}
            fill={colors.primary}
            size={19}
            strokeWidth={1.6}
            style={{ bottom: 0, position: "absolute", right: -2 }}
          />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
          <Text
            numberOfLines={2}
            style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17, letterSpacing: -0.3, lineHeight: 23 }}
          >
            {title}
          </Text>
          <Text style={[type.caption, { color: colors.muted, fontSize: 12, lineHeight: 18 }]}>
            {subtitle}
          </Text>
        </View>
        {/* Up when the list is open, not a rotated right-chevron. A 90-degree
            rotation points DOWN, which says "there is more below" at the exact
            moment the more is already showing — the arrow has to offer the way
            back. */}
        {activeTenancies.length > 0 ? (
          open ? (
            <ChevronUp color={colors.muted} size={20} strokeWidth={2} />
          ) : (
            <ChevronRight color={colors.muted} size={20} strokeWidth={2} />
          )
        ) : null}
      </AnimatedPressable>

      {open && activeTenancies.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          {activeTenancies.map((tenancy) => (
            <TenancyOptionRow
              key={tenancy.id}
              onSelect={onSelect}
              selected={tenancy.id === selectedTenancy?.id}
              tenancy={tenancy}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}


/**
 * One choosable tenancy.
 *
 * <p>Lifted out of the picker so the loading state renders the SAME row rather
 * than a drawing of one — see SkeletonBoundary.
 */
function TenancyOptionRow({
  onSelect,
  selected,
  tenancy,
}: {
  onSelect: (tenancyId: string) => void;
  selected: boolean;
  tenancy: TenancySummary;
}) {
  const { colors, fonts, type } = useTheme();

  return (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`Open deposit for ${tenancy.tenantName ?? "Unnamed tenant"}, ${tenancy.referenceCode}`}
          key={tenancy.id}
          onPress={() => onSelect(tenancy.id)}
          style={{
            alignItems: "center",
            backgroundColor: selected ? "#F4F8FF" : colors.surface,
            borderColor: selected ? "#CFE2FF" : colors.border,
            borderRadius: 16,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            minHeight: 84,
            padding: spacing.md,
            shadowColor: colors.primaryDeep,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 1,
          }}
        >
          <UserRound color={colors.primary} size={28} strokeWidth={1.8} />
          <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
              <Text
                style={[type.bodyStrong, { color: colors.ink, flex: 1, fontFamily: fonts.displaySoft, fontSize: 16, lineHeight: 22, minWidth: 0 }]}
              >
                {tenancy.tenantName ?? "Unnamed tenant"}
              </Text>
              <View style={{ alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: radii.pill, flexDirection: "row", gap: 4, paddingHorizontal: 8, paddingVertical: 5 }}>
                  <CalendarDays color={colors.primary} size={12} strokeWidth={2} />
                  <Text style={{ color: colors.primary, fontFamily: fonts.sansSemiBold, fontSize: 11, lineHeight: 15 }}>
                    Monthly
                  </Text>
                </View>
                          </View>
            <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", columnGap: spacing.xs, rowGap: 3 }}>
              <Text style={[type.caption, { color: colors.muted, fontSize: 11, lineHeight: 16 }]}>
                {tenancy.referenceCode}
              </Text>
              {/* Only when it says something. Every tenant in this list holds a
                  live deposit, so "Active" on each row was noise. On notice is
                  the one worth seeing here. */}
              {tenancy.status !== "ACTIVE" ? (
                <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
                  <View style={{ backgroundColor: colors.warning, borderRadius: 3, height: 6, width: 6 }} />
                  <Text style={[type.caption, { color: colors.muted, fontSize: 11, lineHeight: 16 }]}>
                    {tenancyStatusLabel(tenancy.status)}
                  </Text>
                </View>
              ) : null}
                          </View>
          </View>
          <ChevronRight color={colors.muted} size={18} strokeWidth={2} />
        </AnimatedPressable>
  );
}


function HistoryEntryCard({ onPress }: { onPress: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        minHeight: 126,
        overflow: "hidden",
        padding: spacing.lg,
        shadowColor: colors.primaryDeep,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 1,
      }}
    >
      <Svg accessible={false} pointerEvents="none" width={190} height={65} viewBox="0 0 190 65" style={{ bottom: 0, position: "absolute", right: 0 }}>
        <Path d="M0 65 C58 18 83 53 125 30 C151 16 170 5 190 0 V65 Z" fill={colors.primarySoft} />
        <Path d="M62 65 C111 43 150 53 190 29 V65 Z" fill={colors.primary} opacity={0.08} />
      </Svg>
      <History color={colors.primary} size={38} strokeWidth={1.8} />
      <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17, letterSpacing: -0.3, lineHeight: 23 }}>
          Deposit manager history
        </Text>
        <Text style={[type.caption, { color: colors.muted, fontSize: 12, lineHeight: 18 }]}>
          Search past and present deposit accounts, filter by status and open any ledger.
        </Text>
      </View>
      <ChevronRight color={colors.muted} size={20} strokeWidth={2} />
    </AnimatedPressable>
  );
}

function CorrectionModal({
  balancePaise,
  mode,
  onCancel,
  onSubmit,
}: {
  balancePaise: number;
  mode: CorrectionMode;
  onCancel: () => void;
  onSubmit: (amountPaise: number, reason: string) => Promise<void>;
}) {
  const { colors, fonts, type } = useTheme();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const form = useFormErrors<"amount" | "reason">();
  const isAdd = mode === "add";

  async function handleSubmit() {
    const amountPaise = rupeesToPaise(amount);
    const cleared = form.validate({
      ...(amountPaise == null || amountPaise <= 0
        ? { amount: "Enter an amount greater than zero." }
        : !isAdd && amountPaise > balancePaise
          ? { amount: "Deduction cannot exceed the current balance." }
          : {}),
      ...(reason.trim() ? {} : { reason: "Add a short reason for this change." }),
    });
    if (!cleared || amountPaise == null) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(amountPaise, reason.trim());
    } catch (caught) {
      form.failFromServer(errorMessage(caught) || "Could not save this deposit change. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onCancel} statusBarTranslucent transparent visible>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.card,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: 440,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, }}>
            {isAdd ? "Add to deposit" : "Deduct from deposit"}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            Current balance {formatMoneyPaise(balancePaise)}
          </Text>

          <FormInput
            error={form.errors.amount}
            keyboardType="decimal-pad"
            label="Amount"
            onChangeText={(next) => {
              setAmount(next);
              form.clearField("amount");
            }}
            placeholder="0"
            prefix="₹"
            required
            value={amount}
          />
          <FormInput
            error={form.errors.reason}
            label="Reason"
            maxLength={300}
            multiline
            onChangeText={(next) => {
              setReason(next);
              form.clearField("reason");
            }}
            placeholder={isAdd ? "Top-up reason" : "Deduction reason"}
            required
            value={reason}
          />

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton disabled={submitting} label="Cancel" onPress={onCancel} variant="secondary" />
            <ActionButton disabled={submitting || form.blocked} label={isAdd ? "Add" : "Deduct"} onPress={() => void handleSubmit()} variant={isAdd ? "primary" : "danger"} />
          </View>
          {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
        </View>
      </View>
    </Modal>
  );
}

function SummaryLine({ label, strong, value }: { label: string; strong?: boolean; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[strong ? type.bodyStrong : type.caption, { color: strong ? colors.ink : colors.muted }]}>
        {label}
      </Text>
      <Text style={[strong ? type.bodyStrong : type.caption, { color: strong ? colors.ink : colors.muted, fontVariant: ["tabular-nums"] }]}>
        {value}
      </Text>
    </View>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(value));
}

function settleErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "data" in error) {
    const data = (error as { data?: { message?: unknown } }).data;
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message.trim();
    }
  }
  return "Could not settle the deposit. Please try again.";
}
