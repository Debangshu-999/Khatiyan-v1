import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { AlertTriangle, ArrowDown, ChevronRight } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard, ChartDropdown } from "@/components/charts/chart-card";
import { Donut } from "@/components/charts/donut";
import { LineChart } from "@/components/charts/line-chart";
import { SegmentedBar } from "@/components/charts/segmented-bar";
import { StatTile } from "@/components/charts/stat-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner";
import { formatDateRange, periodLine, PRESET_LABELS } from "@/features/analytics/period";
import { PeriodPickerSheet } from "@/features/analytics/period-picker-sheet";
import { PeriodPill } from "@/features/analytics/period-pill";
import { useAnalyticsPeriod } from "@/features/analytics/use-analytics-period";
import { errorMessage } from "@/features/forms/server-error";
import { CLOSE_REASON_LABEL } from "@/features/lead/lead-display";
import { useLeadsProperty } from "@/features/lead/use-leads-property";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  useGetLeadInsightsQuery,
  type LeadInsights,
  type LeadInsightsPeriod,
  type LeadJourneyStep,
  type LeadProfileAction,
  type LeadStage,
} from "@/store/services/lead-api";
import { useChartPalette } from "@/theme/chart-colors";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

/** Each step as the people in it (user, 2026-10-18). */
const STEP_PEOPLE: Record<LeadJourneyStep, string> = {
  ANSWERED: "People who got an answer",
  BOOKED: "People who booked",
  GOT_IN_TOUCH: "People who got in touch",
  MOVED_IN: "People who moved in",
  OPENED: "People who opened your listing",
  VISITED: "People who visited",
};

/** What the people lost before a step did not do. */
const MISSED_STEP: Record<LeadJourneyStep, string> = {
  ANSWERED: "were not answered",
  BOOKED: "did not book",
  GOT_IN_TOUCH: "did not get in touch",
  MOVED_IN: "did not move in",
  OPENED: "",
  VISITED: "did not visit",
};

const ACTION_LABEL: Record<LeadProfileAction, string> = {
  BOOKING_REQUESTED: "Requested a booking",
  CALLED: "Called",
  ENQUIRED: "Enquired",
  NONE: "Left without acting",
  VISIT_SCHEDULED: "Scheduled a visit",
};

/** Each action keeps one slot of the shared series palette, so its colour never moves with a filter. */
const ACTION_SLOT: Record<Exclude<LeadProfileAction, "NONE">, number> = {
  BOOKING_REQUESTED: 4,
  CALLED: 0,
  ENQUIRED: 2,
  VISIT_SCHEDULED: 3,
};

const STAGE_LABEL: Record<LeadStage, string> = {
  ADVANCED_LEAD: "strong lead",
  BOOKED: "booked",
  EARLY_LEAD: "early lead",
  ENQUIRED: "enquired",
  MOVED_IN: "moved in",
};

const TIME_SPENT_LABEL: Record<string, string> = {
  LONGER: "Over 3 minutes",
  UNDER_10S: "Under 10 seconds",
  UNDER_1M: "30 seconds to 1 minute",
  UNDER_30S: "10 to 30 seconds",
  UNDER_3M: "1 to 3 minutes",
};

const FOUND_FROM_LABEL: Record<string, string> = {
  LINK: "A shared link",
  MAP: "The map",
  OTHER: "Elsewhere in the app",
  SEARCH: "Search",
  SMART_SEARCH: "Smart search",
};

