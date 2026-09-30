import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Text, View } from "react-native";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, LogOut, Phone, UserRound, XCircle } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { ActionButton } from "@/features/owner/owner-ui";
import { tenancyStatusLabel, type TenancySummary } from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type OwnerTenancyListTab = "active" | "past";

export function TenancyListTabs({
  activeTab,
  onChange,
}: {
  activeTab: OwnerTenancyListTab;
  onChange: (tab: OwnerTenancyListTab) => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const tabs: { label: string; value: OwnerTenancyListTab }[] = [
    { label: "Active tenancies", value: "active" },
    { label: "Past tenancies", value: "past" },
  ];

  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: radii.card, flexDirection: "row", padding: 5 }}>
      {tabs.map((tab) => {
        const selected = activeTab === tab.value;
        return (
          <AnimatedPressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.value}
            onPress={() => onChange(tab.value)}
            style={{
              alignItems: "center",
              backgroundColor: selected ? colors.surface : "transparent",
              borderColor: selected ? colors.borderStrong : "transparent",
              borderCurve: "continuous",
              borderRadius: 13,
              borderWidth: 1,
              flex: 1,
              justifyContent: "center",
              minHeight: 46,
            }}
          >
            <Text style={{ color: selected ? colors.ink : colors.muted, fontFamily: fonts.sans, fontSize: 14, fontWeight: selected ? "900" : "700" }}>
              {tab.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

/**
 * The tenant identity block is the card's explicit navigation target. Keeping
 * the profile action named avoids making the destructive card surface itself
 * tappable, while the larger block remains easy to hit.
 */
function TenantNameButton({ name, onPress, phone }: { name: string; onPress: () => void; phone: string | null }) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={`View ${name}'s profile`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={{ alignSelf: "flex-start", gap: spacing.xs }}
    >
      <Text
        numberOfLines={1}
        style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 21, lineHeight: 26 }}
      >
        {name}
      </Text>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Phone color={colors.inkSoft} size={15} strokeWidth={2.1} />
        <Text numberOfLines={1} style={[type.caption, { color: colors.muted, flexShrink: 1 }]}>
          {phone || "Phone unavailable"}
        </Text>
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 16 }}>
          View profile
        </Text>
        <ArrowRight color={colors.primary} size={14} strokeWidth={2.3} />
      </View>
    </AnimatedPressable>
  );
}

