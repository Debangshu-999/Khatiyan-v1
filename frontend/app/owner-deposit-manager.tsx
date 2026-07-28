import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ArrowLeft, Check, ChevronDown, ChevronRight, History, Landmark, Minus, Plus, Trash2, Wallet, X } from "lucide-react-native";

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
  useSettleDepositWithDamagesMutation,
} from "@/store/services/billing-api";
import { useGetPropertyExitPoliciesQuery, type PropertyDamageCharge } from "@/store/services/property-api";
import type { TenancyStatus, TenancySummary } from "@/store/services/tenancy-api";
import { useListPropertyTenanciesQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type CorrectionMode = "add" | "deduct";

const ACTIVE_STATUSES: TenancyStatus[] = ["ACTIVE", "ON_NOTICE", "ON_PREMATURE_NOTICE"];

export default function OwnerDepositManagerScreen() {
  const router = useGuardedRouter();
  const { settle: settleParam, tenancyId: tenancyIdParam } = useLocalSearchParams<{ settle?: string; tenancyId?: string }>();
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
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const selectedTenancy = selectedTenancyId ? tenancyById.get(selectedTenancyId) ?? null : null;

  const depositQuery = useGetManagedTenancyDepositQuery(selectedTenancyId ?? "", { skip: !selectedTenancyId });
  const deposit = depositQuery.data;
  const exitPoliciesQuery = useGetPropertyExitPoliciesQuery(propertyId, { skip: !propertyId });
  const damageCharges = exitPoliciesQuery.data?.damageCharges ?? [];

  const [correctionMode, setCorrectionMode] = useState<CorrectionMode | null>(null);
  const [addCorrection, addState] = useAddDepositCorrectionMutation();
  const [deductCorrection, deductState] = useDeductDepositCorrectionMutation();
  const [settleWithDamages, settleState] = useSettleDepositWithDamagesMutation();

  // Landed here from the end-tenancy screen's "settle now": open settlement
  // straight away once the pending deposit has loaded (once).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (settleParam === "1" && deposit?.status === "PENDING_SETTLEMENT" && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setSettleModalOpen(true);
    }
  }, [deposit?.status, settleParam]);

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

  async function submitSettlement(
    damageItemNames: string[],
    customCharges: { reason: string; amountPaise: number }[],
  ) {
    if (!selectedTenancyId) {
      return;
    }
    try {
      await settleWithDamages({
        customCharges,
        damageItemNames,
        reason: "Deposit settled at exit",
        tenancyId: selectedTenancyId,
      }).unwrap();
      setSettleModalOpen(false);
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

      {settleModalOpen && deposit && selectedTenancy ? (
        <SettlementModal
          balancePaise={deposit.currentBalancePaise}
          busy={settleState.isLoading}
          damageCharges={damageCharges}
          onCancel={() => setSettleModalOpen(false)}
          onSubmit={submitSettlement}
          tenantName={selectedTenancy.tenantName?.trim() || "the tenant"}
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
}: {
  busy: boolean;
  deposit: DepositAccount;
  onAdd: () => void;
  onDeduct: () => void;
  onSettle: () => void;
}) {
  const { colors, type } = useTheme();
  const active = deposit.status === "ACTIVE";
  const pending = deposit.status === "PENDING_SETTLEMENT";
  const statusTone = active ? "success" : pending ? "warning" : "neutral";

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
            <StatusPill label={humanizeToken(deposit.status)} tone={statusTone} />
          </View>

          {active ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton disabled={busy} icon={Plus} label="Add" onPress={onAdd} variant="primary" />
              <ActionButton disabled={busy} icon={Minus} label="Deduct" onPress={onDeduct} variant="secondary" />
            </View>
          ) : null}

          {pending ? (
            <View style={{ gap: spacing.xs }}>
              <ActionButton disabled={busy} label="Settle deposit" onPress={onSettle} variant="danger" />
              <Text style={[type.caption, { color: colors.muted }]} selectable>
                Assess damage, add any charges, then refund the remaining balance to close this account.
              </Text>
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

          <FormInput keyboardType="decimal-pad" label="Amount" onChangeText={setAmount} placeholder="0" prefix="₹" value={amount} />
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

// On-spot settlement: pick damaged items (priced from the property schedule),
// add any custom charges, and refund the remaining balance to close the account.
function SettlementModal({
  balancePaise,
  busy,
  damageCharges,
  onCancel,
  onSubmit,
  tenantName,
}: {
  balancePaise: number;
  busy: boolean;
  damageCharges: PropertyDamageCharge[];
  onCancel: () => void;
  onSubmit: (damageItemNames: string[], customCharges: { reason: string; amountPaise: number }[]) => Promise<void>;
  tenantName: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [customRows, setCustomRows] = useState<{ reason: string; amount: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedNames = damageCharges.filter((item) => selected[item.name]).map((item) => item.name);
  const damageTotal = damageCharges.filter((item) => selected[item.name]).reduce((sum, item) => sum + item.chargePaise, 0);
  const customCharges = customRows
    .map((row) => ({ amountPaise: rupeesToPaise(row.amount) ?? 0, reason: row.reason.trim() }))
    .filter((row) => row.amountPaise > 0 && row.reason.length > 0);
  const customTotal = customCharges.reduce((sum, row) => sum + row.amountPaise, 0);
  const refund = balancePaise - damageTotal - customTotal;

  function submit() {
    for (const row of customRows) {
      const amount = rupeesToPaise(row.amount) ?? 0;
      if (amount > 0 && !row.reason.trim()) {
        setError("Give every custom charge a short reason.");
        return;
      }
    }
    if (refund < 0) {
      setError("Charges exceed the deposit balance. Reduce them or bill the difference separately.");
      return;
    }
    setError(null);
    void onSubmit(selectedNames, customCharges);
  }

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} numberOfLines={1} selectable>
                  Settle deposit
                </Text>
                <Text style={[type.caption, { color: colors.muted }]} selectable>
                  Refunding to {tenantName}
                </Text>
              </View>
              <AnimatedPressable
                accessibilityLabel="Close"
                onPress={onCancel}
                style={{ alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 40, justifyContent: "center", width: 40 }}
              >
                <X color={colors.ink} size={18} strokeWidth={2.2} />
              </AnimatedPressable>
            </View>

            <ScrollView
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
              <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
                <SummaryLine label="Deposit balance" value={formatMoneyPaise(balancePaise)} />
                {damageTotal > 0 ? <SummaryLine label="Damage" value={`− ${formatMoneyPaise(damageTotal)}`} /> : null}
                {customTotal > 0 ? <SummaryLine label="Custom charges" value={`− ${formatMoneyPaise(customTotal)}`} /> : null}
                <View style={{ backgroundColor: colors.border, height: 1, marginVertical: 2 }} />
                <SummaryLine label="Refund" strong value={formatMoneyPaise(Math.max(refund, 0))} />
              </View>

              <View style={{ gap: spacing.sm }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  Damage charges
                </Text>
                {damageCharges.length === 0 ? (
                  <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
                    No damage schedule configured. Add items under the property's exit policies.
                  </Text>
                ) : (
                  damageCharges.map((item) => (
                    <AnimatedPressable
                      key={item.name}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: Boolean(selected[item.name]) }}
                      onPress={() => setSelected((current) => ({ ...current, [item.name]: !current[item.name] }))}
                      style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs }}
                    >
                      <View
                        style={{
                          alignItems: "center",
                          backgroundColor: selected[item.name] ? colors.primary : "transparent",
                          borderColor: selected[item.name] ? colors.primary : colors.borderStrong,
                          borderRadius: 6,
                          borderWidth: 1.5,
                          height: 22,
                          justifyContent: "center",
                          width: 22,
                        }}
                      >
                        {selected[item.name] ? <Check color={colors.onPrimary} size={14} strokeWidth={3} /> : null}
                      </View>
                      <Text style={[type.body, { color: colors.ink, flex: 1 }]} selectable={false}>
                        {item.name}
                      </Text>
                      <Text style={[type.caption, { color: colors.muted, fontVariant: ["tabular-nums"] }]} selectable={false}>
                        {formatMoneyPaise(item.chargePaise)}
                      </Text>
                    </AnimatedPressable>
                  ))
                )}
              </View>

              <View style={{ gap: spacing.sm }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  Custom charges
                </Text>
                {customRows.map((row, index) => (
                  <View key={`custom-${index}`} style={{ flexDirection: "row", gap: spacing.sm }}>
                    <View style={{ flex: 1.4 }}>
                      <FormInput
                        label="Reason"
                        onChangeText={(text) => setCustomRows((rows) => rows.map((r, i) => (i === index ? { ...r, reason: text } : r)))}
                        placeholder="e.g. Repainting"
                        value={row.reason}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FormInput
                        keyboardType="decimal-pad"
                        label="Amount"
                        onChangeText={(text) => setCustomRows((rows) => rows.map((r, i) => (i === index ? { ...r, amount: text } : r)))}
                        placeholder="0"
                        prefix="₹"
                        value={row.amount}
                      />
                    </View>
                    <AnimatedPressable
                      accessibilityLabel="Remove charge"
                      onPress={() => setCustomRows((rows) => rows.filter((_, i) => i !== index))}
                      style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: spacing.sm }}
                    >
                      <Trash2 color={colors.danger} size={18} strokeWidth={2.2} />
                    </AnimatedPressable>
                  </View>
                ))}
                <ActionButton
                  icon={Plus}
                  label="Add custom charge"
                  onPress={() => setCustomRows((rows) => [...rows, { amount: "", reason: "" }])}
                  variant="secondary"
                />
              </View>

              {error ? (
                <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]} selectable>
                  {error}
                </Text>
              ) : null}

              <ActionButton
                disabled={busy}
                label={busy ? "Settling…" : `Settle & refund ${formatMoneyPaise(Math.max(refund, 0))}`}
                onPress={submit}
                variant="danger"
              />
            </ScrollView>
            <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SummaryLine({ label, strong, value }: { label: string; strong?: boolean; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[strong ? type.bodyStrong : type.caption, { color: strong ? colors.ink : colors.muted }]} selectable>
        {label}
      </Text>
      <Text style={[strong ? type.bodyStrong : type.caption, { color: strong ? colors.ink : colors.muted, fontVariant: ["tabular-nums"] }]} selectable>
        {value}
      </Text>
    </View>
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
