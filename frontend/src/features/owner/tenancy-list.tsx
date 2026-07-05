import { Text, View } from "react-native";
import { BedDouble, CalendarDays, LogOut } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { ActionButton } from "@/features/owner/owner-ui";
import type { TenancySummary } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
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
    <View style={{ backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: 16, flexDirection: "row", padding: 5 }}>
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
            <Text style={{ color: selected ? colors.ink : colors.muted, fontFamily: fonts.sans, fontSize: 14, fontWeight: selected ? "900" : "700" }} selectable>
              {tab.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

export function ActiveTenancyCard({
  ending = false,
  onEndTenancy,
  onOpen,
  roomLabel,
  tenancy,
}: {
  ending?: boolean;
  onEndTenancy: () => void;
  onOpen: () => void;
  roomLabel: string | null;
  tenancy: TenancySummary;
}) {
  const { colors, fonts, type } = useTheme();
  const tenantName = tenancy.tenantName?.trim() || "Unnamed tenant";
  const rentAmount = tenancy.billingType === "DAILY"
    ? tenancy.dailyRatePaise ?? tenancy.rentAmountPaise ?? 0
    : tenancy.rentAmountPaise ?? tenancy.dailyRatePaise ?? 0;
  const rentSuffix = tenancy.billingType === "DAILY" ? "/ day" : "/ month";
  // The exit scheduler only executes monthly approved exits; daily stays (and any
  // stay whose end date has slipped) need a manual close. Active daily stays keep
  // their checkout in plannedEndDate; monthly stays on notice carry it in endDate.
  // Enable the button on or after that date, and flag "Past due" once it has passed.
  const today = todayLocalISO();
  const endDate = tenancy.billingType === "DAILY" ? tenancy.plannedEndDate : tenancy.endDate;
  const canEnd = endDate != null && endDate <= today;
  const pastDue = endDate != null && endDate < today;

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onOpen}>
      <Card>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <IconBox icon={BedDouble} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  {tenancy.referenceCode}
                </Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, fontWeight: "600" }} numberOfLines={1} selectable>
                  {tenantName}
                </Text>
                <Text style={[type.caption, { color: colors.muted }]} selectable>
                  {tenancy.tenantPhone || "Phone unavailable"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={[type.caption, { color: colors.primary, fontWeight: "900" }]} selectable>
                  {humanizeToken(tenancy.status)}
                </Text>
                {pastDue ? (
                  <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                    <Text style={{ color: colors.danger, fontFamily: fonts.sans, fontSize: 11, fontWeight: "900" }} selectable>
                      Past due
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <TenancyDetail label="Room" value={roomLabel ?? "Unavailable"} />
            <TenancyDetail label="Rent" value={`${formatMoneyPaise(rentAmount)} ${rentSuffix}`} />
            <TenancyDetail label="Started" value={formatDate(tenancy.startDate)} />
          </View>
        </View>
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
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              {endDate ? `Can be ended on ${formatDate(endDate)}.` : "Available once an end date is set."}
            </Text>
          ) : null}
        </View>
      </Card>
    </AnimatedPressable>
  );
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
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                {tenancy.referenceCode}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "600" }} numberOfLines={1} selectable>
                {tenantName}
              </Text>
              <Text style={[type.caption, { color: colors.muted }]} selectable>
                {roomLabel ? `Room ${roomLabel}` : "Room unavailable"}
              </Text>
            </View>
            <Text style={[type.caption, { color: colors.muted, fontWeight: "900" }]} selectable>
              {humanizeToken(tenancy.status)}
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

function IconBox({ icon: Icon, muted = false }: { icon: typeof BedDouble; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: muted ? colors.surfaceSunken : colors.primarySoft,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        height: 42,
        justifyContent: "center",
        width: 42,
      }}
    >
      <Icon color={muted ? colors.muted : colors.primary} size={20} strokeWidth={2.2} />
    </View>
  );
}

function TenancyDetail({ compact = false, label, value }: { compact?: boolean; label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flex: compact ? 1 : undefined, gap: 1 }}>
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        {label}
      </Text>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "800" }]} numberOfLines={1} selectable>
        {value}
      </Text>
    </View>
  );
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