export function ActiveTenancyCard({
  canEndTenancy = true,
  ending = false,
  onEndTenancy,
  onOpen,
  onRemove,
  onProvideAttempts,
  agreementExpiresAt,
  removing = false,
  roomLabel,
  tenancy,
}: {
  ending?: boolean;
  canEndTenancy?: boolean;
  onEndTenancy: () => void;
  onOpen: () => void;
  onRemove?: () => void;
  /**
   * Only for someone who may order checks (TENANCY_CREATE). Absent, the
   * pending card shows no "Provide attempts".
   */
  onProvideAttempts?: () => void;
  /** When the unsigned agreement expires. Shown on a pending card. */
  agreementExpiresAt?: string | null;
  removing?: boolean;
  roomLabel: string | null;
  tenancy: TenancySummary;
}) {
  const { colors, type } = useTheme();
  const tenantName = tenancy.tenantName?.trim() || "Unnamed tenant";
  const rentAmount = tenancy.billingType === "DAILY"
    ? tenancy.dailyRatePaise ?? tenancy.rentAmountPaise ?? 0
    : tenancy.rentAmountPaise ?? tenancy.dailyRatePaise ?? 0;
  const rentSuffix = tenancy.billingType === "DAILY" ? "/ day" : "/ month";
  const today = todayLocalISO();
  // The server's one checkout date. Picking plannedEndDate only for daily
  // stays left every fixed term with no date here: no End button, no badge.
  const endDate = tenancy.checkoutDate;
  const canEnd = endDate != null && endDate <= today;
  // A stay past its date shows as Pending exit through its status. Before the
  // nightly sweep reaches it, this badge says the same thing.
  const pastDue = endDate != null && endDate < today && tenancy.status !== "PENDING_EXIT";
  const daysUntilEnd = endDate ? dateOnlyDayNumber(endDate) - dateOnlyDayNumber(today) : null;
  const dueToday = daysUntilEnd === 0;
  const endingSoon = daysUntilEnd != null && daysUntilEnd > 0 && daysUntilEnd <= tenancy.endingSoonLeadDays;
  const awaitingAgreement = tenancy.status === "PENDING_ACCEPTANCE";
  const statusChips: TenancyCardStatusChip[] = [
    ...(pastDue ? [{ key: "past-due", kind: "timing" as const, label: "Past due", tone: "danger" as const }] : []),
    ...(dueToday ? [{ key: "due-today", kind: "timing" as const, label: "Ends today", tone: "warning" as const }] : []),
    ...(endingSoon ? [{ key: "ending-soon", kind: "timing" as const, label: "Ends soon", tone: "warning" as const }] : []),
    { key: `tenancy-${tenancy.status}`, kind: "tenancy" as const, status: tenancy.status },
  ];

  return (
    <Card style={{ borderRadius: radii.card }}>
      <View style={{ gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            justifyContent: "space-between",
          }}
        >
          <Text numberOfLines={1} style={[type.eyebrow, { color: colors.kicker, flexShrink: 1 }]}>
            {tenancy.referenceCode}
          </Text>
          <TenancyStatusCarousel chips={statusChips} />
        </View>

        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 2, width: 48 }}>
            <UserRound color={colors.ink} size={38} strokeWidth={1.7} />
          </View>
          <View style={{ flex: 1 }}>
            <TenantNameButton name={tenantName} onPress={onOpen} phone={tenancy.tenantPhone} />
          </View>
        </View>

        <View style={{ backgroundColor: colors.border, height: 1 }} />

        <View style={{ alignItems: "stretch", flexDirection: "row" }}>
          <TenancyMetric flex={0.75} label="Room" value={roomLabel ?? "Unavailable"} />
          <MetricDivider />
          <TenancyMetric flex={1.3} label="Rent" value={`${formatMoneyPaise(rentAmount)} ${rentSuffix}`} />
          <MetricDivider />
          <TenancyMetric flex={1} label={tenancy.status === "SCHEDULED" ? "Starts" : "Started"} value={formatDate(tenancy.startDate)} />
          {endDate ? (
            <>
              <MetricDivider />
              <TenancyMetric flex={1} label="End date" value={formatDate(endDate)} />
            </>
          ) : null}
        </View>
      </View>

      {awaitingAgreement && ((canEndTenancy && onRemove) || onProvideAttempts || agreementExpiresAt) ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
          {(canEndTenancy && onRemove) || onProvideAttempts ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {onProvideAttempts ? (
                <ActionButton label="Verification" onPress={onProvideAttempts} variant="secondary" />
              ) : null}
              {canEndTenancy && onRemove ? (
                <ActionButton
                  disabled={removing}
                  label={removing ? "Removing…" : "Remove"}
                  onPress={onRemove}
                  variant="danger"
                />
              ) : null}
            </View>
          ) : null}
          {agreementExpiresAt ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
              <Clock3 color={colors.warningText} size={13} strokeWidth={2.3} />
              <Text style={[type.caption, { color: colors.warningText }]}>{expiresInLabel(agreementExpiresAt)}</Text>
            </View>
          ) : null}
        </View>
      ) : canEndTenancy ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
          <View style={{ flexDirection: "row" }}>
            <ActionButton
              disabled={!canEnd || ending}
              icon={LogOut}
              label={ending ? "Ending…" : "End tenancy"}
              onPress={onEndTenancy}
              variant="danger"
            />
          </View>
          {!canEnd ? (
            <Text style={[type.description, { color: colors.muted }]}>
              {endDate ? `Can be ended on ${formatDate(endDate)}.` : "Available once an end date is set."}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

export type TenancyCardStatusChip =
  | {
      key: string;
      kind: "tenancy";
      status: TenancySummary["status"];
    }
  | {
      key: string;
      kind: "timing";
      label: string;
      tone: "danger" | "warning";
    };

/**
 * One status at a time, newest first. A horizontal swipe advances through the
 * chips and wraps in both directions, so the last chip always leads back to
 * the first rather than ending at a dead edge.
 */
function TenancyStatusCarousel({ chips }: { chips: TenancyCardStatusChip[] }) {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animatingRef = useRef(false);
  const pendingResetRef = useRef(false);
  const signature = chips.map((chip) => chip.key).join("|");
  const slotWidth = 92;
  const slideDistance = slotWidth;

  useEffect(() => {
    setActiveIndex(0);
    translateX.setValue(0);
  }, [signature, translateX]);

  // Reset before the newly selected chip is painted. Doing this in the timing
  // callback left one blank frame between the outgoing and incoming chips.
  useLayoutEffect(() => {
    if (!pendingResetRef.current) {
      return;
    }
    translateX.setValue(0);
    pendingResetRef.current = false;
    animatingRef.current = false;
  }, [activeIndex, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          chips.length > 1 && Math.abs(gesture.dx) > 7 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) => {
          if (!animatingRef.current) {
            translateX.setValue(Math.max(-72, Math.min(72, gesture.dx)));
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (animatingRef.current) {
            return;
          }
          if (Math.abs(gesture.dx) < 24) {
            Animated.spring(translateX, { friction: 8, tension: 90, toValue: 0, useNativeDriver: true }).start();
            return;
          }

          animatingRef.current = true;
          const direction = gesture.dx < 0 ? 1 : -1;
          const exit = direction > 0 ? -slideDistance : slideDistance;
          Animated.timing(translateX, { duration: 150, toValue: exit, useNativeDriver: true }).start(() => {
            pendingResetRef.current = true;
            setActiveIndex((current) => (current + direction + chips.length) % chips.length);
          });
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, { friction: 8, tension: 90, toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [chips.length, slideDistance, translateX],
  );

  const activeChip = chips[activeIndex] ?? chips[0];
  const nextChip = chips[(activeIndex + 1) % chips.length];
  const previousChip = chips[(activeIndex - 1 + chips.length) % chips.length];
  if (!activeChip) {
    return null;
  }
  // Preserve the original chip position and natural width when there is
  // nothing to carousel through.
  if (chips.length === 1) {
    return <TenancyStatusChip chip={activeChip} />;
  }

  return (
    <View
      accessibilityLabel={`Status ${activeIndex + 1} of ${chips.length}`}
      style={{ alignItems: "center", gap: 5, width: slotWidth }}
      {...panResponder.panHandlers}
    >
      <View style={{ height: 28, overflow: "hidden", position: "relative", width: slotWidth }}>
        <Animated.View
          style={{
            alignItems: "center",
            left: 0,
            opacity: translateX.interpolate({
              inputRange: [-slideDistance, 0, slideDistance],
              outputRange: [0, 1, 0],
            }),
            position: "absolute",
            right: 0,
            transform: [{ translateX }],
          }}
        >
          <TenancyStatusChip chip={activeChip} fill />
        </Animated.View>

        {chips.length > 1 ? (
          <>
            <Animated.View
              style={{
                alignItems: "center",
                left: 0,
                opacity: translateX.interpolate({
                  extrapolate: "clamp",
                  inputRange: [-slideDistance, -slideDistance / 2, 0],
                  outputRange: [1, 0.5, 0],
                }),
                position: "absolute",
                right: 0,
                transform: [{ translateX: Animated.add(translateX, slideDistance) }],
              }}
            >
              <TenancyStatusChip chip={nextChip} fill />
            </Animated.View>
            <Animated.View
              style={{
                alignItems: "center",
                left: 0,
                opacity: translateX.interpolate({
                  extrapolate: "clamp",
                  inputRange: [0, slideDistance / 2, slideDistance],
                  outputRange: [0, 0.5, 1],
                }),
                position: "absolute",
                right: 0,
                transform: [{ translateX: Animated.add(translateX, -slideDistance) }],
              }}
            >
              <TenancyStatusChip chip={previousChip} fill />
            </Animated.View>
          </>
        ) : null}
      </View>

      {chips.length > 1 ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
          {chips.map((chip, index) => (
            <View
              key={chip.key}
              style={{
                backgroundColor: index === activeIndex ? colors.inkSoft : colors.borderStrong,
                borderRadius: 999,
                height: 6,
                width: 6,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function TenancyStatusChip({ chip, fill = false }: { chip: TenancyCardStatusChip; fill?: boolean }) {
  return chip.kind === "tenancy" ? (
    <TenancyStatusBadge fill={fill} status={chip.status} />
  ) : (
    <TenancyTimingBadge fill={fill} label={chip.label} tone={chip.tone} />
  );
}

/**
 * "Expires in 3d", counted to the nightly run that removes an unsigned
 * agreement. Days, then hours, then minutes as it gets close.
 */
function expiresInLabel(expiresAt: string) {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(remainingMs) || remainingMs <= 60_000) {
    return "Expires soon";
  }
  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 60) {
    return `Expires in ${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Expires in ${hours}h`;
  }
  return `Expires in ${Math.floor(hours / 24)}d`;
}

function TenancyStatusBadge({ fill = false, status }: { fill?: boolean; status: TenancySummary["status"] }) {
  const { colors, fonts } = useTheme();
  const display =
    status === "ACTIVE"
      ? { background: colors.primarySoft, color: colors.primaryDeep, icon: CheckCircle2 }
      : status === "PENDING_EXIT"
        ? { background: colors.dangerSoft, color: colors.danger, icon: AlertTriangle }
      : status === "ON_NOTICE" || status === "ON_PREMATURE_NOTICE" || status === "PENDING_ACCEPTANCE" || status === "SCHEDULED"
        ? { background: colors.warningSoft, color: colors.warningText, icon: Clock3 }
        : status === "EVICTED"
          ? { background: colors.dangerSoft, color: colors.danger, icon: AlertTriangle }
          : { background: colors.surfaceSunken, color: colors.muted, icon: XCircle };
  const Icon = display.icon;

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: display.background,
        borderRadius: 999,
        flexDirection: "row",
        gap: 4,
        justifyContent: fill ? "center" : undefined,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
        width: fill ? "100%" : undefined,
      }}
    >
      <Icon color={display.color} size={13} strokeWidth={2.3} />
      <Text style={{ color: display.color, fontFamily: fonts.sansBold, fontSize: 11 }}>
        {tenancyStatusLabel(status)}
      </Text>
    </View>
  );
}

function TenancyTimingBadge({ fill = false, label, tone }: { fill?: boolean; label: string; tone: "danger" | "warning" }) {
  const { colors, fonts } = useTheme();
  const backgroundColor = tone === "danger" ? colors.dangerSoft : colors.warningSoft;
  const color = tone === "danger" ? colors.danger : colors.warningText;

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor,
        borderRadius: 999,
        flexDirection: "row",
        gap: 4,
        justifyContent: fill ? "center" : undefined,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
        width: fill ? "100%" : undefined,
      }}
    >
      <Clock3 color={color} size={13} strokeWidth={2.3} />
      <Text style={{ color, fontFamily: fonts.sansBold, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function TenancyMetric({ flex, label, value }: { flex: number; label: string; value: string }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ flex, gap: 3, minWidth: 0, paddingHorizontal: spacing.xs }}>
      <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 10 }]}>
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 16 }}
      >
        {value}
      </Text>
    </View>
  );
}

function MetricDivider() {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.border, marginHorizontal: spacing.xxs, width: 1 }} />;
}

