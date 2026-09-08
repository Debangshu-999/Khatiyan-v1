import { useState } from "react";
import { Text, View } from "react-native";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ChevronDown, ChevronRight, Clock3, Landmark, Minus, Plus, UserRound } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

import { AnimatedPressable } from "@/components/animated-pressable";
import { HeaderNote } from "@/components/header-note";
import { PickerOptionRow } from "@/components/picker-option-row";
import { SheetShell } from "@/components/sheet-shell";
import { BillingStatusBadge } from "@/features/owner/bill-views";
import { ActionButton, NoticeBar, ViewOnlyChip, formatMoneyPaise, humanizeToken } from "@/features/owner/owner-ui";
import { isDepositCredit, type DepositAccount, type DepositMovement } from "@/store/services/billing-api";
import type { TenancySummary } from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type DepositMovementFilter = "ALL" | DepositMovement["type"];
const MOVEMENT_FILTERS: { label: string; value: DepositMovementFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Additions", value: "ADDITION" },
  { label: "Deductions", value: "DEDUCTION" },
  { label: "Settlements", value: "SETTLEMENT" },
];

export function filterDepositMovements(movements: DepositMovement[], filter: DepositMovementFilter) {
  return movements
    .filter((movement) => filter === "ALL" || movement.type === filter)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export function formatDepositDate(value: string, includeTime = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", includeTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" }).format(date);
}

/**
 * The heading for one tenant's deposit account.
 *
 * <p>
 * No back arrow. The app dropped in-screen back controls app-wide — the device
 * button is the way back, and here it is handled: this view is a state of the
 * deposit manager rather than a route of its own, so the handler closes the
 * account and returns to the picker. The tenant card below is the visible way
 * to change tenancy.
 */
export function DepositAccountHeader({ canManage, tenantName }: { canManage: boolean; tenantName: string | null }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        numberOfLines={1}
        style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 29, letterSpacing: -0.7, lineHeight: 38 }}
      >
        Deposit <Text style={{ color: colors.accent }}>account</Text>
      </Text>
      {/* HeaderNote, like every other screen's description: the accent rule and
          the tracked italic, rather than plain body copy that happened to sit
          under a heading.

          Named, not "your tenant's" — the owner opened this account on purpose
          and the name is the confirmation they landed on the right one, so it
          carries the weight while the possessive stays in the sentence's own
          voice. */}
      <HeaderNote>
        <>
          View{" "}
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontStyle: "italic" }}>
            {tenantName ?? "this tenant"}
          </Text>
          ’s deposit balance, manage transactions and track the history.
        </>
      </HeaderNote>
      {!canManage ? <ViewOnlyChip /> : null}
    </View>
  );
}

