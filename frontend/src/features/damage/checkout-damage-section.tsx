import { useRef, useState } from "react";
import { EmptyDamage } from "@/components/empty-art";
import { Text, View } from "react-native";
import { CircleHelp, Plus } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { DeleteIcon as Trash2 } from "@/components/delete-icon";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { errorMessage } from "@/features/forms/server-error";
import { PaymentMethodIcon } from "@/features/billing/payment-method-toggle";
import { SingleOptionPicker } from "@/components/option-picker";
import { ActionButton, ConfirmDialog, FormInput, formatMoneyPaise, rupeesToPaise } from "@/features/owner/owner-ui";
import { DamagesIcon } from "@/features/property/property-control-icons";
import { ItemIcon } from "@/features/property/item-icon";
import { DamageLevelPill } from "@/features/tenancy/damage-level";
import { billTitle, type BillingCycle } from "@/store/services/billing-api";
import {
  useCancelDamageBillToChangeMutation,
  useChargeDamageBillFromDepositMutation,
  useMoveDamageBillOffDepositMutation,
  useRaiseDamageBillMutation,
  type DamageRecord,
} from "@/store/services/damage-api";
import type { ExitCollectionMethod, ExitCustomCharge } from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { StatePill, damageRecordName } from "./damage-record-card";
import { DamageBillSheet } from "./damage-record-detail-sheet";
import { RecordDamageSheet } from "./record-damage-sheet";

export type OpenDamage = { amountPaise: number; record: DamageRecord };

/** The records this stay still answers for: no live bill, no waiver, no deposit cover. Oldest first. */
export function openDamagesOf(records: DamageRecord[] | undefined, tenancyId: string): OpenDamage[] {
  return (records ?? [])
    .flatMap((record) => {
      const share = record.shares.find((entry) => entry.tenancyId === tenancyId);
      if (!share || share.waived || share.depositPaise >= share.amountPaise) return [];
      if (share.billId && share.billStatus !== "CANCELLED") return [];
      return [{ amountPaise: share.amountPaise, record }];
    })
    .sort((left, right) => left.record.createdAt.localeCompare(right.record.createdAt));
}

/** This stay's Damage bills still owed, whichever way they were raised. */
export function owedDamageBillsOf(cycles: BillingCycle[] | undefined): BillingCycle[] {
  return (cycles ?? []).filter(
    (cycle) =>
      cycle.category === "ONE_OFF" &&
      billTitle(cycle) === "Damage bill" &&
      (cycle.status === "UNPAID" || cycle.status === "OVERDUE" || cycle.status === "CONFIRMATION_PENDING"),
  );
}

/** The records on a Damage bill still owed and not claimed paid: these can still come off it. */
export function billedDamagesOf(records: DamageRecord[] | undefined, tenancyId: string, bills: BillingCycle[]) {
  const owed = new Map(bills.filter((bill) => bill.status !== "CONFIRMATION_PENDING").map((bill) => [bill.id, bill]));
  return (records ?? [])
    .flatMap((record) => {
      const share = record.shares.find((entry) => entry.tenancyId === tenancyId);
      const bill = share?.billId ? owed.get(share.billId) : undefined;
      return share && bill ? [{ amountPaise: share.amountPaise, bill, record }] : [];
    })
    .sort((left, right) => left.record.createdAt.localeCompare(right.record.createdAt));
}

/** What a bill has already taken from the deposit. */
export function depositOnBill(bill: BillingCycle): number {
  return (bill.lineItems ?? [])
    .filter((line) => line.settlementAction === "ADJUSTED_FROM_DEPOSIT")
    .reduce((sum, line) => sum + line.settlementAmountPaise, 0);
}

const HOW_IT_WORKS = {
  charges: {
    points: [
      "A Damage bill blocks the checkout until it is cleared.",
      "Use Deposit on a bill takes what the deposit has. Anything left stays on the bill.",
      "Move all to the bill puts the deposit back and the whole amount on the bill.",
      "Deposit takes the charges when the tenancy ends.",
      "If the total is more than the deposit, the rest becomes a Damage bill, raised straight away.",
      "A deposit marked not refundable cannot be charged.",
    ],
    title: "Damage charges",
  },
  other: {
    points: [
      "For anything that is not damage, like a lost key or a cleaning fee.",
      "They never come off the deposit.",
      "They are billed and recorded paid.",
      "Collecting the amount is your responsibility.",
    ],
    title: "Other charges",
  },
  records: {
    points: [
      "Every damage recorded against this tenant is listed.",
      "Untick one to waive it. A waiver is final when the tenancy ends.",
      "To change the amount of a raised bill, the bill is cancelled and raised again.",
      "The damage stays open for repair.",
      "For a split, only this tenant's share is charged.",
    ],
    title: "Damage records",
  },
} as const;

