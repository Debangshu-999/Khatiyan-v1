import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Clock3, Landmark, Minus, Plus, UserRound } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

import { CARD_STATUS_ROW, NAME_UNDER_STATUS, cardText, smallerCardText } from "@/components/card-name-row";
import { AnimatedPressable } from "@/components/animated-pressable";
import { DepositMovementIcon } from "@/components/deposit-movement-icons";
import { ScreenHeader } from "@/components/screen-header";
import { BillingStatusBadge } from "@/features/owner/bill-views";
import { TenantAvatar } from "@/features/owner/tenancy-list";
import { ActionButton, NoticeBar, ViewOnlyChip, formatMoneyPaise, humanizeToken } from "@/features/owner/owner-ui";
import { isDepositCredit, type DepositAccount, type DepositMovement } from "@/store/services/billing-api";
import { tenancyStatusLabel, type TenancySummary } from "@/store/services/tenancy-api";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

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

export function DepositAccountHeader({
  canManage,
  onBack,
  tenantName,
}: {
  canManage: boolean;
  onBack?: () => boolean | void;
  tenantName: string | null;
}) {
  const { colors, fonts } = useTheme();
  return (
    <ScreenHeader
      badge={!canManage ? <ViewOnlyChip /> : null}
      italicTail="account"
      onBack={onBack}
      subtitle={
        <>
          View{" "}
          <FitText style={{ color: colors.ink, fontFamily: fonts.sansBold, fontStyle: "italic" }}>
            {cardName(tenantName ?? "this tenant")}
          </FitText>
          ’s deposit balance, manage transactions and track the history.
        </>
      }
      title="Deposit"
    />
  );
}

/**
 * Whose deposit this is: their photo or initials, name and tenancy code, and the
 * tenancy's state on the right (user, 2026-11-07). Not a button: going back to the
 * list is the header's back arrow.
 */