export function DepositAccountTenantCard({ onPress, tenancy }: { onPress: () => void; tenancy: TenancySummary }) {
  const { colors, fonts, type } = useTheme();
  const active = tenancy.status === "ACTIVE";
  const onNotice = tenancy.status === "ON_NOTICE" || tenancy.status === "ON_PREMATURE_NOTICE";
  const statusColor = active ? colors.jade : onNotice ? colors.warningText : colors.muted;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={"Choose another tenancy. Current tenant: " + (tenancy.tenantName ?? "Unnamed tenant") + ", " + humanizeToken(tenancy.status)}
      onPress={onPress}
      style={{
        // The picker card's design exactly, so choosing a tenancy and having
        // chosen one are the same object in two states rather than two
        // differently-coloured cards.
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        elevation: 1,
        flexDirection: "row",
        gap: spacing.md,
        // Shorter than the picker's 126. That card carries a two-line
        // instruction; this one is a name, a code and a pill, and at 126 it
        // was mostly empty space above the balance it introduces.
        minHeight: 96,
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
      <View style={{ alignItems: "center", backgroundColor: "#E0ECFF", borderRadius: 26, height: 48, justifyContent: "center", width: 48 }}>
        <UserRound color={colors.primary} size={27} strokeWidth={1.9} />
      </View>
      {/* Name over reference, and nothing else in the column — so the pill can
          leave it entirely. */}
      <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 18, lineHeight: 25 }}
        >
          {tenancy.tenantName ?? "Unnamed tenant"}
        </Text>
        <Text selectable style={[type.caption, { color: colors.muted, fontSize: 12, lineHeight: 18 }]}>
          {tenancy.referenceCode}
        </Text>
      </View>

      {/* The billing chip, exactly as the deposit history rows use it — glyph,
          soft tint, sentence case. A bare colour dot said the same thing in a
          different vocabulary, so the same tenancy looked like two kinds of
          state depending on which deposit screen you reached it from.

          A sibling of the column, not a passenger in its first line: the card
          centres its children, so the chip and the chevron sit on one axis
          rather than the chip riding the name's baseline. */}
      {/* Wrapped, because the badge sets alignSelf:"flex-start" on itself —
          which it needs inside a column, and which overrode this row's
          alignItems:"center" and pinned the chip to the top of the card. The
          wrapper is what the row centres; the badge then aligns within a box
          only as tall as itself. */}
      <View style={{ flexShrink: 0 }}>
        <BillingStatusBadge
          background={active ? colors.successSoft : onNotice ? colors.warningSoft : colors.neutralSoft}
          color={statusColor}
          icon={active ? Landmark : onNotice ? Clock3 : CheckCircle2}
          label={humanizeToken(tenancy.status)}
        />
      </View>
      <ChevronRight color={colors.muted} size={20} strokeWidth={2} />
    </AnimatedPressable>
  );
}

/**
 * One deposit account, whole: the balance, what can be done to it, and every
 * movement behind it.
 *
 * <p>
 * The action callbacks are optional, and a caller that passes none gets no
 * action row at all. That is the tenant's view of their own deposit — adding,
 * deducting and settling are the owner's, and rendering them greyed out would
 * offer a tenant three controls that are not theirs and never will be, which is
 * a different message from not offering them.
 */