type Pending =
  | { kind: "deposit" }
  | { kind: "clearDeposit" }
  | { kind: "split" }
  | { kind: "bill" }
  | { at: number; kind: "removeOther" }
  | { bill: BillingCycle; kind: "charge" }
  | { bill: BillingCycle; kind: "back" };

/** A second tap of the same press lands on whatever opened under it, so a dialog's first moment takes nothing. */
const CONFIRM_ARMS_AFTER_MS = 450;

/**
 * The Damage records card of End tenancy (2026-10-31): the records still open,
 * ticked unless waived, and Add damage, under the Deposit card.
 */
export function CheckoutDamageRecords({
  billed,
  onError,
  onToggleWaived,
  open,
  propertyId,
  roomId,
  tenancyId,
  waived,
}: {
  billed: ReturnType<typeof billedDamagesOf>;
  onError: (message: string) => void;
  onToggleWaived: (recordId: string) => void;
  open: OpenDamage[];
  propertyId: string;
  roomId: string;
  tenancyId: string;
  waived: Record<string, boolean>;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [help, setHelp] = useState(false);
  const [recording, setRecording] = useState(false);
  const [takeOff, setTakeOff] = useState<ReturnType<typeof billedDamagesOf>[number] | null>(null);
  const takeOffSince = useRef(0);
  const [cancelToChange, removeState] = useCancelDamageBillToChangeMutation();
  const rows = [
    ...billed.map((entry) => ({ ...entry, billCode: entry.bill.referenceCode as string | null })),
    ...open.map((entry) => ({ ...entry, bill: null, billCode: null as string | null })),
  ].sort((left, right) => left.record.createdAt.localeCompare(right.record.createdAt));

  async function confirmTakeOff() {
    if (!takeOff || Date.now() - takeOffSince.current < CONFIRM_ARMS_AFTER_MS) return;
    const { bill, record } = takeOff;
    setTakeOff(null);
    try {
      await cancelToChange({ billId: bill.id, tenancyId, version: bill.version }).unwrap();
      // The record the owner unticked comes back unticked, the rest ticked. It can be ticked again until the tenancy ends.
      if (!waived[record.id]) onToggleWaived(record.id);
      toast.success(`${bill.referenceCode} cancelled.`);
    } catch (error) {
      onError(errorMessage(error));
    }
  }
  const smallBold = { color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14, lineHeight: 19 };
  const waivedPaise = open.reduce((sum, entry) => sum + (waived[entry.record.id] ? entry.amountPaise : 0), 0);
  const addDamage = <ActionButton icon={Plus} label="Add damage" onPress={() => setRecording(true)} variant="secondary" />;

  return (
    <>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Text style={[type.metric, { color: colors.ink, fontSize: 21, lineHeight: 26 }]}>Damage records</Text>
        <HelpButton onPress={() => setHelp(true)} title="Damage records" />
      </View>
      {rows.length === 0 ? (
        <EmptyState
          action={<View style={{ flexDirection: "row" }}>{addDamage}</View>}
          artworkNode={<EmptyDamage size={120} />}
          compact
          title="No open damages"
        />
      ) : (
        <>
          <View style={{ borderColor: colors.border, borderCurve: "continuous", borderRadius: 14, borderWidth: 1, overflow: "hidden" }}>
            {rows.map(({ amountPaise, bill, billCode, record }, index) => {
              const off = !bill && Boolean(waived[record.id]);
              return (
                <AnimatedPressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !off }}
                  key={record.id}
                  disabled={removeState.isLoading}
                  onPress={() => {
                    if (bill) {
                      takeOffSince.current = Date.now();
                      setTakeOff({ amountPaise, bill, record });
                    } else {
                      onToggleWaived(record.id);
                    }
                  }}
                  style={{
                    alignItems: "center",
                    borderBottomColor: colors.border,
                    borderBottomWidth: index === rows.length - 1 ? 0 : 1,
                    flexDirection: "row",
                    gap: spacing.sm,
                    minHeight: 56,
                    paddingHorizontal: 12,
                    paddingVertical: spacing.xs,
                  }}
                >
                  <View
                    style={{
                      alignItems: "center",
                      borderColor: off ? colors.borderStrong : colors.primary,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      height: 22,
                      justifyContent: "center",
                      width: 22,
                    }}
                  >
                    {off ? null : <View style={{ backgroundColor: colors.primary, borderRadius: 999, height: 12, width: 12 }} />}
                  </View>
                  <ItemIcon color={off ? colors.muted : colors.inkSoft} name={record.itemName} size={20} />
                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                      <Text numberOfLines={1} style={[smallBold, { flexShrink: 1 }]}>{damageRecordName(record)}</Text>
                      {record.damageLevel ? <DamageLevelPill level={record.damageLevel} /> : null}
                    </View>
                    <Text style={[type.caption, { color: colors.muted }]}>
                      {[
                        record.code,
                        billCode ? `On ${billCode}` : null,
                      ].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Text style={[smallBold, off ? { color: colors.muted, textDecorationLine: "line-through" as const } : null]}>
                    {formatMoneyPaise(amountPaise)}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
          {waivedPaise > 0 ? (
            <Text selectable style={[smallBold, { color: colors.muted }]}>
              <Text style={{ color: colors.ink }}>{formatMoneyPaise(waivedPaise)}</Text> will be waived
            </Text>
          ) : null}
          <View style={{ flexDirection: "row" }}>{addDamage}</View>
        </>
      )}

      {takeOff ? (
        <ConfirmDialog
          bullets={[
            `${takeOff.bill.referenceCode} of ${formatMoneyPaise(takeOff.bill.totalAmountPaise + depositOnBill(takeOff.bill))} is cancelled.`,
            ...(depositOnBill(takeOff.bill) > 0 ? [`${formatMoneyPaise(depositOnBill(takeOff.bill))} goes back to the deposit.`] : []),
            "Every record on it goes back to this list, to choose the collection again.",
          ]}
          confirmLabel="Cancel bill"
          destructive
          message="To change the amount, the existing bill will be cancelled."
          onCancel={() => setTakeOff(null)}
          onConfirm={() => void confirmTakeOff()}
          title="Cancel this bill?"
        />
      ) : null}
      {help ? <PointsSheet onClose={() => setHelp(false)} topic="records" /> : null}
      {recording ? (
        <RecordDamageSheet fixedStay={{ roomId, tenancyId }} onClose={() => setRecording(false)} propertyId={propertyId} />
      ) : null}
    </>
  );
}

/**
 * The Exit charges card of End tenancy (2026-10-31): Damage charges (the Damage
 * bills still owed and how the ticked records are collected) and Other charges.
 * Explanations live behind each label's i. Everything that moves money or
 * raises a bill asks first. A Damage bill is real the moment it is confirmed,
 * so it is still here when the owner comes back.
 */
export function CheckoutExitCharges({
  balancePaise,
  bills,
  collectedVia,
  collectionOptions,
  customCharges,
  depositBlocked,
  fromDeposit,
  onCollectedVia,
  onCustomCharges,
  onError,
  onFromDeposit,
  open,
  propertyId,
  tenancyId,
  waived,
}: {
  /** What the deposit can still pay, after an early-exit charge on it. */
  balancePaise: number;
  bills: BillingCycle[];
  collectedVia: ExitCollectionMethod;
  collectionOptions: { label: string; value: ExitCollectionMethod }[];
  customCharges: ExitCustomCharge[];
  /** Marked not refundable. */
  depositBlocked: boolean;
  fromDeposit: boolean;
  onCollectedVia: (method: ExitCollectionMethod) => void;
  onCustomCharges: (charges: ExitCustomCharge[]) => void;
  onError: (message: string) => void;
  onFromDeposit: (next: boolean) => void;
  open: OpenDamage[];
  propertyId: string;
  tenancyId: string;
  waived: Record<string, boolean>;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [raise, raiseState] = useRaiseDamageBillMutation();
  const [charge, chargeState] = useChargeDamageBillFromDepositMutation();
  const [moveBack, moveBackState] = useMoveDamageBillOffDepositMutation();
  const busy = raiseState.isLoading || chargeState.isLoading || moveBackState.isLoading;

  const [help, setHelp] = useState<keyof typeof HOW_IT_WORKS | null>(null);
  const [pending, setPendingNow] = useState<Pending | null>(null);
  const pendingSince = useRef(0);
  const setPending = (next: Pending | null) => {
    pendingSince.current = Date.now();
    setPendingNow(next);
  };
  // True once a dialog has been up long enough for its button to be a decision.
  const armed = () => Date.now() - pendingSince.current >= CONFIRM_ARMS_AFTER_MS;
  const [addingCharge, setAddingCharge] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const ticked = open.filter((entry) => !waived[entry.record.id]);
  const totalPaise = ticked.reduce((sum, entry) => sum + entry.amountPaise, 0);
  const noDeposit = balancePaise <= 0;
  const leftPaise = Math.max(balancePaise - (fromDeposit ? totalPaise : 0), 0);

  async function raiseBill(fromDepositPaise: number | null) {
    try {
      await raise({ fromDepositPaise, recordIds: ticked.map((entry) => entry.record.id), tenancyId }).unwrap();
      toast.success("Damage bill raised.");
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function chargeBill(bill: BillingCycle) {
    try {
      await charge({ billId: bill.id, tenancyId, version: bill.version }).unwrap();
      toast.success("Charged from the deposit.");
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function moveBill(bill: BillingCycle) {
    try {
      await moveBack({ billId: bill.id, tenancyId, version: bill.version }).unwrap();
      toast.success("Moved to the bill. The deposit is back.");
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  function pickDeposit() {
    if (fromDeposit) {
      setPending({ kind: "clearDeposit" });
      return;
    }
    if (depositBlocked) {
      onError("Mark the deposit refundable before using it for charges.");
      return;
    }
    if (noDeposit) {
      onError("There is no deposit left to charge against.");
      return;
    }
    setPending({ kind: totalPaise > balancePaise ? "split" : "deposit" });
  }

  // Cards inside the Exit charges card: a border, no shadow (user, 2026-10-31).
  const innerCard = {
    borderColor: colors.border,
    borderCurve: "continuous" as const,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: 12,
  };
  const rule = { backgroundColor: colors.border, height: 1 };
  const smallBold = { color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14, lineHeight: 19 };
  const subHeader = { color: colors.ink, fontFamily: fonts.sansBold, fontSize: 17, lineHeight: 23 };

  return (
    <>
      <View style={innerCard}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <Text style={subHeader}>Damage charges</Text>
          <HelpButton onPress={() => setHelp("charges")} title="Damage charges" />
          {open.length > 0 && bills.length === 0 ? (
            <Text selectable style={[type.metric, { color: colors.ink, flex: 1, fontSize: 20, lineHeight: 26, textAlign: "right" }]}>{formatMoneyPaise(totalPaise)}</Text>
          ) : null}
        </View>
        {bills.length === 0 && open.length === 0 ? (
          <Text style={[type.description, { color: colors.muted }]}>Nothing to charge.</Text>
        ) : null}

        {bills.map((bill) => {
          const onDeposit = depositOnBill(bill);
          const claimed = bill.status === "CONFIRMATION_PENDING";
          const canCharge = !claimed && bill.totalAmountPaise > 0 && (onDeposit === 0 || !noDeposit);
          const canMoveBack = !claimed && onDeposit > 0;
          const records = (bill.lineItems ?? []).filter((line) => !line.label.endsWith(" (from deposit)") && line.settlementAction !== "WAIVED").length;
          return (
            <View key={bill.id} style={{ gap: spacing.sm }}>
              <View style={rule} />
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                    <Text style={smallBold}>Damage bill</Text>
                    <StatePill
                      label={claimed ? "Awaiting confirmation" : bill.status === "OVERDUE" ? "Overdue" : "Unpaid"}
                      tone="warning"
                    />
                  </View>
                  <Text selectable style={[type.caption, { color: colors.muted }]}>
                    {`${bill.referenceCode} · ${records} record${records === 1 ? "" : "s"}`}
                  </Text>
                </View>
                <Text selectable style={smallBold}>{formatMoneyPaise(bill.totalAmountPaise + onDeposit)}</Text>
              </View>
              {/* Only a split has two figures to show. A whole bill is the one above. */}
              {onDeposit > 0 ? (
                <View style={{ backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: radii.card, gap: spacing.xs, padding: 12 }}>
                  <AmountRow danger label="Came off the deposit" value={`− ${formatMoneyPaise(onDeposit)}`} />
                  <AmountRow label="Left on the bill" value={formatMoneyPaise(bill.totalAmountPaise)} />
                </View>
              ) : null}
              {canMoveBack && canCharge ? (
                <View style={{ flexDirection: "row" }}>
                  <ActionButton compact disabled={busy} label="Move all to the bill" oneLine onPress={() => setPending({ bill, kind: "back" })} variant="secondary" />
                </View>
              ) : null}
              <View style={{ flexDirection: "row", gap: spacing.xs }}>
                {canCharge || canMoveBack ? (
                  <View style={{ flex: 1, flexDirection: "row" }}>
                    {canCharge ? (
                      <ActionButton
                        compact
                        disabled={busy || depositBlocked || noDeposit}
                        label="Use Deposit"
                        oneLine
                        onPress={() => setPending({ bill, kind: "charge" })}
                        variant="secondary"
                      />
                    ) : (
                      <ActionButton compact disabled={busy} label="Move all to the bill" oneLine onPress={() => setPending({ bill, kind: "back" })} variant="secondary" />
                    )}
                  </View>
                ) : null}
                <View style={{ flex: 1, flexDirection: "row" }}>
                  <ActionButton compact label="View bill" oneLine onPress={() => setViewing(bill.id)} variant="primary" />
                </View>
              </View>
            </View>
          );
        })}

        {open.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <View style={rule} />
            {/* With a bill above, the header's figure would read as the bill's, so the total sits here. */}
            {bills.length > 0 ? <AmountRow label="Damage total" value={formatMoneyPaise(totalPaise)} /> : null}
            {fromDeposit ? (
              <View style={{ backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: radii.card, gap: 4, padding: 12 }}>
                <Text selectable style={[type.body, { color: colors.ink, fontSize: 13, lineHeight: 19 }]}>
                  {`Damage charges of ${formatMoneyPaise(totalPaise)} have been adjusted from the deposit balance.`}
                </Text>
                <Text selectable style={smallBold}>{`Current balance: ${formatMoneyPaise(leftPaise)}`}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              <ModeTile
                disabled={totalPaise <= 0 || depositBlocked}
                label="Use Deposit"
                onPress={pickDeposit}
                selected={fromDeposit}
              />
              <ModeTile
                disabled={totalPaise <= 0 || busy}
                label="Raise bill"
                onPress={() => setPending({ kind: "bill" })}
                selected={false}
              />
            </View>
          </View>
        ) : null}
      </View>

      <View style={innerCard}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <Text style={subHeader}>Other charges</Text>
          <HelpButton onPress={() => setHelp("other")} title="Other charges" />
          <View style={{ flex: 1 }} />
          <AnimatedPressable
            accessibilityLabel="Add other charge"
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => setAddingCharge(true)}
            style={{
              alignItems: "center",
              borderColor: colors.primary,
              borderCurve: "continuous",
              borderRadius: 10,
              borderWidth: 1,
              flexDirection: "row",
              gap: 4,
              minHeight: 32,
              paddingHorizontal: spacing.sm,
            }}
          >
            <Plus color={colors.primary} size={14} strokeWidth={2.4} />
            <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>Add</Text>
          </AnimatedPressable>
        </View>
        {customCharges.length > 0 ? <View style={rule} /> : null}
        {customCharges.map((row, index) => (
          <View key={`${row.reason}-${index}`} style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 36 }}>
            <View style={{ alignItems: "center", flex: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              <Text selectable style={smallBold}>{row.reason}</Text>
              <StatePill label="Recorded paid" tone="success" />
            </View>
            <Text selectable style={smallBold}>{formatMoneyPaise(row.amountPaise)}</Text>
            <AnimatedPressable
              accessibilityLabel={`Remove ${row.reason}`}
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setPending({ at: index, kind: "removeOther" })}
            >
              <Trash2 color={colors.danger} size={17} strokeWidth={2.2} />
            </AnimatedPressable>
          </View>
        ))}
        {customCharges.length > 1 ? (
          <AmountRow label="Other charges total" value={formatMoneyPaise(customCharges.reduce((sum, row) => sum + row.amountPaise, 0))} />
        ) : null}
      </View>

      {help ? <PointsSheet onClose={() => setHelp(null)} topic={help} /> : null}

      {pending?.kind === "deposit" ? (
        <ConfirmDialog
          bullets={[
            `${formatMoneyPaise(totalPaise)} comes off the deposit when the tenancy ends.`,
            `${formatMoneyPaise(Math.max(balancePaise - totalPaise, 0))} would remain.`,
          ]}
          confirmLabel="Deduct"
          footnote="Nothing moves until you end the tenancy."
          message="The ticked damage will be taken from this tenant's deposit."
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (!armed()) return;
            setPending(null);
            onFromDeposit(true);
          }}
          title="Deduct from deposit?"
        />
      ) : null}

      {pending?.kind === "clearDeposit" ? (
        <ConfirmDialog
          bullets={["The ticked damage goes back to needing a collection mode."]}
          confirmLabel="Stop using deposit"
          message="The deposit will not be charged for this damage."
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (!armed()) return;
            setPending(null);
            onFromDeposit(false);
          }}
          title="Stop using the deposit?"
        />
      ) : null}

      {pending?.kind === "removeOther" ? (
        <ConfirmDialog
          bullets={[`${customCharges[pending.at]?.reason ?? "This charge"} is taken off this exit.`]}
          confirmLabel="Remove"
          destructive
          message="It will not be billed."
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (!armed()) return;
            const { at } = pending;
            setPending(null);
            onCustomCharges(customCharges.filter((_, index) => index !== at));
          }}
          title="Remove this charge?"
        />
      ) : null}

      {pending?.kind === "split" ? (
        <ConfirmDialog
          bullets={[
            `${formatMoneyPaise(balancePaise)} comes off the deposit now.`,
            `${formatMoneyPaise(totalPaise - balancePaise)} is raised now as a one-off damage bill, unpaid.`,
            "The checkout stays blocked until that bill is cleared.",
          ]}
          confirmLabel="Split charges"
          footnote="You can move it all to the bill later."
          message="The damage is more than the deposit, so it is split across both."
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (!armed()) return;
            setPending(null);
            void raiseBill(balancePaise);
          }}
          title="Split these charges?"
        />
      ) : null}

      {pending?.kind === "bill" ? (
        <ConfirmDialog
          bullets={[
            `${formatMoneyPaise(totalPaise)} is raised now as a one-off damage bill.`,
            "The checkout stays blocked until that bill is cleared.",
          ]}
          confirmLabel="Raise bill"
          message="The ticked damage will be billed to this tenant."
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (!armed()) return;
            setPending(null);
            void raiseBill(null);
          }}
          title="Raise this bill?"
        />
      ) : null}

      {pending?.kind === "charge" ? (
        <ConfirmDialog
          bullets={
            pending.bill.totalAmountPaise > balancePaise
              ? [
                  `${formatMoneyPaise(balancePaise)} comes off the deposit now.`,
                  `${formatMoneyPaise(pending.bill.totalAmountPaise - balancePaise)} stays on the bill.`,
                ]
              : [
                  `${formatMoneyPaise(pending.bill.totalAmountPaise)} comes off the deposit now.`,
                  "The bill is cleared and this cannot be moved back.",
                ]
          }
          confirmLabel="Charge"
          message={`${pending.bill.referenceCode} will be charged from this tenant's deposit.`}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (!armed()) return;
            const { bill } = pending;
            setPending(null);
            void chargeBill(bill);
          }}
          title="Charge from deposit?"
        />
      ) : null}

      {pending?.kind === "back" ? (
        <ConfirmDialog
          bullets={[
            `${formatMoneyPaise(depositOnBill(pending.bill))} goes back to the deposit.`,
            `The bill becomes ${formatMoneyPaise(pending.bill.totalAmountPaise + depositOnBill(pending.bill))}.`,
          ]}
          confirmLabel="Move all"
          message="The deposit is left alone and the whole amount is on the bill."
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (!armed()) return;
            const { bill } = pending;
            setPending(null);
            void moveBill(bill);
          }}
          title="Move all to the bill?"
        />
      ) : null}

      {addingCharge ? (
        <AddOtherChargeSheet
          method={collectedVia}
          onAdd={(row) => {
            onCustomCharges([...customCharges, row]);
            setAddingCharge(false);
          }}
          onCancel={() => setAddingCharge(false)}
          onMethod={onCollectedVia}
          options={collectionOptions}
        />
      ) : null}

      {viewing ? (
        <DamageBillSheet onClose={() => setViewing(null)} propertyId={propertyId} share={{ billId: viewing, tenancyId }} />
      ) : null}
    </>
  );
}

