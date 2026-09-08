import { useState } from "react";
import { Image, Text, View, type ViewStyle } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { Banknote, BedDouble, CalendarClock, Clock3 } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { HeaderNote } from "@/components/header-note";
import { PaginationBar } from "@/components/pagination-bar";

import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusPill } from "@/components/status-pill";
import { SkeletonCard } from "@/components/skeleton";
import { useAvailableAccounts } from "@/features/account/accounts";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import type { UpcomingBillingCycle } from "@/store/services/billing-api";
import { useListUpcomingPropertyCyclesQuery } from "@/store/services/billing-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NO_BILL_ILLUSTRATION = require("../assets/workspace/No-Bill_512x436.png");

const PAGE_SIZE = 8;
const BILLING_HEADER_ILLUSTRATION = require("../assets/workspace/billing-header.png");

export default function OwnerUpcomingCyclesScreen() {

  const { colors, type } = useTheme();
  const params = useLocalSearchParams<{ month?: string }>();
  const month = typeof params.month === "string" && params.month ? params.month : istCurrentMonth();
  const monthName = monthLabel(month);
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const [page, setPage] = useState(0);
  const upcomingQuery = useListUpcomingPropertyCyclesQuery(
    { month, page, propertyId, size: PAGE_SIZE },
    { skip: !propertyId },
  );
  const pageData = upcomingQuery.data;
  const items = pageData?.items ?? [];

  return (
    <ScreenScrollView
      background={
        <View style={{ backgroundColor: colors.surface, flex: 1 }}>
          <LinearGradient
            colors={[colors.primarySoft, colors.surface]}
            end={{ x: 0.5, y: 1 }}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }}
            style={{ height: 220 }}
          />
        </View>
      }
      contentContainerStyle={{ paddingTop: spacing.xs }}
      safeAreaEdges={["top", "bottom"]}
      surface={colors.surface}
    >
      <UpcomingCyclesHeader monthName={monthName} propertyName={property?.name ?? null} />

      {!property ? (
        <EmptyState
          icon={CalendarClock}

          title="Choose a property first"
          description="Open the workspace tab on the home screen and select a property to view its upcoming billing cycles."
        />
      ) : (
        <>
          <MonthDivider label={monthName} />

          {upcomingQuery.isFetching && items.length === 0 ? (
            <SkeletonCard />
          ) : items.length === 0 ? (
            <EmptyState
              artwork={NO_BILL_ILLUSTRATION}
              title={`All cycles generated for ${monthName}`}
              description="Every active monthly tenancy has already been billed for this month. New upcoming dates appear once the month rolls over. Daily stays are billed once for the whole stay."
            />
          ) : (
            <View style={{ gap: spacing.sm, opacity: upcomingQuery.isFetching ? 0.6 : 1 }}>
              {items.map((item) => (
                <UpcomingCycleRow item={item} key={item.tenancyId} />
              ))}
            </View>
          )}

          {pageData && pageData.totalElements > 0 ? (
            <PaginationBar
              hasNext={pageData.hasNext}
              hasPrevious={pageData.hasPrevious}
              onNext={() => setPage((current) => current + 1)}
              onPrevious={() => setPage((current) => Math.max(0, current - 1))}
              page={pageData.page}
              totalElements={pageData.totalElements}
              totalPages={pageData.totalPages}
            />
          ) : null}

          {upcomingQuery.isError ? (
            <Text style={[type.caption, { color: colors.danger }]}>
              Could not load upcoming cycles. Pull to retry.
            </Text>
          ) : null}
        </>
      )}
    </ScreenScrollView>
  );
}

function UpcomingCyclesHeader({ monthName, propertyName }: { monthName: string; propertyName: string | null }) {
  const { colors, type } = useTheme();

  return (
    <View style={{ minHeight: 100, position: "relative" }}>
      <View style={{ gap: spacing.sm, paddingRight: 138 }}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          numberOfLines={1}
          style={[type.brand, { color: colors.ink, fontSize: 29, lineHeight: 35 }]}
        >
          Upcoming
          <Text style={[type.brandItalic, { color: colors.accent, fontSize: 29, lineHeight: 35 }]}> cycles.</Text>
        </Text>
        <HeaderNote>
          {propertyName
            ? "Cycles scheduled for " + monthName + " at " + propertyName + "."
            : "Cycles scheduled for " + monthName + "."}
        </HeaderNote>
      </View>

      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={BILLING_HEADER_ILLUSTRATION}
        style={{ height: 100, position: "absolute", right: 0, top: -4, width: 150 }}
      />
    </View>
  );
}

function MonthDivider({ label }: { label: string }) {
  const { colors, fonts } = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1 }} />
      <View
        style={{
          backgroundColor: colors.primarySoft,
          borderRadius: 999,
          paddingHorizontal: spacing.md,
          paddingVertical: 5,
        }}
      >
        <Text style={{ color: colors.primaryDeep, fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.8 }}>
          {label.toUpperCase()}
        </Text>
      </View>
      <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1 }} />
    </View>
  );
}