const ANSWER_SPEED_LABEL: Record<string, string> = {
  LONGER: "Over a day",
  UNDER_1H: "Within an hour",
  UNDER_24H: "6 to 24 hours",
  UNDER_6H: "1 to 6 hours",
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const QUARTERS = ["12 am to 6 am", "6 am to 12 pm", "12 pm to 6 pm", "6 pm to 12 am"];
const QUARTER_SHORT = ["Night", "Morning", "Afternoon", "Evening"];

/**
 * Leads insights (user, 2026-10-18): every lead figure for a property in one
 * place, opened from the Leads row on the Dashboard tab.
 *
 * <p>Built from the same chart kit as the other Insights screens: chart cards,
 * stat tiles two to a row, the thin donut, the line chart and the bar lists.
 * The funnel and the time on the listing follow the people who opened it. The
 * enquiry, visit and booking figures count everything that happened in the
 * period, whoever it was. Each card says which.
 */
export default function OwnerLeadsInsightsScreen() {
  const { colors, type } = useTheme();
  const scope = useLeadsProperty();
  const propertyId = scope.property?.id ?? "";
  // The period every Insights screen shares, with the same pill and picker (user, 2026-10-18).
  const { period, setPeriod } = useAnalyticsPeriod();
  const [pickerOpen, setPickerOpen] = useState(false);
  const query = useGetLeadInsightsQuery(
    { from: period.from, period: period.preset as LeadInsightsPeriod, propertyId, to: period.to },
    { skip: !propertyId || !period.hydrated },
  );
  const insights = query.currentData;
  const pillLabel = period.preset === "CUSTOM" && period.from && period.to ? formatDateRange(period.from, period.to) : PRESET_LABELS[period.preset];

  return (
    <ScreenScrollView onRefresh={() => void query.refetch()} safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        italicTail="insights."
        subtitle={scope.property ? `How people go from opening ${scope.property.name} to moving in.` : "Select a property on Home first."}
        title="Leads"
      />

      <View style={{ gap: spacing.xs }}>
        <PeriodPill label={pillLabel} onPress={() => setPickerOpen(true)} updating={query.isFetching && !query.isLoading} />
        {insights ? (
          <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
            {periodLine({ bucket: "NONE", compareFrom: null, compareTo: null, dataSince: insights.dataSince, from: insights.from, preset: insights.period, to: insights.to })}
          </Text>
        ) : null}
      </View>

        <View style={{ gap: spacing.lg }}>
          {!insights && !query.isError ? <OwnerDataListSkeleton bodyLines={3} rows={3} /> : null}
          {query.isError ? <>
            <NoticeBar message={errorMessage(query.error)} title="Could not load lead insights" tone="danger" />
            <View style={{ flexDirection: "row" }}>
              <ActionButton label="Try again" onPress={() => void query.refetch()} variant="secondary" />
            </View>
          </> : null}
          {insights ? <Insights insights={insights} onRetry={() => void query.refetch()} /> : null}
        </View>

      {pickerOpen ? (
        <PeriodPickerSheet
          current={{ from: period.from, preset: period.preset, to: period.to }}
          dataSince={insights?.dataSince ?? null}
          onApply={(picked) => {
            setPeriod(picked);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </ScreenScrollView>
  );
}

function Insights({ insights, onRetry }: { insights: LeadInsights; onRetry: () => void }) {
  const router = useGuardedRouter();
  const palette = useChartPalette();
  const { activity, actions, biggestDrop, charts, profileTime, rates, steps } = insights;
  const opened = steps[0]?.people ?? 0;
  const views = profileTime.views;
  const answered = charts.answerSpeed.reduce((sum, bucket) => sum + bucket.count, 0);
  const visits = charts.visitOutcomes.attended + charts.visitOutcomes.missed + charts.visitOutcomes.cancelled;
  const lost = activity.deadLeads.reduce((sum, row) => sum + row.total, 0)
    + activity.lostEnquiries.reduce((sum, row) => sum + row.total, 0);
  const actionColor = (action: LeadProfileAction) => (action === "NONE" ? palette.other : palette.series[ACTION_SLOT[action]]);

  return <>
    <BiggestDropCard drop={biggestDrop} quickExitPercent={profileTime.quickExitPercent} steps={steps} />

    <ChartCard
      caption="Each person once, by the furthest thing they did."
      emptyText="Shows once people open your listing."
      footnote="The list under the chart counts everyone who did each action, so one person can be in two rows."
      onRetry={onRetry}
      sampleSize={opened}
      status={opened > 0 ? "OK" : "NO_DATA"}
      title="What people did after opening"
    >
      <View style={{ gap: spacing.lg }}>
        <Donut
          accessibilityLabel={`${actions.acted} of ${actions.opened} people acted`}
          centerLabel={`of ${actions.opened} acted`}
          centerValue={String(actions.acted)}
          slices={actions.byFurthest
            .filter((slice) => slice.people > 0)
            .filter(isKnownAction)
            .map((slice) => ({
              color: actionColor(slice.action),
              key: slice.action,
              label: ACTION_LABEL[slice.action],
              value: slice.people,
              valueText: `${slice.people} (${share(slice.people, actions.opened)})`,
            }))}
        />
        <View style={{ gap: spacing.sm }}>
          <Text style={useSubheading()}>Each action</Text>
          <BarList
            rows={[...actions.individual]
              .filter(isKnownAction)
              .sort((left, right) => right.people - left.people)
              .map((row) => ({
                color: actionColor(row.action),
                key: row.action,
                label: ACTION_LABEL[row.action],
                value: row.people,
                valueText: `${row.people} (${share(row.people, actions.opened)})`,
              }))}
          />
        </View>
      </View>
    </ChartCard>

    <ChartCard
      caption="The same people followed through, each counted once at the furthest step."
      emptyText="Shows once people open your listing."
      onRetry={onRetry}
      sampleSize={opened}
      status={opened > 0 ? "OK" : "NO_DATA"}
      title="From opening to moving in"
    >
      <Funnel drop={biggestDrop} steps={steps} />
    </ChartCard>

    <OverTimeCard insights={insights} onRetry={onRetry} />

    <ChartCard
      caption="Views of your listing in this period."
      emptyText="Shows once people open your listing."
      onRetry={onRetry}
      sampleSize={views}
      status={views > 0 ? "OK" : "NO_DATA"}
      title="Time on your listing"
    >
      <View style={{ gap: spacing.lg }}>
        <TileGrid>
          <StatTile label="Typical time" value={profileTime.medianSeconds == null ? "-" : duration(profileTime.medianSeconds)} />
          <StatTile label="Left within 10 s" value={percentText(profileTime.quickExitPercent)} />
          <StatTile label="Read 30 s or more" value={percentText(profileTime.readPercent)} />
          <StatTile label="Came back later" value={String(profileTime.cameBack)} />
        </TileGrid>
        <BarList
          rows={charts.timeSpent.map((bucket) => ({
            color: palette.series[0],
            key: bucket.key,
            label: TIME_SPENT_LABEL[bucket.key] ?? bucket.key,
            value: bucket.count,
            valueText: share(bucket.count, profileTime.viewsWithLength),
          }))}
        />
      </View>
    </ChartCard>

    <ChartCard
      caption="Views by day of the week and time of day."
      emptyText="Shows once people open your listing."
      onRetry={onRetry}
      sampleSize={views}
      status={views > 0 ? "OK" : "NO_DATA"}
      title="When people look at your listing"
    >
      <Heatmap cells={charts.whenTheyLook} />
    </ChartCard>

    <ChartCard
      emptyText="Shows once people open your listing."
      onRetry={onRetry}
      sampleSize={views}
      status={views > 0 ? "OK" : "NO_DATA"}
      title="Where they found your listing"
    >
      <BarList
        rows={charts.foundFrom
          .filter((bucket) => bucket.count > 0)
          .map((bucket) => ({
            color: palette.series[0],
            key: bucket.key,
            label: FOUND_FROM_LABEL[bucket.key] ?? bucket.key,
            value: bucket.count,
            valueText: `${bucket.count} (${share(bucket.count, views)})`,
          }))}
      />
    </ChartCard>

    <ChartCard
      caption="Everything raised in this period, whoever it was."
      onRetry={onRetry}
      sampleSize={activity.enquiriesRaised}
      status="OK"
      title="Enquiries"
    >
      <View style={{ gap: spacing.lg }}>
        <TileGrid>
          <StatTile label="Raised" value={String(activity.enquiriesRaised)} />
          <StatTile label="Answered" value={percentText(rates.responseRatePercent)} />
          <StatTile label="Typical answer time" value={activity.firstResponseMedianSeconds == null ? "-" : duration(activity.firstResponseMedianSeconds)} />
          <StatTile label="9 in 10 within" value={activity.firstResponseP90Seconds == null ? "-" : duration(activity.firstResponseP90Seconds)} />
          <StatTile caption="after an answer, no visit" label="Closed" value={percentText(rates.dropAfterAnswerPercent)} />
          <StatTile caption="of enquiries" label="Moved in" value={percentText(rates.enquiryToMoveInPercent)} />
        </TileGrid>
        {answered > 0 ? <View style={{ gap: spacing.sm }}>
          <Text style={useSubheading()}>How fast they were answered</Text>
          <BarList
            rows={charts.answerSpeed.map((bucket) => ({
              color: palette.series[0],
              key: bucket.key,
              label: ANSWER_SPEED_LABEL[bucket.key] ?? bucket.key,
              value: bucket.count,
              valueText: String(bucket.count),
            }))}
          />
        </View> : null}
      </View>
    </ChartCard>

    <ChartCard onRetry={onRetry} sampleSize={visits} status="OK" title="Visits and bookings">
      <View style={{ gap: spacing.lg }}>
        <TileGrid>
          <StatTile label="Visits scheduled" value={String(activity.visitsScheduled)} />
          <StatTile label="Attended" value={String(activity.visitsAttended)} />
          <StatTile label="Missed" value={String(activity.visitsMissed)} />
          <StatTile label="Booking requests" value={String(activity.bookingRequests)} />
          <StatTile label="Bookings confirmed" value={String(activity.bookingsConfirmed)} />
          <StatTile label="Moved in" value={String(activity.moveIns)} />
        </TileGrid>
        {visits > 0 ? <View style={{ gap: spacing.sm }}>
          <Text style={useSubheading()}>Visit outcomes</Text>
          <SegmentedBar
            accessibilityLabel={`${charts.visitOutcomes.attended} attended, ${charts.visitOutcomes.missed} missed, ${charts.visitOutcomes.cancelled} cancelled`}
            segments={[
              { color: palette.status.good, key: "attended", label: "Attended", value: charts.visitOutcomes.attended, valueText: String(charts.visitOutcomes.attended) },
              { color: palette.status.warning, key: "missed", label: "Missed", value: charts.visitOutcomes.missed, valueText: String(charts.visitOutcomes.missed) },
              { color: palette.other, key: "cancelled", label: "Cancelled", value: charts.visitOutcomes.cancelled, valueText: String(charts.visitOutcomes.cancelled) },
            ]}
          />
        </View> : null}
      </View>
    </ChartCard>

    <ChartCard
      emptyText="No leads were lost in this period."
      onRetry={onRetry}
      sampleSize={lost}
      status={lost > 0 ? "OK" : "NO_DATA"}
      title="Why leads were lost"
    >
      <View style={{ gap: spacing.lg }}>
        {activity.deadLeads.length > 0 ? (
          <BarList
            rows={[...activity.deadLeads]
              .sort((left, right) => right.total - left.total)
              .map((row) => ({
                color: palette.series[0],
                key: `${row.stage}-${row.reason}`,
                label: `${CLOSE_REASON_LABEL[row.reason] ?? row.reason}, as ${aOrAn(STAGE_LABEL[row.stage])}`,
                value: row.total,
                valueText: String(row.total),
              }))}
          />
        ) : null}
        {activity.lostEnquiries.length > 0 ? <View style={{ gap: spacing.sm }}>
          <Text style={useSubheading()}>Enquiries closed before any visit</Text>
          <BarList
            rows={activity.lostEnquiries.map((row) => ({
              color: palette.other,
              key: row.reason,
              label: CLOSE_REASON_LABEL[row.reason] ?? row.reason,
              value: row.total,
              valueText: String(row.total),
            }))}
          />
        </View> : null}
      </View>
    </ChartCard>

    {/* One card per row (user, 2026-10-18). */}
    <ChartCard onRetry={onRetry} sampleSize={1} status="OK" title="Coming back">
      <View style={{ gap: spacing.sm }}>
        <StatTile caption="after an earlier lead ended" label="Came back" value={String(activity.resumedLeads)} />
        <StatTile caption="of the people who came back" label="Moved in" value={String(activity.resumedConverted)} />
        <AnimatedPressable accessibilityHint="Opens the leads going cold" accessibilityRole="button" onPress={() => router.push("/owner-leads")}>
          <View pointerEvents="none">
            <StatTile caption="tap to see them on Leads" label="Going cold now" value={String(activity.goingCold)} />
          </View>
        </AnimatedPressable>
      </View>
    </ChartCard>
  </>;
}

function BiggestDropCard({
  drop,
  quickExitPercent,
  steps,
}: {
  drop: LeadInsights["biggestDrop"];
  quickExitPercent: number | null;
  steps: LeadInsights["steps"];
}) {
  const { colors, fonts, type } = useTheme();
  const before = drop ? steps.find((step) => step.key === drop.fromStep)?.people ?? 0 : 0;
  const glance = drop?.fromStep === "OPENED" && quickExitPercent != null ? ` ${quickExitPercent}% left within 10 seconds.` : "";
  return <Card>
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <AlertTriangle color={drop ? colors.danger : colors.muted} size={20} strokeWidth={2.2} />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
          {drop ? `Biggest drop: ${STEP_PEOPLE[drop.toStep].toLowerCase()}` : "Biggest drop"}
        </Text>
        <Text style={[type.description, { color: colors.muted }]}>
          {drop
            ? `${drop.lost} of ${before} ${STEP_PEOPLE[drop.fromStep].toLowerCase()} ${MISSED_STEP[drop.toStep]}.${glance}`
            : "Shows here once people open your listing. Views by you and your managers are not counted."}
        </Text>
      </View>
    </View>
  </Card>;
}

function Funnel({ drop, steps }: { drop: LeadInsights["biggestDrop"]; steps: LeadInsights["steps"] }) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const opened = steps[0]?.people ?? 0;
  return <View style={{ gap: spacing.sm }}>
    {steps.map((step, index) => {
      const width = opened === 0 ? 0 : Math.max(step.people > 0 ? 2 : 0, (step.people * 100) / opened);
      const previous = steps[index - 1];
      const lostPercent = previous && previous.people > 0
        ? Math.round(((previous.people - step.people) * 100) / previous.people)
        : null;
      const biggest = drop?.toStep === step.key;
      return <View key={step.key} style={{ gap: spacing.xs }}>
        {previous && lostPercent != null ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xxs }}>
            <ArrowDown color={biggest ? colors.danger : colors.muted} size={12} strokeWidth={2.4} />
            <FitText numberOfLines={1} style={{ color: biggest ? colors.danger : colors.muted, flex: 1, fontFamily: biggest ? fonts.sansBold : fonts.sans, fontSize: 11 }}>
              {`${lostPercent}% ${MISSED_STEP[step.key]}${biggest ? ", the biggest drop" : ""}`}
            </FitText>
          </View>
        ) : null}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <FitText numberOfLines={1} style={{ color: colors.ink, flex: 1, fontFamily: fonts.sans, fontSize: 13 }}>{STEP_PEOPLE[step.key]}</FitText>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13, fontVariant: ["tabular-nums"] }}>{step.people}</Text>
        </View>
        <View style={{ backgroundColor: palette.track, borderRadius: 4, height: 10 }}>
          <View style={{ backgroundColor: palette.series[0], borderRadius: 4, height: 10, width: `${width}%` }} />
        </View>
      </View>;
    })}
  </View>;
}