function HelpButton({ onPress, title }: { onPress: () => void; title: string }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable accessibilityLabel={`How ${title} works`} accessibilityRole="button" hitSlop={10} onPress={onPress}>
      <CircleHelp color={colors.muted} size={16} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

/** The numbered How it works sheet, like the app's other ones. */
function PointsSheet({ onClose, topic }: { onClose: () => void; topic: keyof typeof HOW_IT_WORKS }) {
  const { points, title } = HOW_IT_WORKS[topic];
  return (
    <HowItWorksSheet
      eyebrow={title}
      onClose={onClose}
      steps={points.map((point) => ({ body: point, title: point }))}
      title={title}
    />
  );
}

function AmountRow({ danger, label, value }: { danger?: boolean; label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flexShrink: 1, fontSize: 13, lineHeight: 18 }]}>{label}</Text>
      <Text selectable style={{ color: danger ? colors.danger : colors.ink, fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 18 }}>{value}</Text>
    </View>
  );
}

function ModeTile({ disabled, label, onPress, selected }: { disabled?: boolean; label: string; onPress: () => void; selected: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.primary : disabled ? colors.surfaceSunken : colors.surface,
        borderColor: selected ? colors.primary : colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        justifyContent: "center",
        minHeight: 44,
      }}
    >
      <Text style={{ color: selected ? colors.onPrimary : disabled ? colors.muted : colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{label}</Text>
    </AnimatedPressable>
  );
}

