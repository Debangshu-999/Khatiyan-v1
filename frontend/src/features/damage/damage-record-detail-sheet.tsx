import { useState } from "react";
import { Text, View } from "react-native";
import { Pencil, Receipt, ReceiptText } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { DeleteIcon } from "@/components/delete-icon";
import { FitText } from "@/components/fit-text";
import { ImageCarousel } from "@/components/image-carousel";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { BillReceiptSheet } from "@/features/billing/bill-receipt-sheet";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, ConfirmDialog, formatMoneyPaise } from "@/features/owner/owner-ui";
import { ItemIcon } from "@/features/property/item-icon";
import { DamageLevelPill } from "@/features/tenancy/damage-level";
import { cardName } from "@/lib/person-name";
import { useAppSelector } from "@/store/hooks";
import { useListManagedTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import {
  useChargeDamageRecordMutation,
  useDeleteDamageRecordMutation,
  type DamageRecord,
  type DamageRecordShare,
} from "@/store/services/damage-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { StatePill, dayMonth, damageBillState, damageRecordName, damageResponsible } from "./damage-record-card";

const RemoveIcon = (props: React.ComponentProps<typeof DeleteIcon>) => <DeleteIcon {...props} inheritColor />;

/** Compact bill status for the share row. */
function billPill(share: DamageRecordShare): { label: string; tone: "muted" | "warning" | "success" } {
  if (share.waived) return { label: "Waived", tone: "muted" };
  if (share.depositPaise >= share.amountPaise && share.amountPaise > 0) return { label: "From deposit", tone: "success" };
  if (!share.billId || share.billStatus === "CANCELLED") return { label: "No bill", tone: "muted" };
  if (share.billStatus === "PAID") return { label: "Paid", tone: "success" };
  return { label: "Unpaid", tone: "warning" };
}

/**
 * A damage record's facts and its bills, with what can still be done to it
 * (2026-10-29): Edit and Delete while no bill from it is paid, Charge while it
 * is not charged and someone answers for it. The item with its icon and level,
 * the room, who and when in a row of their own, the note in a box, each
 * share's bill in a pill with View bill once there is one.
 */
export function DamageRecordDetailSheet({
  canManage,
  onClose,
  onEdit,
  propertyId,
  record,
}: {
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  propertyId: string;
  record: DamageRecord;
}) {
  const { colors, fonts, type } = useTheme();
  const account = useAppSelector((state) => state.auth.user);
  const toast = useToast();
  const [charge, chargeState] = useChargeDamageRecordMutation();
  const [remove, removeState] = useDeleteDamageRecordMutation();
  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState<DamageRecordShare | null>(null);
  const [choosingBill, setChoosingBill] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const state = damageBillState(record);
  const changeable = canManage && !record.locked && record.status === "OPEN";
  const chargeable = canManage && record.responsibility !== "NONE" && !record.charged;
  const unpaidBills = record.shares.filter((share) => share.billId && share.billStatus !== "CANCELLED" && share.billStatus !== "PAID").length;
  const billedShares = record.shares.filter((share) => share.billId && share.billStatus !== "CANCELLED");
  const recordedBy = account?.id && record.createdByUserId === account.id ? "Self" : record.createdByName ? cardName(record.createdByName) : "—";

  async function chargeIt() {
    try {
      await charge({ propertyId, recordId: record.id, version: record.version }).unwrap();
      toast.success(`${record.code} billed.`);
      onClose();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  }

  async function deleteIt() {
    setConfirming(false);
    try {
      await remove({ propertyId, recordId: record.id, version: record.version }).unwrap();
      toast.success(`${record.code} deleted.`);
      onClose();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  }

  const facts: { label: string; value: string }[] = [
    { label: "Room", value: record.roomLabel ?? "—" },
    { label: "Responsible", value: damageResponsible(record) },
    { label: "Recorded", value: dayMonth(record.createdAt) },
  ];

  return (
    <SheetShell
      contentMaxSize="tall"
      footer={(canManage && (changeable || chargeable)) || billedShares.length > 0 ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {changeable ? (
            <ActionButton disabled={removeState.isLoading} icon={RemoveIcon} label="Delete" onPress={() => setConfirming(true)} variant="dangerFilled" />
          ) : null}
          {chargeable ? (
            <ActionButton
              disabled={chargeState.isLoading}
              icon={Receipt}
              label={chargeState.isLoading ? "Charging…" : "Charge now"}
              onPress={() => void chargeIt()}
            />
          ) : null}
          {billedShares.length > 0 ? (
            <ActionButton
              icon={ReceiptText}
              label={billedShares.length === 1 ? "View bill" : "View bills"}
              onPress={() => billedShares.length === 1 ? setViewing(billedShares[0]) : setChoosingBill(true)}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : undefined}
      footerSpacing={spacing.xs}
      headerRight={changeable ? (
        <AnimatedPressable
          accessibilityLabel="Edit damage record"
          accessibilityRole="button"
          hitSlop={6}
          onPress={onEdit}
          style={{ alignItems: "center", borderColor: colors.primary, borderRadius: radii.card, borderWidth: 1, flexDirection: "row", flexShrink: 0, gap: 4, minHeight: 32, paddingHorizontal: 8 }}
        >
          <Pencil color={colors.primary} size={14} strokeWidth={2.2} />
          <Text selectable={false} style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12 }}>Edit</Text>
        </AnimatedPressable>
      ) : undefined}
      onClose={onClose}
      size="content"
      title={record.code}
    >
      <View style={{ gap: spacing.md }}>
        {/* The item with its icon, its level a little lower, and the money state (user, 2026-10-29). */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <ItemIcon color={colors.inkSoft} name={record.itemName} size={22} />
          <FitText style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.display, fontSize: 20 }}>{damageRecordName(record)}</FitText>
          <View style={{ marginTop: 4 }}><DamageLevelPill level={record.damageLevel} /></View>
          <View style={{ flex: 1 }} />
          <StatePill label={state.label} tone={state.tone} />
        </View>

        {record.photoUrls.length > 0 || record.note ? (
          <View style={{ alignItems: "stretch", flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
            {record.photoUrls.length > 0 ? (
              <View style={{ flexShrink: 0, width: 112 }}>
                <ImageCarousel height={105} images={record.photoUrls} radius={radii.card} />
              </View>
            ) : null}
            {record.note ? <View style={{ flex: 1, minWidth: 0 }}><DamageNote minHeight={record.photoUrls.length > 0 ? 105 : undefined} note={record.note} /></View> : null}
          </View>
        ) : null}

        {/* Room, who and when, each under its own label. */}
        <View style={{ borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, flexDirection: "row" }}>
          {facts.map((fact, index) => (
            <View
              key={fact.label}
              style={{ borderLeftColor: colors.border, borderLeftWidth: index === 0 ? 0 : 1, flex: index === 1 ? 1.4 : 1, gap: 2, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm }}
            >
              <Text style={[type.caption, { color: colors.muted }]}>{fact.label}</Text>
              <FitText style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{fact.value}</FitText>
            </View>
          ))}
        </View>
        <Text selectable={false} style={[type.caption, { color: colors.muted, marginTop: -spacing.xs }]}>Recorded by: {recordedBy}</Text>

        {record.responsibility === "NONE" ? null : (
          <View style={{ gap: spacing.md }}>
            {record.shares.map((share) => (
              <DamageShareRow key={share.tenancyId} share={share} />
            ))}
          </View>
        )}

        {record.locked ? (
          <Text style={[type.caption, { color: colors.muted }]}>A bill from this record is paid, so it can no longer change.</Text>
        ) : null}
      </View>

      {viewing ? <DamageBillSheet onClose={() => setViewing(null)} propertyId={propertyId} share={viewing} /> : null}
      {choosingBill ? (
        <SheetShell onClose={() => setChoosingBill(false)} size="content" title="Choose a bill">
          {billedShares.map((share) => (
            <View key={share.tenancyId} style={{ flexDirection: "row" }}>
              <ActionButton
                label={`${cardName(share.tenantName)} · ${formatMoneyPaise(share.amountPaise)}`}
                onPress={() => { setChoosingBill(false); setViewing(share); }}
                variant="secondary"
              />
            </View>
          ))}
        </SheetShell>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          confirmLabel="Delete"
          destructive
          message={unpaidBills > 0
            ? `Delete ${record.code}? Its unpaid bill${unpaidBills === 1 ? " is" : "s are"} cancelled and the tenant is told.`
            : `Delete ${record.code}? The tenant is told it was removed.`}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void deleteIt()}
          title="Delete this damage record?"
        />
      ) : null}
      {serverError ? <AlertModal message={serverError} onClose={() => setServerError(null)} /> : null}
    </SheetShell>
  );
}

/** Read-only note, with the same boundary label treatment as the app's notched fields. */
function DamageNote({ minHeight, note }: { minHeight?: number; note: string }) {
  const { colors, fonts, type } = useTheme();
  return <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 8,
    borderWidth: 1.5, minHeight, padding: spacing.md }}>
    <View pointerEvents="none" style={{ left: 10, position: "absolute", top: -9 }}>
      <View style={{ backgroundColor: colors.surface, height: 8.25, left: 0, position: "absolute", right: 0, top: 0 }} />
      <View style={{ backgroundColor: colors.surfaceSunken, bottom: 0, left: 0, position: "absolute", right: 0, top: 8.25 }} />
      <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.3, lineHeight: 16, paddingHorizontal: 5 }}>Damage note</Text>
    </View>
    <Text selectable={false} style={[type.description, { color: colors.inkSoft }]}>{note}</Text>
  </View>;
}

