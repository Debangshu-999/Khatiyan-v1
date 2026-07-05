import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ArrowLeft, ChevronDown, ChevronRight, History, Landmark, Minus, Plus, Wallet } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusPill } from "@/components/status-pill";
import { SkeletonScreen } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import {
  ActionButton,
  ConfirmDialog,
  FormInput,
  formatMoneyPaise,
  humanizeToken,
  rupeesToPaise,
  shortId,
} from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import type { DepositAccount, DepositMovement } from "@/store/services/billing-api";
import {
  useAddDepositCorrectionMutation,
  useDeductDepositCorrectionMutation,
  useGetManagedTenancyDepositQuery,
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
  const [settleConfirmOpen, setSettleConfirmOpen] = useState(false);
  const selectedTenancy = selectedTenancyId ? tenancyById.get(selectedTenancyId) ?? null : null;

  const depositQuery = useGetManagedTenancyDepositQuery(selectedTenancyId ?? "", { skip: !selectedTenancyId });
  const deposit = depositQuery.data;

  const [correctionMode, setCorrectionMode] = useState<CorrectionMode | null>(null);
  const [addCorrection, addState] = useAddDepositCorrectionMutation();
  const [deductCorrection, deductState] = useDeductDepositCorrectionMutation();
  const [settleDeposit, settleState] = useSettleManagedDepositMutation();

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

  async function confirmSettle() {
    if (!selectedTenancyId) {
      return;
    }
    try {
      await settleDeposit({ reason: "Deposit settled by manager", tenancyId: selectedTenancyId }).unwrap();
      toast.success("Deposit settled.");
    } catch (error) {
      toast.error(settleErrorMessage(error));
    }
  }

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="DEPOSIT MANAGER"
        title="Deposit"
        italicTail="manager."
        subtitle="Pick an active tenancy to review its deposit ledger, add or deduct amounts, and settle on exit."
        trailing={<BackButton onPress={() => router.back()} />}
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

          {selectedTenancy ? (
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
                busy={addState.isLoading || deductState.isLoading || settleState.isLoading}
                deposit={deposit}
                onDeduct={() => setCorrectionMode("deduct")}
                onAdd={() => setCorrectionMode("add")}
                onSettle={() => setSettleConfirmOpen(true)}
                tenancyEnded={!ACTIVE_STATUSES.includes(selectedTenancy.status)}
              />
            ) : (
              <EmptyState
                icon={Landmark}
                eyebrow="No deposit account"
                title="Deposit not opened yet"
                description="A deposit account opens automatically once this tenant's first monthly cycle is paid."
              />
            )
          ) : (
            <Card tone="sunken">
              <Text style={[type.body, { color: colors.muted }]} selectable>
                Select a tenancy above to see its deposit balance and ledger.
              </Text>
            </Card>
          )}

          <HistoryEntryCard onPress={() => router.push("/owner-deposit-history")} />
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

      {settleConfirmOpen && deposit ? (
        <ConfirmDialog
          confirmLabel="Settle deposit"
          destructive
          message={`Refund ${formatMoneyPaise(deposit.currentBalancePaise)} to ${selectedTenancy?.tenantName?.trim() || "the tenant"} and close this deposit account? This cannot be undone.`}
          onCancel={() => setSettleConfirmOpen(false)}
          onConfirm={() => {
            setSettleConfirmOpen(false);
            void confirmSettle();
          }}
          title="Settle deposit?"
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
    <Card>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={activeTenancies.length > 0 ? onToggle : undefined}
        style={{
          alignItems: "center",
          backgroundColor: selectedTenancy ? colors.surfaceRaised : colors.primarySoft,
          borderColor: selectedTenancy ? colors.border : colors.primary,
          borderRadius: 14,
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
          <Wallet color={colors.primary} size={20} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[type.eyebrow, { color: selectedTenancy ? colors.kicker : colors.primary }]} selectable>
            Active tenancy
          </Text>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, fontWeight: "500" }} selectable>
            {title}
          </Text>
          <Text numberOfLines={2} style={[type.caption, { color: colors.muted }]} selectable>
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
                  backgroundColor: selected ? colors.primarySoft : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  borderRadius: 12,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: spacing.md,
                  padding: spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
                    {tenancy.tenantName ?? "Unnamed tenant"}
                  </Text>
                  <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]} selectable>
                    {tenancy.referenceCode} · {humanizeToken(tenancy.status)}
                  </Text>
                </View>
                <StatusPill label={humanizeToken(tenancy.billingType)} tone="neutral" />
              </AnimatedPressable>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

