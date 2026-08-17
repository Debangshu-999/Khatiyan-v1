import { useState } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { CalendarClock } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusPill } from "@/components/status-pill";
import { SkeletonCard } from "@/components/skeleton";
import { useAvailableAccounts } from "@/features/account/accounts";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import type { UpcomingBillingCycle } from "@/store/services/billing-api";
import { useListUpcomingPropertyCyclesQuery } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const PAGE_SIZE = 8;

export default function OwnerUpcomingCyclesScreen() {
  const router = useGuardedRouter();
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
    <ScreenScrollView>
      <ScreenHeader
        onBack={() => router.back()}
        eyebrow={`Owner billing · ${monthName}`}
        title="Upcoming"
        italicTail="cycles."
        subtitle={
          property
            ? `Cycles still to be generated in ${monthName} for each active monthly tenancy in ${property.name}.`
            : `Cycles still to be generated in ${monthName} for each active monthly tenancy.`
        }
      />

      {!property ? (
        <EmptyState
          icon={CalendarClock}
          eyebrow="No property selected"
          title="Choose a property first"
          description="Open the workspace tab on the home screen and select a property to view its upcoming billing cycles."
        />
      ) : (
        <>
          {upcomingQuery.isFetching && items.length === 0 ? (
            <SkeletonCard />
          ) : items.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              eyebrow="All caught up"
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
        borderRadius: 16,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.primarySoft,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 14,
            borderWidth: 1,
            height: 44,
            justifyContent: "center",
            width: 44,
          }}
        >
          <CalendarClock color={colors.primary} size={20} strokeWidth={2.2} />
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
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
            {[item.roomNumber ? `Room ${item.roomNumber}` : null, item.tenancyReferenceCode, `${formatMoneyPaise(item.baseAmountPaise)}/mo`]
              .filter(Boolean)
              .join(" · ")}
          </Text>
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
    <View style={{ backgroundColor, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
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
  const { colors, fonts } = useTheme();
  return (
    <View style={[{ gap: 4, minWidth: 0, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 }, style]}>
      <Text
        numberOfLines={1}
        style={{ color: colors.kicker, fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" }}
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