export function DepositAccountTenantCard({ tenancy }: { tenancy: TenancySummary }) {
  const { colors, fonts, type } = useTheme();
  const active = tenancy.status === "ACTIVE";
  const onNotice = tenancy.status === "ON_NOTICE" || tenancy.status === "ON_PREMATURE_NOTICE" || tenancy.status === "PENDING_EXIT";
  const statusColor = active ? colors.jade : onNotice ? colors.warningText : colors.muted;
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        elevation: 1,
        flexDirection: "row",
        gap: spacing.sm,
        // Compact (user, 2026-11-07): as tall as the avatar and two lines need.
        overflow: "hidden",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        shadowColor: colors.primaryDeep,
        shadowOffset: { height: 4, width: 0 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      }}
    >
      <Svg accessible={false} pointerEvents="none" width={150} height={46} viewBox="0 0 190 65" preserveAspectRatio="none" style={{ bottom: 0, position: "absolute", right: 0 }}>
        <Path d="M0 65 C58 18 83 53 125 30 C151 16 170 5 190 0 V65 Z" fill={colors.primarySoft} />
        <Path d="M62 65 C111 43 150 53 190 29 V65 Z" fill={colors.primary} opacity={0.08} />
      </Svg>
      <TenantAvatar name={tenancy.tenantName} photoUrl={tenancy.tenantPhotoUrl} />
      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <FitText
          numberOfLines={1}
          style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: cardText(16), lineHeight: 21 }}
        >
          {cardName(tenancy.tenantName ?? "Unnamed tenant")}
        </FitText>
        <Text selectable style={[smallerCardText(type.caption), { color: colors.muted, fontSize: cardText(12), lineHeight: 16 }]}>
          {tenancy.referenceCode}
        </Text>
      </View>
      {/* Where the chevron was, centred on the row. Wrapped, because the badge sets
          alignSelf:"flex-start" on itself, which would pin it to the card's top. */}
      <View style={{ flexShrink: 0 }}>
        <BillingStatusBadge
          background={active ? colors.successSoft : onNotice ? colors.warningSoft : colors.neutralSoft}
          color={statusColor}
          icon={active ? Landmark : onNotice ? Clock3 : CheckCircle2}
          // "On notice" for both notice kinds. "On Premature Notice" was long
          // enough to push the name and tenancy code out of the card.
          label={tenancyStatusLabel(tenancy.status)}
        />
      </View>
    </View>
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
  // A dropdown floating under its pill over the list, not a bottom sheet (user, 2026-11-14).
  // Placed from the pill row's own layout inside this view: window measurements put it over
  // the pill on a phone.
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterRowBottom, setFilterRowBottom] = useState(0);
  const pending = deposit.status === "PENDING_SETTLEMENT";
  const settled = deposit.status === "SETTLED";
  const payable = deposit.payableAtExit;
  const movements = filterDepositMovements(deposit.movements, filter);
  const filterLabel = MOVEMENT_FILTERS.find((option) => option.value === filter)?.label ?? "All";

  return (
    // Grows into the screen's spare height, where the screen lets it, so the end note centres in it.
    <View style={{ flexGrow: 1, gap: spacing.md }}>
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
              <FitText
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
              </FitText>
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
            variant="dangerFilled"
          />
        ) : null
      ) : onAdd && onDeduct ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <DepositAmountButton disabled={busy || !canManage} mode="add" onPress={onAdd} />
          <DepositAmountButton disabled={busy || !canManage} mode="deduct" onPress={onDeduct} />
        </View>
      ) : null}

      <View
        onLayout={(event) => setFilterRowBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
        style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between", marginTop: spacing.md }}
      >
        <Text style={{ color: colors.ink, flexGrow: 1, fontFamily: fonts.display, fontSize: 17, letterSpacing: -0.3, lineHeight: 24 }}>
          Transaction history
        </Text>
        {/* The request desk's grey pill and its dropdown (user, 2026-11-14). */}
        <View>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={"Filter transactions: " + filterLabel}
            accessibilityState={{ expanded: filterOpen }}
            onPress={() => setFilterOpen((open) => !open)}
            style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: `${colors.ink}40`, borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 4, height: 36, paddingLeft: spacing.md, paddingRight: spacing.sm }}
          >
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12.5 }}>{filterLabel}</Text>
            {filterOpen ? <ChevronUp color={colors.ink} size={15} strokeWidth={2.4} /> : <ChevronDown color={colors.ink} size={15} strokeWidth={2.4} />}
          </AnimatedPressable>
        </View>
      </View>

      {filterOpen ? (
        // Any tap outside the list closes it.
        <Pressable accessibilityLabel="Close filter" onPress={() => setFilterOpen(false)} style={[StyleSheet.absoluteFill, { zIndex: 9 }]} />
      ) : null}
      {filterOpen ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            elevation: 10,
            overflow: "hidden",
            position: "absolute",
            right: 0,
            top: filterRowBottom + spacing.xs,
            width: 180,
            zIndex: 10,
            ...softShadow(colors.shadow, 6, 14),
          }}
        >
          {MOVEMENT_FILTERS.map((option) => (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected: option.value === filter }}
              key={option.value}
              onPress={() => {
                setFilter(option.value);
                setFilterOpen(false);
              }}
              style={{ backgroundColor: option.value === filter ? colors.surfaceSunken : colors.surface, padding: spacing.md }}
            >
              <Text style={{ color: colors.ink, fontFamily: option.value === filter ? fonts.sansBold : fonts.sansMedium, fontSize: 14 }}>
                {option.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {movements.map((movement) => <DepositMovementRow key={movement.id} movement={movement} />)}
      </View>

      {/* Centred in the space under the list (user, 2026-11-14). */}
      <View style={{ alignItems: "center", flexGrow: 1, gap: spacing.sm, justifyContent: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.lg }}>
        <DepositHistoryArtwork size={82} />
        <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 16, lineHeight: 23, textAlign: "center" }}>
          {movements.length > 0 ? "No more transactions" : filter === "ALL" ? "No transactions yet" : "No matching transactions"}
        </Text>
      </View>


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
  const color = credit ? colors.jade : colors.danger;
  return (
    // The cards' 3D edge and corner (user, 2026-11-14).
    <View style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 74, padding: spacing.md, ...cardShadow(colors.shadow) }}>
      {/* Money in with a plus, out with a minus, a settlement as a ticked slip (user, 2026-11-14). */}
      <DepositMovementIcon kind={movement.type} size={42} />
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