export function DepositAccountDetail({
  busy, canManage, deposit, onAdd, onDeduct, onSettle,
}: {
  busy: boolean;
  canManage: boolean;
  deposit: DepositAccount;
  onAdd?: () => void;
  onDeduct?: () => void;
  onSettle?: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [filter, setFilter] = useState<DepositMovementFilter>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const pending = deposit.status === "PENDING_SETTLEMENT";
  const settled = deposit.status === "SETTLED";
  const payable = deposit.payableAtExit;
  const movements = filterDepositMovements(deposit.movements, filter);
  const filterLabel = MOVEMENT_FILTERS.find((option) => option.value === filter)?.label ?? "All";

  return (
    <View style={{ gap: spacing.md }}>
      {pending ? (
        <NoticeBar
          message={payable == null
            ? "No payability decision was recorded when this tenancy ended, so this deposit cannot be settled here."
            : payable
              ? "Decided refundable at exit. " + formatMoneyPaise(deposit.currentBalancePaise) + " to return."
              : "Decided not refundable at exit. Nothing is paid out."}
          title="Awaiting settlement"
          tone="warning"
        />
      ) : null}

      <View style={{ borderColor: "#D5E5FF", borderRadius: 16, borderWidth: 1, overflow: "hidden" }}>
        <LinearGradient colors={["#F8FBFF", "#EEF5FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={{ gap: spacing.xs, padding: spacing.lg }}>
            <Text style={[type.eyebrow, { color: colors.muted, fontSize: 10, letterSpacing: 0.45 }]}>
              Current deposit balance
            </Text>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.55}
                numberOfLines={1}
                selectable
                style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 38, letterSpacing: -1, lineHeight: 50, minWidth: 0 }}
              >
                {/* The symbol gets its own tracking. The headline runs at
                    letterSpacing -1 to keep a long figure on one line, which
                    also pulled the rupee sign hard against the first digit —
                    at 38pt that read as one glyph rather than two. */}
                <Text style={{ letterSpacing: 3 }}>₹</Text>
                {formatMoneyPaise(deposit.currentBalancePaise).replace("₹", "")}
              </Text>
              <DepositBalanceArtwork />
            </View>
            {/* Account status is separate from the tenant's status above. */}
            {pending || settled ? (
              <Text style={[type.caption, { color: pending ? colors.warningText : colors.muted }]}>
                {humanizeToken(deposit.status)}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "center", backgroundColor: "rgba(255,255,255,0.45)", flexDirection: "row", padding: spacing.md }}>
            <View style={{ flex: 1, gap: 2, paddingRight: spacing.sm }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 17, lineHeight: 23 }}>
                {deposit.movements.length}
              </Text>
              <Text style={[type.caption, { color: colors.muted, fontSize: 11, lineHeight: 17 }]}>Total movements</Text>
            </View>
            <View style={{ backgroundColor: "#D8E5F7", height: 28, width: 1 }} />
            <View style={{ flex: 1, gap: 2, paddingLeft: spacing.lg }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 13, lineHeight: 20 }}>
                {formatDepositDate(deposit.updatedAt)}
              </Text>
              <Text style={[type.caption, { color: colors.muted, fontSize: 11, lineHeight: 17 }]}>Last updated</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {settled ? null : pending ? (
        onSettle ? (
          <ActionButton
            disabled={busy || !canManage || payable == null}
            label={payable === false ? "Close account" : "Settle deposit"}
            onPress={onSettle}
            variant="danger"
          />
        ) : null
      ) : onAdd && onDeduct ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <DepositAmountButton disabled={busy || !canManage} mode="add" onPress={onAdd} />
          <DepositAmountButton disabled={busy || !canManage} mode="deduct" onPress={onDeduct} />
        </View>
      ) : null}

      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between", marginTop: spacing.md }}>
        <Text style={{ color: colors.ink, flexGrow: 1, fontFamily: fonts.display, fontSize: 17, letterSpacing: -0.3, lineHeight: 24 }}>
          Transaction history
        </Text>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={"Filter transactions: " + filterLabel}
          accessibilityState={{ expanded: filterOpen }}
          onPress={() => setFilterOpen(true)}
          style={{ alignItems: "center", backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 38, paddingHorizontal: 13, paddingVertical: 7 }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 12 }}>{filterLabel}</Text>
          <ChevronDown color={colors.muted} size={16} strokeWidth={2} />
        </AnimatedPressable>
      </View>

      <View style={{ gap: spacing.sm }}>
        {movements.map((movement) => <DepositMovementRow key={movement.id} movement={movement} />)}
      </View>

      <View style={{ alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.lg }}>
        <DepositHistoryArtwork size={82} />
        <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 16, lineHeight: 23, textAlign: "center" }}>
          {movements.length > 0 ? "No more transactions" : filter === "ALL" ? "No transactions yet" : "No matching transactions"}
        </Text>
        <Text style={[type.body, { color: colors.muted, fontSize: 12, lineHeight: 19, maxWidth: 280, textAlign: "center" }]}>
          {filter !== "ALL" && movements.length === 0
            ? "Try another filter to see this account’s transactions."
            : settled
              ? "This deposit account is settled. Its transaction history stays available here."
              : "You’ll see new deposit transactions here once they’re added."}
        </Text>
      </View>

      {filterOpen ? (
        <SheetShell onClose={() => setFilterOpen(false)} title="Transaction type">
          <View>
            {MOVEMENT_FILTERS.map((option, index) => (
              <PickerOptionRow
                first={index === 0}
                key={option.value}
                label={option.label}
                selected={filter === option.value}
                onPress={() => {
                  setFilter(option.value);
                  setFilterOpen(false);
                }}
              />
            ))}
          </View>
        </SheetShell>
      ) : null}
    </View>
  );
}

function DepositAmountButton({ disabled, mode, onPress }: { disabled: boolean; mode: "add" | "deduct"; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const add = mode === "add";
  const Icon = add ? Plus : Minus;
  const foreground = disabled ? colors.muted : add ? colors.onPrimary : colors.primary;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ alignItems: "center", backgroundColor: disabled ? colors.surfaceSunken : add ? colors.primary : "#E9F1FF", borderRadius: 12, flex: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 48, paddingHorizontal: 10, paddingVertical: spacing.sm }}
    >
      <Icon color={foreground} size={19} strokeWidth={2} />
      <Text style={{ color: foreground, flexShrink: 1, fontFamily: fonts.sansSemiBold, fontSize: 12, lineHeight: 18, textAlign: "center" }}>
        {add ? "Add Amount" : "Deduct Amount"}
      </Text>
    </AnimatedPressable>
  );
}