function OverTimeCard({ insights, onRetry }: { insights: LeadInsights; onRetry: () => void }) {
  const palette = useChartPalette();
  const [series, setSeries] = useState<"opened" | "gotInTouch">("opened");
  const points = insights.charts.overTime;
  const total = points.reduce((sum, point) => sum + point.opened + point.gotInTouch, 0);
  const weekly = insights.charts.bucket === "WEEK";
  return <ChartCard
    caption={insights.charts.bucket === "MONTH" ? "People per month." : weekly ? "People per week." : "People per day."}
    emptyText="Shows once people open your listing."
    info={["Tap a point to see its figure.", "Got in touch means a call tap or an enquiry that day."]}
    onRetry={onRetry}
    sampleSize={total}
    status={total > 0 ? "OK" : "NO_DATA"}
    title="Viewed and contacted"
    trailing={<ChartDropdown accessibilityLabel="Line shows" onChange={setSeries} options={[{ key: "opened", label: "Opened" }, { key: "gotInTouch", label: "In touch" }]} value={series} />}
  >
    <LineChart
      accessibilityLabel={series === "opened" ? "People who opened your listing over time" : "People who got in touch over time"}
      buckets={points.map((point) => ({
        key: point.from,
        label: dayLabel(point.from),
        value: series === "opened" ? point.opened : point.gotInTouch,
      }))}
      color={series === "opened" ? palette.series[0] : palette.series[1]}
      formatTick={(value) => String(Math.round(value))}
      formatValue={(value) => `${Math.round(value)} ${Math.round(value) === 1 ? "person" : "people"}`}
    />
  </ChartCard>;
}