/** Anything that is not damage. Recorded paid, so how it was collected is asked here. */
function AddOtherChargeSheet({
  method,
  onAdd,
  onCancel,
  onMethod,
  options,
}: {
  method: ExitCollectionMethod;
  onAdd: (charge: ExitCustomCharge) => void;
  onCancel: () => void;
  onMethod: (method: ExitCollectionMethod) => void;
  options: { label: string; value: ExitCollectionMethod }[];
}) {
  const [help, setHelp] = useState(false);
  const [reason, setReason] = useState("");
  const [rupees, setRupees] = useState("");
  const form = useFormErrors<"reason" | "rupees">();
  const amountPaise = rupeesToPaise(rupees) ?? 0;

  function submit() {
    const cleared = form.validate({
      ...(reason.trim() ? {} : { reason: "Say what this charge is for." }),
      ...(amountPaise > 0 ? {} : { rupees: "Enter an amount greater than zero." }),
    });
    if (cleared) {
      onAdd({ amountPaise, reason: reason.trim() });
    }
  }

  return (
    <SheetShell
      animated
      footer={
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton label="Cancel" onPress={onCancel} variant="secondary" />
          <ActionButton disabled={form.blocked} label="Add charge" onPress={submit} />
        </View>
      }
      besideTitle={<HelpButton onPress={() => setHelp(true)} title="Other charges" />}
      onClose={onCancel}
      size="content"
      title="Add other charge"
    >
      <FormInput
        error={form.errors.reason}
        label="Reason"
        onChangeText={(text) => {
          setReason(text);
          form.clearField("reason");
        }}
        placeholder="e.g. Lost room key"
        required
        value={reason}
      />
      <FormInput
        error={form.errors.rupees}
        keyboardType="number-pad"
        label="Amount"
        onChangeText={(text) => {
          setRupees(text);
          form.clearField("rupees");
        }}
        placeholder="0"
        prefix="₹"
        required
        value={rupees}
      />
      <SingleOptionPicker<ExitCollectionMethod>
        centered
        emptyLabel="Select how it was paid"
        label="Payment method"
        onChange={onMethod}
        optionIcon={(value) => <PaymentMethodIcon method={value} />}
        options={options}
        required
        showIcon={false}
        title="Payment method"
        value={method}
      />
      {help ? <PointsSheet onClose={() => setHelp(false)} topic="other" /> : null}
    </SheetShell>
  );
}