export function DepositMovementRow({ movement }: { movement: DepositMovement }) {
  const { colors, fonts, type } = useTheme();
  const credit = isDepositCredit(movement.type);
  const Icon = credit ? ArrowUpFromLine : ArrowDownToLine;
  const color = credit ? colors.jade : colors.danger;
  return (
    <View style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 74, padding: spacing.md }}>
      <View style={{ alignItems: "center", backgroundColor: credit ? colors.successSoft : colors.dangerSoft, borderRadius: 21, height: 38, justifyContent: "center", width: 38 }}>
        <Icon color={color} size={22} strokeWidth={2} />
      </View>
      <View style={{ alignItems: "center", columnGap: spacing.sm, flex: 1, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", minWidth: 0, rowGap: spacing.xs }}>
        <View style={{ flexBasis: 120, flexGrow: 1, gap: 3, minWidth: 0 }}>
          <Text selectable style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 13, lineHeight: 19 }}>
            {movement.reason || humanizeToken(movement.type)}
          </Text>
          <Text style={[type.caption, { color: colors.muted, fontSize: 10, lineHeight: 16 }]}>
            {formatDepositDate(movement.createdAt, true)}
          </Text>
        </View>
        <Text selectable style={{ color, flexShrink: 1, fontFamily: fonts.sansSemiBold, fontSize: 14, lineHeight: 20, maxWidth: "100%" }}>
          {credit ? "+ " : "− "}{formatMoneyPaise(movement.amountPaise)}
        </Text>
      </View>
    </View>
  );
}

/** Small vector illustrations stay crisp at the card's display size. */
function DepositBalanceArtwork() {
  return (
    <Svg accessible={false} width={54} height={54} viewBox="0 0 80 80">
      <Path d="M8 19V54C8 70 50 70 50 54V19" fill="#86B1F8" />
      <Ellipse cx={29} cy={19} rx={21} ry={10} fill="#93BEFF" stroke="#F5FAFF" strokeWidth={2} />
      <Path d="M8 32C8 46 50 46 50 32M8 45C8 59 50 59 50 45" fill="none" stroke="#F5FAFF" strokeWidth={3} />
      <Path d="M40 46V65C40 78 76 78 76 65V46" fill="#76A6F1" stroke="#F5FAFF" strokeWidth={2} />
      <Ellipse cx={58} cy={46} rx={18} ry={9} fill="#98C0FF" stroke="#F5FAFF" strokeWidth={2} />
      <Path d="M40 58C40 70 76 70 76 58" fill="none" stroke="#F5FAFF" strokeWidth={3} />
    </Svg>
  );
}

/**
 * The deposit module's empty-state mark.
 *
 * <p>
 * Exported so every deposit screen shows the same thing when it has nothing —
 * the manager, the history list and the transaction list were each falling back
 * to a different lucide glyph, so "no deposits" looked like three unrelated
 * conditions.
 *
 * <p>
 * Takes no props on purpose: it goes into {@code EmptyState}'s `icon` slot,
 * which passes a colour and a size that a two-tone illustration has no use for.
 */
export function DepositHistoryArtwork({ size = 96 }: { size?: number | string }) {
  const box = typeof size === "number" ? size : Number(size) || 96;
  return (
    <Svg accessible={false} width={box} height={box} viewBox="0 0 100 100">
      <Rect x={14} y={8} width={61} height={78} rx={15} fill="#E7F0FF" />
      <Path d="M30 31H53M30 44H53M30 57H43" stroke="#8EB5F1" strokeWidth={4} strokeLinecap="round" />
      <Circle cx={75} cy={72} r={18} fill="#6796E0" />
      <Path d="M75 61V72L82 77" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
