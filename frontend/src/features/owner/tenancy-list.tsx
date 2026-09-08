import { Text, View } from "react-native";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, LogOut, Phone, UserRound, UserRoundMinus, XCircle } from "lucide-react-native";

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
  removing = false,
  roomLabel,
  tenancy,
}: {
  ending?: boolean;
  canEndTenancy?: boolean;
  onEndTenancy: () => void;
  onOpen: () => void;
  onRemove?: () => void;
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
  const endDate = tenancy.billingType === "DAILY" ? tenancy.plannedEndDate : tenancy.endDate;
  const canEnd = endDate != null && endDate <= today;
  const pastDue = endDate != null && endDate < today;
  const daysUntilEnd = endDate ? dateOnlyDayNumber(endDate) - dateOnlyDayNumber(today) : null;
  const dueToday = daysUntilEnd === 0;
  const endingSoon = daysUntilEnd != null && daysUntilEnd > 0 && daysUntilEnd <= 7;
  const awaitingAgreement = tenancy.status === "PENDING_ACCEPTANCE";

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
          <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            <TenancyStatusBadge status={tenancy.status} />
            {pastDue ? <TenancyTimingBadge label="Past due" tone="danger" /> : null}
            {dueToday ? <TenancyTimingBadge label="Due today" tone="warning" /> : null}
            {endingSoon ? <TenancyTimingBadge label="Ends soon" tone="warning" /> : null}
          </View>
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
          <TenancyMetric flex={1} label="Started" value={formatDate(tenancy.startDate)} />
          {endDate ? (
            <>
              <MetricDivider />
              <TenancyMetric flex={1} label="End date" value={formatDate(endDate)} />
            </>
          ) : null}
        </View>
      </View>

      {canEndTenancy && awaitingAgreement && onRemove ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
          <View style={{ flexDirection: "row" }}>
            <ActionButton
              disabled={removing}
              icon={UserRoundMinus}
              label={removing ? "Removing…" : "Remove tenancy"}
              onPress={onRemove}
              variant="danger"
            />
          </View>
          <Text style={[type.caption, { color: colors.warningText }]}>Agreement signature required before billing starts.</Text>
          <Text style={[type.caption, { color: colors.muted }]}>Frees the bed. Nothing has been billed yet.</Text>
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
            <Text style={[type.caption, { color: colors.muted }]}>
              {endDate ? `Can be ended on ${formatDate(endDate)}.` : "Available once an end date is set."}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function TenancyStatusBadge({ status }: { status: TenancySummary["status"] }) {
  const { colors, fonts } = useTheme();
  const display =
    status === "ACTIVE"
      ? { background: colors.primarySoft, color: colors.primaryDeep, icon: CheckCircle2 }
      : status === "ON_NOTICE" || status === "ON_PREMATURE_NOTICE" || status === "PENDING_ACCEPTANCE"
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
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
      }}
    >
      <Icon color={display.color} size={13} strokeWidth={2.3} />
      <Text style={{ color: display.color, fontFamily: fonts.sansBold, fontSize: 11 }}>
        {tenancyStatusLabel(status)}
      </Text>
    </View>
  );
}

function TenancyTimingBadge({ label, tone }: { label: string; tone: "danger" | "warning" }) {
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
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
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