function UpcomingCycleRow({ item }: { item: UpcomingBillingCycle }) {
  const { colors, fonts, type } = useTheme();
  const days = daysUntil(item.nextCycleStartDate);
  // A monthly tenancy on notice that ends before its next period start will
  // never get that cycle — the tenancy closes first.
  const endsBeforeNextCycle = item.tenancyEndDate != null && item.tenancyEndDate < item.nextCycleStartDate;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}>
          <CalendarClock color={colors.primary} size={28} strokeWidth={2.1} />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text
              style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 17, }}
              numberOfLines={1}
            >
              {item.tenantName || "Tenant"}
            </Text>
            {item.tenancyEndDate != null ? <StatusPill label="On notice" tone="warning" /> : null}
          </View>
          <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
            {item.tenancyReferenceCode}
          </Text>

          <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: 4 }}>
            {item.roomNumber ? (
              <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
                <BedDouble color={colors.muted} size={14} strokeWidth={2.1} />
                <Text style={[type.caption, { color: colors.ink }]}>Room {item.roomNumber}</Text>
              </View>
            ) : null}
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <Banknote color={colors.muted} size={14} strokeWidth={2.1} />
              <Text style={[type.caption, { color: colors.ink }]}>{formatMoneyPaise(item.baseAmountPaise)} / month</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Structured schedule grid — the cycle number is its own header cell, and
          the two dates share equal cells at the same weight so neither one reads
          as more important than the other. */}
      <View style={{ borderColor: colors.border, borderRadius: 12, borderWidth: 1, overflow: "hidden" }}>
        <View style={{ flexDirection: "row" }}>
          <ScheduleCell label="Current cycle" style={{ flex: 1 }} value={`#${item.currentCycleNumber}`} />
          <View style={{ backgroundColor: colors.border, width: 1 }} />
          <ScheduleCell highlight label="Next cycle" style={{ flex: 1 }} value={`#${item.currentCycleNumber + 1}`} />
        </View>
        <View style={{ backgroundColor: colors.border, height: 1 }} />
        <View style={{ flexDirection: "row" }}>
          <ScheduleCell label="Current ends" style={{ flex: 1 }} value={formatFullDate(item.currentPeriodEndDate)} />
          <View style={{ backgroundColor: colors.border, width: 1 }} />
          <ScheduleCell highlight label="Next starts" style={{ flex: 1 }} value={formatFullDate(item.nextCycleStartDate)} />
        </View>
      </View>

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <DueChip days={days} suppressed={endsBeforeNextCycle} />
        {endsBeforeNextCycle ? (
          <Text style={[type.caption, { color: colors.muted, flex: 1, textAlign: "right" }]}>
            Tenancy ends {formatFullDate(item.tenancyEndDate as string)} — before this cycle.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function DueChip({ days, suppressed }: { days: number; suppressed: boolean }) {
  const { colors, fonts } = useTheme();
  // Numeric "In N day(s)" for every positive gap — the "Starts tomorrow" word
  // label rendered with a blank tail on device, while the numeric form is fine.
  const label = suppressed
    ? "Will not generate"
    : days < 0
      ? "Due for generation"
      : days === 0
        ? "Starts today"
        : `In ${days} day${days === 1 ? "" : "s"}`;
  const color = suppressed ? colors.muted : days <= 3 ? colors.jade : colors.primary;
  const backgroundColor = suppressed ? colors.surfaceSunken : days <= 3 ? colors.jadeSoft : colors.primarySoft;

  return (
    <View style={{ alignItems: "center", backgroundColor, borderRadius: 999, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
      <Clock3 color={color} size={12} strokeWidth={2.2} />
      <Text style={{ color, fontFamily: fonts.sansBold, fontSize: 11, fontVariant: ["tabular-nums"], }}>
        {label}
      </Text>
    </View>
  );
}

// One labelled data cell in the schedule grid. Label + value share the same
// typography across cells so the two dates and the cycle number sit evenly.
function ScheduleCell({
  highlight,
  label,
  style,
  value,
}: {
  highlight?: boolean;
  label: string;
  style?: ViewStyle;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={[{ gap: 4, minWidth: 0, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 }, style]}>
      <Text
        numberOfLines={1}
        style={[type.eyebrow, { color: colors.kicker, fontSize: 10 }]}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{ color: highlight ? colors.primary : colors.ink, fontFamily: fonts.sansBold, fontSize: 14, fontVariant: ["tabular-nums"], lineHeight: 19 }}
      >
        {value}
      </Text>
    </View>
  );
}

// "Today" in Asia/Kolkata rather than device-local time, matching the backend
// schedulers — otherwise the day count drifts around midnight on other zones.
function istTodayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

// Current billing month key ("YYYY-MM") in IST — the fallback when the screen is
// opened without a month param.
function istCurrentMonth() {
  return istTodayIso().slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map((part) => Number(part));
  if (!year || !month) {
    return value;
  }
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function daysUntil(dateIso: string) {
  return Math.round((Date.parse(dateIso) - Date.parse(istTodayIso())) / 86400000);
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