/** Views by weekday and quarter of the day, darker for more. Every cell also has its count for screen readers. */
function Heatmap({ cells }: { cells: LeadInsights["charts"]["whenTheyLook"] }) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const counts = new Map(cells.map((cell) => [`${cell.weekday}-${cell.quarter}`, cell.views]));
  const most = Math.max(0, ...cells.map((cell) => cell.views));
  const busiest = cells.reduce<(typeof cells)[number] | null>((best, cell) => (best == null || cell.views > best.views ? cell : best), null);
  const shade = (views: number) => {
    if (views === 0 || most === 0) return palette.track;
    const step = Math.min(palette.ramp.length - 1, Math.floor((views / most) * palette.ramp.length - 0.0001));
    return palette.ramp[step];
  };
  return <View style={{ gap: spacing.sm }}>
    <View style={{ flexDirection: "row", gap: 3 }}>
      <View style={{ width: 64 }} />
      {WEEKDAYS.map((day, index) => (
        <Text key={index} style={{ color: colors.muted, flex: 1, fontFamily: fonts.sans, fontSize: 11, textAlign: "center" }}>{day}</Text>
      ))}
    </View>
    {QUARTER_SHORT.map((name, quarter) => (
      <View key={name} style={{ alignItems: "center", flexDirection: "row", gap: 3 }}>
        <FitText numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11, width: 64 }}>{name}</FitText>
        {WEEKDAYS.map((_, index) => {
          const views = counts.get(`${index + 1}-${quarter}`) ?? 0;
          return <View
            accessibilityLabel={`${views} ${views === 1 ? "view" : "views"}`}
            accessible
            key={index}
            style={{ backgroundColor: shade(views), borderRadius: radii.sm, flex: 1, height: 22 }}
          />;
        })}
      </View>
    ))}
    {busiest && busiest.views > 0 ? (
      <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>
        {`Busiest: ${["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][busiest.weekday - 1]}, ${QUARTERS[busiest.quarter]}.`}
      </Text>
    ) : null}
  </View>;
}