function DepositDetail({
  busy,
  deposit,
  onAdd,
  onDeduct,
  onSettle,
  tenancyEnded,
}: {
  busy: boolean;
  deposit: DepositAccount;
  onAdd: () => void;
  onDeduct: () => void;
  onSettle: () => void;
  tenancyEnded: boolean;
}) {
  const { colors, type } = useTheme();
  const active = deposit.status === "ACTIVE";

  return (
    <>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Balance" value={formatMoneyPaise(deposit.currentBalancePaise)} hint={humanizeToken(deposit.status)} tone="primary" />
            <MetricTile label="Entries" value={String(deposit.movements.length)} hint="Movements" />
          </View>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Account status
            </Text>
            <StatusPill label={humanizeToken(deposit.status)} tone={active ? "success" : "neutral"} />
          </View>

          {active ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <ActionButton disabled={busy} icon={Plus} label="Add" onPress={onAdd} variant="primary" />
                <ActionButton disabled={busy} icon={Minus} label="Deduct" onPress={onDeduct} variant="secondary" />
              </View>
              {deposit.currentBalancePaise > 0 ? (
                <View style={{ gap: spacing.xs }}>
                  <ActionButton disabled={busy || !tenancyEnded} label="Settle deposit" onPress={onSettle} variant="danger" />
                  {!tenancyEnded ? (
                    <Text style={[type.caption, { color: colors.muted }]} selectable>
                      Settlement unlocks after the tenancy ends. Exit execution settles the deposit automatically.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Card>

      {deposit.movements.length > 0 ? (
        deposit.movements.map((movement) => <MovementCard key={movement.id} movement={movement} />)
      ) : (
        <EmptyState
          icon={Landmark}
          eyebrow="No movements"
          title="No deposit actions yet"
          description="Credits, deductions and settlement actions appear here as the deposit ledger changes."
        />
      )}
    </>
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
          backgroundColor: colors.primarySoft,
          borderRadius: 12,
          height: 44,
          justifyContent: "center",
          width: 44,
        }}
      >
        <History color={colors.primary} size={20} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "600", letterSpacing: -0.3 }} selectable>
          Deposit manager history
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} selectable>
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
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, fontWeight: "600" }} selectable>
            {isAdd ? "Add to deposit" : "Deduct from deposit"}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]} selectable>
            Current balance {formatMoneyPaise(balancePaise)}
          </Text>

          <FormInput keyboardType="decimal-pad" label="Amount (₹)" onChangeText={setAmount} placeholder="0" value={amount} />
          <FormInput label="Reason" maxLength={300} multiline onChangeText={setReason} placeholder={isAdd ? "Top-up reason" : "Deduction reason"} value={reason} />

          {error ? (
            <Text style={[type.caption, { color: colors.danger }]} selectable>
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

function MovementCard({ movement }: { movement: DepositMovement }) {
  const { colors, fonts, type } = useTheme();
  const credit = movement.type === "CREDIT";

  return (
    <Card tone="sunken">
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            {humanizeToken(movement.type)}
          </Text>
          <StatusPill label={credit ? "Credit" : "Debit"} tone={credit ? "success" : "warning"} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
          <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>
            {movement.reason}
          </Text>
          <Text style={{ color: colors.ink, flex: 1.1, fontFamily: fonts.display, fontSize: 18, fontWeight: "500", textAlign: "right" }} selectable>
            {formatMoneyPaise(movement.amountPaise)}
          </Text>
        </View>
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          {formatDateTime(movement.createdAt)}
          {movement.billingCycleId ? ` · Billing ${shortId(movement.billingCycleId)}` : ""}
        </Text>
      </View>
    </Card>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Go back"
      onPress={onPress}
      style={{ alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 42, justifyContent: "center", width: 42 }}
    >
      <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
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