export function PastTenancyCard({ roomLabel, tenancy }: { roomLabel: string | null; tenancy: TenancySummary }) {
  const { colors, fonts, type } = useTheme();
  const tenantName = tenancy.tenantName?.trim() || "Unnamed tenant";

  return (
    <Card>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <IconBox icon={CalendarDays} muted />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                {tenancy.referenceCode}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, }} numberOfLines={1}>
                {tenantName}
              </Text>
              <Text style={[type.caption, { color: colors.muted }]}>
                {roomLabel ? `Room ${roomLabel}` : "Room unavailable"}
              </Text>
            </View>
            <Text style={[type.caption, { color: colors.muted, fontWeight: "900" }]}>
              {tenancyStatusLabel(tenancy.status)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TenancyDetail compact label="Started" value={formatDate(tenancy.startDate)} />
            <TenancyDetail compact label="Ended" value={tenancy.endDate ? formatDate(tenancy.endDate) : "No end date"} />
          </View>
        </View>
      </View>
    </Card>
  );
}

function IconBox({ icon: Icon, muted = false }: { icon: typeof CalendarDays; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    // No tile. The pale blue fill was the last one of its kind in the app, and
    // with the border gone the glyph can take the space the box was holding.
    <View style={{ alignItems: "center", height: 42, justifyContent: "center", width: 42 }}>
      <Icon color={muted ? colors.muted : colors.ink} size={30} strokeWidth={1.8} />
    </View>
  );
}

function TenancyDetail({ compact = false, label, value }: { compact?: boolean; label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flex: compact ? 1 : undefined, gap: 1 }}>
      <Text style={[type.caption, { color: colors.muted }]}>
        {label}
      </Text>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "800" }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function dateOnlyDayNumber(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

// Local calendar date as YYYY-MM-DD so it compares directly against the backend's
// ISO LocalDate strings (lexicographic order matches chronological order).
function todayLocalISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatMoneyPaise(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value / 100);
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