/** Stat tiles two to a row, never three: the labels get the room to read whole. */
function TileGrid({ children }: { children: ReactNode[] }) {
  const rows: ReactNode[][] = [];
  children.forEach((child, index) => {
    if (index % 2 === 0) rows.push([]);
    rows[rows.length - 1].push(child);
  });
  return <View style={{ gap: spacing.sm }}>
    {rows.map((row, index) => (
      <View key={index} style={{ flexDirection: "row", gap: spacing.sm }}>
        {row.map((child, column) => <View key={column} style={{ flex: 1, minWidth: 0 }}>{child}</View>)}
        {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
      </View>
    ))}
  </View>;
}

function useSubheading() {
  const { colors, fonts } = useTheme();
  return { color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 } as const;
}

/** "42 s", "8 m", "1 h 20 m", "6 h", "2 d". */
function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
  }
  return `${Math.round(hours / 24)} d`;
}

function percentText(value: number | null) {
  return value == null ? "-" : `${value}%`;
}

/** Only actions this screen names, so an older answer with an action since removed (2026-10-18) shows nothing for it. */
function isKnownAction(row: { action: string }) {
  return Object.hasOwn(ACTION_LABEL, row.action);
}

function share(part: number, whole: number) {
  return whole === 0 ? "0%" : `${Math.round((part * 100) / whole)}%`;
}

function aOrAn(noun: string) {
  return /^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`;
}

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function dayLabel(iso: string) {
  return DAY.format(new Date(`${iso}T00:00:00Z`));
}

