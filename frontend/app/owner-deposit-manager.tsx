import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, Modal, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, DoorOpen, History, Landmark, Minus, Plus, Wallet } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusPill } from "@/components/status-pill";
import { SkeletonScreen } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAvailableAccounts } from "@/features/account/accounts";
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
import { isDepositCredit } from "@/store/services/billing-api";
import type { DepositAccount, DepositMovement } from "@/store/services/billing-api";
import {
  useAddDepositCorrectionMutation,
  useDeductDepositCorrectionMutation,
  useGetManagedTenancyDepositQuery,
  useListPropertyDepositsQuery,
  useCloseDepositUnpaidMutation,
  useSettleManagedDepositMutation,
} from "@/store/services/billing-api";
import type { TenancyStatus, TenancySummary } from "@/store/services/tenancy-api";
import { useListPropertyTenanciesQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type CorrectionMode = "add" | "deduct";

const ACTIVE_STATUSES: TenancyStatus[] = ["ACTIVE", "ON_NOTICE", "ON_PREMATURE_NOTICE"];

export default function OwnerDepositManagerScreen() {
  const router = useGuardedRouter();
  const { tenancyId: tenancyIdParam } = useLocalSearchParams<{ tenancyId?: string }>();
  const { colors, type } = useTheme();
  const toast = useToast();
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
  const [pickerOpen, setPickerOpen] = useState(false);
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
      toast.error(settleErrorMessage(error));
    }
  }

  return (
    <ScreenScrollView>
      <ScreenHeader
        badge={!canManageDeposits ? <ViewOnlyChip /> : null}
        eyebrow={selectedTenancy ? "Deposit manager" : "Owner tool"}
        onBack={goBack}
        title="Deposit"
        italicTail={selectedTenancy ? "account." : "manager."}
        subtitle={
          selectedTenancy
            ? undefined
            : "Pick an active tenancy to review its deposit ledger, add or deduct amounts, and settle on exit."
        }
      />

      {!property ? (
        <EmptyState
          icon={Landmark}
          eyebrow="No property selected"
          title="Choose a property first"
          description="Open the workspace tab on the home screen and select the property you want to manage deposits for."
        />
      ) : (
        <>
          <TenancyPicker
            activeTenancies={activeTenancies}
            loading={tenanciesQuery.isFetching && tenancies.length === 0}
            onSelect={chooseTenancy}
            onToggle={() => setPickerOpen((open) => !open)}
            open={pickerOpen}
            selectedTenancy={selectedTenancy}
          />

          {/* Only while nothing is open: the screen is either "choose someone"
              or "work on this account", never both. */}
          {!selectedTenancy && pendingDeposits.length > 0 ? (
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => chooseTenancy(pendingDeposits[0].tenancyId)}
            >
              <NoticeBar
                icon={AlertTriangle}
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
                icon={Wallet}
                eyebrow="Not eligible"
                title="No deposit for daily stays"
                description="Daily tenancies are billed per night and do not carry a refundable security deposit, so there is no deposit ledger to manage."
              />
            ) : depositQuery.isFetching && !deposit ? (
              <SkeletonScreen header={false} tiles={2} rows={2} />
            ) : deposit ? (
              <DepositDetail
                busy={addState.isLoading || deductState.isLoading || settleState.isLoading || closeState.isLoading}
                canManage={canManageDeposits}
                deposit={deposit}
                onDeduct={() => setCorrectionMode("deduct")}
                onAdd={() => setCorrectionMode("add")}
                onSettle={() => setSettleModalOpen(true)}
              />
            ) : (
              <EmptyState
                icon={Landmark}
                eyebrow="No deposit account"
                title="Deposit not opened yet"
                description="A deposit account opens automatically once this tenant's first monthly cycle is paid."
              />
            )
          ) : null}

          {!selectedTenancy ? (
            <HistoryEntryCard onPress={() => router.push("/owner-deposit-history")} />
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
    ? `${selectedTenancy.referenceCode} · ${humanizeToken(selectedTenancy.status)}`
    : activeTenancies.length > 0
      ? "Choose an active tenant to manage their deposit."
      : "No active monthly tenancies on this property.";

  return (
    <View style={{ gap: spacing.sm }}>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={activeTenancies.length > 0 ? onToggle : undefined}
        style={{
          alignItems: "center",
          backgroundColor: selectedTenancy ? colors.surfaceRaised : colors.primarySoft,
          // Ink in both states, matching the home property picker.
          borderColor: colors.ink,
          borderRadius: 18,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.md,
          minHeight: 72,
          padding: spacing.md,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: selectedTenancy ? colors.primarySoft : colors.surface,
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <DoorOpen color={colors.primary} size={20} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[type.eyebrow, { color: selectedTenancy ? colors.kicker : colors.primary }]}>
            Active tenancy
          </Text>
          <Text
            numberOfLines={1}
            style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, lineHeight: 25 }}
          >
            {title}
          </Text>
          <Text numberOfLines={2} style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
            {subtitle}
          </Text>
        </View>
        {activeTenancies.length > 0 ? (
          <ChevronDown color={colors.primary} size={20} strokeWidth={2.2} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
        ) : null}
      </AnimatedPressable>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      {open && activeTenancies.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {activeTenancies.map((tenancy) => {
            const selected = tenancy.id === selectedTenancy?.id;
            return (
              <AnimatedPressable
                accessibilityRole="button"
                key={tenancy.id}
                onPress={() => onSelect(tenancy.id)}
                style={{
                  alignItems: "center",
                  // Same filled-ink selection as the home property picker this
                  // control was built to mirror.
                  backgroundColor: selected ? colors.ink : colors.surface,
                  borderColor: selected ? colors.ink : colors.border,
                  borderRadius: 12,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: spacing.md,
                  padding: spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={[type.bodyStrong, { color: selected ? colors.surface : colors.ink }]}>
                    {tenancy.tenantName ?? "Unnamed tenant"}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[type.caption, { color: selected ? colors.surface : colors.muted, opacity: selected ? 0.75 : 1 }]}
                  >
                    {tenancy.referenceCode} · {humanizeToken(tenancy.status)}
                  </Text>
                </View>
                {/* The pill keeps its own surface, so it stays legible on the
                    ink row without needing an inverted variant. */}
                <StatusPill label={humanizeToken(tenancy.billingType)} tone="neutral" />
              </AnimatedPressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One open deposit account.
 *
 * <p>Status is read from the DEPOSIT, never the tenancy. The two diverge the
 * moment a stay ends — the tenancy is EXITED while the deposit sits
 * PENDING_SETTLEMENT — and the list card used to show the tenancy's, so an
 * account waiting to be settled still read "Active".
 *
 * <p>Shown once. It used to appear beside the balance, as a section label and
 * as a pill; three copies of one fact is three chances to disagree.
 */
function DepositDetail({
  busy,
  canManage,
  deposit,
  onAdd,
  onDeduct,
  onSettle,
}: {
  busy: boolean;
  canManage: boolean;
  deposit: DepositAccount;
  onAdd: () => void;
  onDeduct: () => void;
  onSettle: () => void;
}) {
  const { colors, type } = useTheme();
  const pending = deposit.status === "PENDING_SETTLEMENT";
  const settled = deposit.status === "SETTLED";
  const payable = deposit.payableAtExit;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "flex-end" }}>
        <StatusPill label={humanizeToken(deposit.status)} tone={pending ? "warning" : settled ? "neutral" : "success"} />
      </View>

      {/* The decision made at end-tenancy, restated where it is about to be
          executed — settlement cannot revisit it, so the actor needs to see what
          they are carrying out rather than choosing. */}
      {pending ? (
        <NoticeBar
          icon={Clock}
          message={
            payable == null
              ? "No payability decision was recorded when this tenancy ended, so this deposit cannot be settled here."
              : payable
                ? `Decided refundable at exit. ${formatMoneyPaise(deposit.currentBalancePaise)} to return.`
                : "Decided not refundable at exit. Nothing is paid out."
          }
          title="Awaiting settlement"
          tone="warning"
        />
      ) : null}

      <Card>
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={[type.metric, { color: colors.ink, fontSize: 24, lineHeight: 29 }]}>
              {formatMoneyPaise(deposit.currentBalancePaise)}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              Balance
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", flex: 1, gap: 2 }}>
            <Text style={[type.metric, { color: colors.ink, fontSize: 24, lineHeight: 29 }]}>
              {deposit.movements.length}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              Movements
            </Text>
          </View>
        </View>

        {!settled ? (
          <>
            <Divider />
            {pending ? (
              <ActionButton
                disabled={busy || !canManage || payable == null}
                label={payable === false ? "Close account" : "Settle deposit"}
                onPress={onSettle}
                variant="danger"
              />
            ) : (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <ActionButton disabled={busy || !canManage} icon={Plus} label="Add" onPress={onAdd} variant="secondary" />
                </View>
                <View style={{ flex: 1 }}>
                  <ActionButton disabled={busy || !canManage} icon={Minus} label="Deduct" onPress={onDeduct} variant="secondary" />
                </View>
              </View>
            )}
          </>
        ) : null}
      </Card>

      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        Movements
      </Text>
      {deposit.movements.length === 0 ? (
        <Text style={[type.caption, { color: colors.kicker }]}>
          No movements yet.
        </Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {deposit.movements.map((movement) => (
            <MovementRow key={movement.id} movement={movement} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * One ledger line: what it was, when, and which way the money went.
 *
 * <p>No type pill. The sign and colour already say it, and the pill this
 * replaces was comparing against values the API never sends — so every row
 * rendered as a debit, credits included.
 */
function MovementRow({ movement }: { movement: DepositMovement }) {
  const { colors, type } = useTheme();
  const credit = isDepositCredit(movement.type);

  return (
    <View
      style={{
        borderColor: colors.borderStrong,
        borderRadius: 0,
        borderWidth: 1,
        flexDirection: "row",
      }}
    >
      {/* The direction of the money, read before any text. Inside the border so
          the rule is part of the row rather than a stripe beside it. */}
      <View style={{ backgroundColor: credit ? colors.jade : colors.danger, width: 5 }} />
      <View
        style={{
          alignItems: "center",
          flex: 1,
          flexDirection: "row",
          gap: spacing.sm,
          justifyContent: "space-between",
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <View style={{ flex: 1, gap: 1 }}>
          <Text selectable style={[type.body, { color: colors.ink }]}>
            {movement.reason}
          </Text>
          <Text style={[type.caption, { color: colors.kicker }]}>
            {formatDateTime(movement.createdAt)}
          </Text>
        </View>
        <Text selectable style={[type.bodyStrong, { color: credit ? colors.jade : colors.danger }]}>
          {credit ? "+ " : "− "}
          {formatMoneyPaise(movement.amountPaise)}
        </Text>
      </View>
    </View>
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
        padding: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderColor: colors.ink,
          borderWidth: 1,
          borderRadius: 12,
          height: 44,
          justifyContent: "center",
          width: 44,
        }}
      >
        <History color={colors.ink} size={20} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.3 }}>
          Deposit manager history
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
          Search past and present deposit accounts, filter by status and open any ledger.
        </Text>
      </View>
      <ChevronRight color={colors.kicker} size={20} strokeWidth={2.2} />
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
  const [error, setError] = useState<string | null>(null);
  const isAdd = mode === "add";

  async function handleSubmit() {
    const amountPaise = rupeesToPaise(amount);
    if (amountPaise == null || amountPaise <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!reason.trim()) {
      setError("Add a short reason for this change.");
      return;
    }
    if (!isAdd && amountPaise > balancePaise) {
      setError("Deduction cannot exceed the current balance.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(amountPaise, reason.trim());
    } catch {
      setError("Could not save this deposit change. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 20,
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

          <FormInput keyboardType="decimal-pad" label="Amount" onChangeText={setAmount} placeholder="0" prefix="₹" value={amount} />
          <FormInput label="Reason" maxLength={300} multiline onChangeText={setReason} placeholder={isAdd ? "Top-up reason" : "Deduction reason"} value={reason} />

          {error ? (
            <Text style={[type.caption, { color: colors.danger }]}>
              {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton disabled={submitting} label="Cancel" onPress={onCancel} variant="secondary" />
            <ActionButton disabled={submitting} label={isAdd ? "Add" : "Deduct"} onPress={() => void handleSubmit()} variant={isAdd ? "primary" : "danger"} />
          </View>
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