/** Amount and right-aligned bill status; the responsible person is already named above. */
function DamageShareRow({ share }: { share: DamageRecordShare }) {
  const { colors, fonts, type } = useTheme();
  const pill = billPill(share);
  return <View style={{ borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, padding: spacing.md }}>
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
      <Text selectable={false} style={[type.description, { color: colors.muted }]}>Amount:</Text>
      <FitText selectable={false} numberOfLines={1} style={{ color: colors.ink, flex: 1, minWidth: 0, fontFamily: fonts.sansBold, fontSize: 15, fontVariant: ["tabular-nums"] }}>{formatMoneyPaise(share.amountPaise)}</FitText>
      <View style={{ flexShrink: 0, alignItems: "flex-end" }}><StatePill label={pill.label} tone={pill.tone} /></View>
    </View>
  </View>;
}

/** A share's bill, as the bill screens show it, in its own modal (user, 2026-10-29). */
export function DamageBillSheet({ onClose, propertyId, share }: { onClose: () => void; propertyId: string; share: Pick<DamageRecordShare, "billId" | "tenancyId"> }) {
  const account = useAppSelector((state) => state.auth.user);
  const cycles = useListManagedTenancyBillingCyclesQuery(share.tenancyId);
  const properties = useListMyPropertiesQuery();
  const property = properties.data?.find((item) => item.id === propertyId) ?? null;
  const bill = cycles.data?.find((cycle) => cycle.id === share.billId);
  // Match Billing's letterhead: never print a manager's personal contact.
  const isOwner = Boolean(account && property && property.ownerId === account.id);
  const contact = {
    email: isOwner ? account?.email ?? null : null,
    phone: isOwner ? account?.phone ?? null : null,
  };
  if (!bill) return null;
  return <BillReceiptSheet contact={contact} cycle={bill} onClose={onClose} property={property} />;
}
