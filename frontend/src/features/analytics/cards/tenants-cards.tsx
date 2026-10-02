import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";

import { ChartCard, ChartDropdown } from "@/components/charts/chart-card";
import { Donut } from "@/components/charts/donut";
import { LineChart } from "@/components/charts/line-chart";
import { OrderedColumns } from "@/components/charts/ordered-columns";
import { PairedColumns } from "@/components/charts/paired-columns";
import { SegmentedBar } from "@/components/charts/segmented-bar";
import { HeroFigure, StatTile } from "@/components/charts/stat-tile";
import { countDelta, moneyDelta, partValue, pointsDelta } from "@/features/analytics/cards/card-helpers";
import { formatDuration, formatStayLength, percentOf } from "@/features/analytics/format";
import { bucketLabel, istToday, monthName, periodSectionTitle } from "@/features/analytics/period";
import type { CardProps } from "@/features/analytics/registry";
import { figureOf, type MetricResult } from "@/features/analytics/types";
import { useChartPalette } from "@/theme/chart-colors";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const figure = (metric: MetricResult, key: string) => figureOf(metric, key)?.value ?? 0;
const previousOf = (metric: MetricResult, key: string) => figureOf(metric, key)?.previous ?? null;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const beds = (n: number) => plural(n, "bed", "beds");
const rooms = (n: number) => plural(n, "room", "rooms");
const stays = (n: number) => plural(n, "stay", "stays");
const tenants = (n: number) => plural(n, "tenant", "tenants");

type Slice = { color: string; key: string; label: string };

/** Parts in the card's own order and colours, with the server's counts. Zeros are dropped unless the card asks to keep them. */
function slicesOf(metric: MetricResult, slices: Slice[], keepZeros = false) {
  return slices
    .map((slice) => ({ ...slice, value: partValue(metric, slice.key), valueText: String(partValue(metric, slice.key)) }))
    .filter((slice) => keepZeros || slice.value > 0);
}

function columnsOf(metric: MetricResult, columns: { key: string; label: string }[]) {
  return columns.map((column) => ({ ...column, value: partValue(metric, column.key) }));
}

/** A muted one-line note inside a card body. */
function Note({ children }: { children: string }) {
  const { colors, fonts } = useTheme();
  return <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>{children}</Text>;
}

/**
 * A small heading inside a card that shows two things, e.g. "Right now" above
 * "Last 6 months". Coloured by which it is (owner's call, 2026-09-27), so the
 * live half and the period half read apart at a glance: deep jade for now,
 * deep blue for the period, bold. Text colours only, never a fill. A dotted
 * underline was tried and dropped (owner's call, 2026-09-27).
 */
function Part({
  children,
  first,
  title,
  when,
}: {
  children: ReactNode;
  first?: boolean;
  title: string;
  when: "now" | "period";
}) {
  const { colors, fonts } = useTheme();
  const tone = when === "now" ? colors.jadeDeep : colors.primaryDeep;
  return (
    <View style={[{ gap: spacing.sm }, first ? null : { borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.xs, paddingTop: spacing.sm }]}>
      <Text style={{ color: tone, fontFamily: fonts.sansBold, fontSize: 12.5 }}>{title}</Text>
      {children}
    </View>
  );
}


/** "Right now · Sep 2026": the month the live figures belong to, in IST. */
function rightNowTitle(): string {
  const [year, month] = istToday().split("-");
  return `Right now · ${monthName(Number(month))} ${year}`;
}

// ---- Occupancy ---------------------------------------------------------------

/**
 * Beds right now, then the occupancy rate over the period from stay records:
 * a line by month, or one figure with its change for a single month.
 */
export function OccupancyCard({ compareLabel, metric, onRetry, period }: CardProps) {
  const palette = useChartPalette();
  const total = figure(metric, "total_beds");
  const occupied = partValue(metric, "OCCUPIED");
  const slices = slicesOf(metric, [
    { color: palette.series[0], key: "OCCUPIED", label: "Occupied" },
    { color: palette.series[2], key: "RESERVED", label: "Reserved" },
    { color: palette.other, key: "VACANT", label: "Vacant" },
    { color: palette.series[3], key: "UNAVAILABLE", label: "Unavailable" },
  ]);
  const rate = percentOf(figure(metric, "occupied_nights"), figure(metric, "bed_nights"));
  const previousNights = previousOf(metric, "occupied_nights");
  const previousBeds = previousOf(metric, "bed_nights");
  const previousRate = previousNights !== null && previousBeds !== null ? percentOf(previousNights, previousBeds) : null;
  const trend = metric.series.length > 1;
  const buckets = metric.series.map((point) => ({
    key: point.from,
    label: bucketLabel(point.from, point.to, period.bucket),
    value: point.values.beds ? percentOf(point.values.occupied ?? 0, point.values.beds) : null,
  }));
  return (
    <ChartCard
      emptyText="No beds set up yet"
      info={[
        "Occupied: someone is living in the bed, monthly or daily.",
        "Reserved: held for someone moving in.",
        "Vacant: empty and free to let.",
        "Unavailable: empty beds in rooms under maintenance.",
        { formula: ["Occupancy", "=", { over: ["Occupied beds", "All beds"] }, "× 100"] },
        {
          formula: ["Over the period", "=", { over: ["Nights beds were occupied", "Nights beds existed"] }, "× 100"],
          note: "Built from your stay records, so it reaches back to when this property joined. Beds are counted as they are today.",
        },
        "Rooms you have turned off are not counted.",
        ...(trend ? ["Tap a month to see its figure."] : []),
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Occupancy"
    >
      <Part first title={rightNowTitle()} when="now">
        <Donut
          accessibilityLabel={slices.map((slice) => `${slice.label} ${beds(slice.value)}`).join(", ")}
          centerLabel="today"
          centerValue={`${percentOf(occupied, total) ?? 0}%`}
          slices={slices}
        />
        <Note>{`${beds(total)} in all`}</Note>
      </Part>
      <Part title={periodSectionTitle(period)} when="period">
        <HeroFigure delta={pointsDelta(rate, previousRate, compareLabel)} suffix="on an average night" value={rate === null ? "—" : `${rate}%`} />
        {/* Said on the card: the ring is today, this is every night of the period averaged, and they differ whenever anyone moved. */}
        <Note>{trend ? "Each point is that month's own average. The dashed line is the whole period's." : "Every night of the period, averaged. Today's figure is in the ring above."}</Note>
        {trend ? (
          <LineChart
            accessibilityLabel={buckets.map((bucket) => `${bucket.label} ${bucket.value === null ? "no beds yet" : `${bucket.value}%`}`).join(", ")}
            buckets={buckets}
            formatTick={(tick) => `${tick}%`}
            formatValue={(value) => `${value}%`}
            reference={rate === null ? undefined : { label: `avg ${rate}%`, value: rate }}
          />
        ) : null}
      </Part>
    </ChartCard>
  );
}

const VACANCY_BANDS = [
  { key: "D0_6", label: "Under 7d" },
  { key: "D7_30", label: "7–30d" },
  { key: "D31_90", label: "31–90d" },
  { key: "D90_PLUS", label: "90+d" },
];

const ROOM_TYPES: Record<string, string> = {
  DORMITORY: "Dormitory",
  DOUBLE: "Double",
  FOUR_SHARING: "4 sharing",
  OTHER: "Other",
  SINGLE: "Single",
  TRIPLE: "Triple",
};
const ROOM_TYPE_ORDER = ["SINGLE", "DOUBLE", "TRIPLE", "FOUR_SHARING", "DORMITORY", "OTHER"];

type VacancyState = "FULL" | "PARTIAL";

/**
 * Rooms with a free bed, by how long they have been that way. Beds are not
 * tracked one by one, so this is per room. Part keys are STATE.TYPE.BAND and the
 * two menus pick which state and which room type the columns count.
 */
export function RoomVacancyCard({ metric, onRetry }: CardProps) {
  const [state, setState] = useState<VacancyState>("FULL");
  const [type, setType] = useState("ALL");
  const parsed = metric.parts.map((part) => {
    const [partState, partType, band] = part.key.split(".");
    return { band, state: partState, type: partType, value: part.value };
  });
  const types = ROOM_TYPE_ORDER.filter((key) => parsed.some((part) => part.type === key));
  const chosen = parsed.filter((part) => part.state === state && (type === "ALL" || part.type === type));
  const buckets = VACANCY_BANDS.map((band) => ({ ...band, value: chosen.filter((part) => part.band === band.key).reduce((sum, part) => sum + part.value, 0) }));
  const count = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const stateLabel = state === "FULL" ? "fully vacant" : "partly vacant";
  const typeLabel = type === "ALL" ? "" : ` ${ROOM_TYPES[type].toLowerCase()}`;
  return (
    <ChartCard
      emptyText="Every room is full right now"
      info={[
        "Rooms with at least one free bed, and how long they have been that way.",
        "Fully vacant: nobody lives in the room and no bed is reserved.",
        "Partly vacant: some beds are taken and at least one is free.",
        "How long: since the last tenant moved out of the room, or since the room was added if nobody has left it yet.",
        "Khatiyan tracks rooms, not single beds, so this is counted per room.",
        "Nothing counts from before this property joined Khatiyan. Rooms under maintenance are left out.",
        "Tap a column to see its exact figure.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="How long rooms have been empty"
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <ChartDropdown
          accessibilityLabel="Rooms shown"
          onChange={setState}
          options={[
            { key: "FULL", label: `Fully vacant (${figure(metric, "fully_vacant_rooms")})` },
            { key: "PARTIAL", label: `Partly vacant (${figure(metric, "partly_vacant_rooms")})` },
          ]}
          value={state}
        />
        <ChartDropdown
          accessibilityLabel="Room type"
          onChange={setType}
          options={[{ key: "ALL", label: "All room types" }, ...types.map((key) => ({ key, label: ROOM_TYPES[key] }))]}
          value={type}
        />
      </View>
      {count === 0 ? (
        <Note>{`No${typeLabel} rooms are ${stateLabel} right now`}</Note>
      ) : (
        <>
          <HeroFigure suffix={`${typeLabel.trim() ? `${typeLabel.trim()} ` : ""}${count === 1 ? "room" : "rooms"} ${stateLabel}`} value={String(count)} />
          <OrderedColumns
            accessibilityLabel={buckets.map((bucket) => `${bucket.label} ${rooms(bucket.value)}`).join(", ")}
            buckets={buckets}
            formatTick={(tick) => String(tick)}
            formatValue={rooms}
            integer
          />
        </>
      )}
    </ChartCard>
  );
}

/**
 * Stays right now, then stays over the period: how many monthly and daily stays
 * spent a night here in each month, or two tiles with their change for one month.
 */
export function StayTypeCard({ compareLabel, metric, onRetry, period }: CardProps) {
  const palette = useChartPalette();
  const segments = slicesOf(metric, [
    { color: palette.pair[0], key: "MONTHLY", label: "Monthly" },
    { color: palette.pair[1], key: "DAILY", label: "Daily guests" },
  ], true);
  const trend = metric.series.length > 1;
  const monthly = figure(metric, "monthly");
  const daily = figure(metric, "daily");
  return (
    <ChartCard
      emptyText="Nobody has stayed here yet"
      info={[
        "Right now: everyone staying today, by the kind of stay.",
        "Over the period: stays that spent at least one night here. A tenant who stayed all month counts once in that month.",
        "Daily guests: hotel-style stays with no account.",
        ...(trend ? ["Tap a month to see its figures."] : []),
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Monthly and daily stays"
    >
      <Part first title={rightNowTitle()} when="now">
        <SegmentedBar accessibilityLabel={segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")} segments={segments} />
      </Part>
      <Part title={periodSectionTitle(period)} when="period">
        {trend ? (
          <PairedColumns
            accessibilityLabel={metric.series.map((point) => `${bucketLabel(point.from, point.to, period.bucket)}: monthly ${point.values.monthly ?? 0}, daily ${point.values.daily ?? 0}`).join(". ")}
            buckets={metric.series.map((point) => ({
              a: point.values.monthly ?? 0,
              b: point.values.daily ?? 0,
              key: point.from,
              label: bucketLabel(point.from, point.to, period.bucket),
            }))}
            formatTick={(tick) => String(tick)}
            formatValue={(value) => String(value)}
            seriesA={{ color: palette.pair[0], label: "Monthly" }}
            seriesB={{ color: palette.pair[1], label: "Daily guests" }}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            <StatTile delta={countDelta(monthly, previousOf(metric, "monthly"), compareLabel, true)} label="Monthly stays" value={String(monthly)} />
            <StatTile delta={countDelta(daily, previousOf(metric, "daily"), compareLabel, true)} label="Daily guests" value={String(daily)} />
          </View>
        )}
      </Part>
    </ChartCard>
  );
}

// ---- Tenants -----------------------------------------------------------------

export function UpcomingExitsCard({ metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  const total = figure(metric, "total");
  const pending = partValue(metric, "PENDING_EXIT");
  const segments = slicesOf(metric, [
    { color: palette.series[0], key: "NOTICE", label: "On notice" },
    { color: palette.status.serious, key: "PREMATURE", label: "Leaving early" },
    { color: palette.series[2], key: "TERM_END", label: "Term ends" },
    { color: palette.status.critical, key: "PENDING_EXIT", label: "Pending exit" },
  ], true);
  return (
    <ChartCard
      emptyText="Nobody is leaving in the next 30 days"
      footnote={pending > 0 ? `${plural(pending, "stay is", "stays are")} past the checkout date. End ${pending === 1 ? "it" : "them"} from the tenancy list.` : null}
      info={[
        "Monthly tenants moving out in the next 30 days, and any whose checkout date has already passed.",
        "On notice: gave notice as the rules allow.",
        "Leaving early: leaving before their notice or term allows.",
        "Term ends: a fixed-term agreement reaching its end date. The stay ends with it.",
        "Pending exit: past the checkout date and waiting for you to end the stay. Billing has stopped, and the bed stays held until you do.",
        "A stay never ends by itself. You end it from the end-tenancy screen.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Moving out soon"
    >
      <HeroFigure suffix="leaving" value={String(total)} />
      <SegmentedBar accessibilityLabel={segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")} segments={segments} />
    </ChartCard>
  );
}

const TENURE = [
  { key: "M0_3", label: "<3m" },
  { key: "M3_6", label: "3–6m" },
  { key: "M6_12", label: "6–12m" },
  { key: "Y1_2", label: "1–2y" },
  { key: "Y2_PLUS", label: "2y+" },
];

export function TenureCard({ metric, onRetry }: CardProps) {
  const buckets = columnsOf(metric, TENURE);
  const median = figureOf(metric, "median_days")?.value;
  return (
    <ChartCard
      emptyText="No monthly tenants right now"
      info={[
        "How long each monthly tenant living here has stayed so far.",
        "It counts from the day their stay began in Khatiyan, never before this property joined.",
        "Median: half have stayed longer, half shorter. It shows from 5 tenants.",
        "Tap a column to see its exact figure.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="How long tenants have stayed"
    >
      {median != null ? <HeroFigure suffix="median so far" value={formatStayLength(median)} /> : <Note>The median shows from 5 tenants</Note>}
      <OrderedColumns
        accessibilityLabel={buckets.map((bucket) => `${bucket.label} ${tenants(bucket.value)}`).join(", ")}
        buckets={buckets}
        formatTick={(tick) => String(tick)}
        formatValue={tenants}
        integer
      />
    </ChartCard>
  );
}

type ProfileView = "GENDER" | "AGE";

/** One donut, switched between gender and age by the menu. Counts only, from 5 tenants. */
export function ProfileCard({ metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  const [view, setView] = useState<ProfileView>("GENDER");
  const slices =
    view === "GENDER"
      ? slicesOf(metric, [
          { color: palette.series[0], key: "GENDER_MALE", label: "Male" },
          { color: palette.series[1], key: "GENDER_FEMALE", label: "Female" },
          { color: palette.series[2], key: "GENDER_TRANSGENDER", label: "Transgender" },
          { color: palette.series[3], key: "GENDER_OTHER", label: "Others" },
          { color: palette.other, key: "GENDER_NOT_GIVEN", label: "Not given" },
        ])
      : slicesOf(metric, [
          { color: palette.ramp[0], key: "AGE_UNDER_18", label: "Under 18" },
          { color: palette.ramp[1], key: "AGE_18_24", label: "18–24" },
          { color: palette.ramp[2], key: "AGE_25_34", label: "25–34" },
          { color: palette.ramp[3], key: "AGE_35_44", label: "35–44" },
          { color: palette.ramp[4], key: "AGE_45_PLUS", label: "45+" },
          { color: palette.other, key: "AGE_NOT_GIVEN", label: "Not given" },
        ]);
  return (
    <ChartCard
      emptyText="No monthly tenants right now"
      info={[
        "Gender and age of the monthly tenants living here, from their profiles.",
        "Age is worked out from each tenant's date of birth.",
        "Not given: left blank, or they chose not to say.",
        "Counts only, and only from 5 tenants, so no one can be picked out.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Who your tenants are"
      tooFewText={`${tenants(metric.sampleSize)} so far. It shows from 5, so no one can be picked out`}
      trailing={
        <ChartDropdown
          accessibilityLabel="Shown by"
          onChange={setView}
          options={[
            { key: "GENDER", label: "Gender" },
            { key: "AGE", label: "Age" },
          ]}
          value={view}
        />
      }
    >
      <Donut
        accessibilityLabel={slices.map((slice) => `${slice.label} ${tenants(slice.value)}`).join(", ")}
        centerLabel={metric.sampleSize === 1 ? "tenant" : "tenants"}
        centerValue={String(metric.sampleSize)}
        slices={slices}
      />
    </ChartCard>
  );
}

export function IdVerificationCard({ metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  const slices = slicesOf(metric, [
    { color: palette.status.good, key: "EKYC", label: "e-KYC verified" },
    { color: palette.status.info, key: "MANUAL", label: "Checked by you" },
    { color: palette.status.warning, key: "NONE", label: "Not verified" },
  ]);
  const checked = partValue(metric, "EKYC") + partValue(metric, "MANUAL");
  return (
    <ChartCard
      emptyText="No monthly tenants right now"
      info={[
        "e-KYC verified: the tenant passed an Aadhaar check through Khatiyan.",
        "Checked by you: you confirmed at onboarding that you saw their ID.",
        "Not verified: neither. Usually stays from before the ID check was required.",
        "A stay counts once, by its strongest check.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="ID checks"
    >
      <Donut
        accessibilityLabel={slices.map((slice) => `${slice.label} ${slice.value}`).join(", ")}
        centerLabel="checked"
        centerValue={`${percentOf(checked, metric.sampleSize) ?? 0}%`}
        slices={slices}
      />
    </ChartCard>
  );
}

// ---- Agreements ----------------------------------------------------------------

export function AgreementStatusCard({ metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  const slices = slicesOf(metric, [
    { color: palette.status.good, key: "SIGNED", label: "Signed" },
    { color: palette.status.warning, key: "AWAITING", label: "Awaiting signature" },
    { color: palette.status.info, key: "DRAFT", label: "Draft" },
    { color: palette.status.neutral, key: "NONE", label: "None" },
  ]);
  const signed = partValue(metric, "SIGNED");
  return (
    <ChartCard
      emptyText="No monthly tenants right now"
      info={[
        "Monthly tenants living here, and those still to accept their agreement, by where their agreement stands.",
        "Signed: the tenant accepted it.",
        "Awaiting signature: sent, and the tenant has not accepted it yet.",
        "Draft: not sent yet.",
        "None: no agreement, or a cancelled one. Usually stays from before agreements were required.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Agreement status"
    >
      <Donut
        accessibilityLabel={slices.map((slice) => `${slice.label} ${slice.value}`).join(", ")}
        centerLabel="signed"
        centerValue={`${percentOf(signed, metric.sampleSize) ?? 0}%`}
        slices={slices}
      />
    </ChartCard>
  );
}

export function AgreementTermsCard({ metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  const segments = slicesOf(metric, [
    { color: palette.series[0], key: "FIXED", label: "Fixed term" },
    { color: palette.series[1], key: "INDEFINITE", label: "Indefinite" },
  ], true);
  return (
    <ChartCard
      emptyText="No monthly tenants right now"
      info={[
        "Fixed term: the agreement runs for a set number of months, and the stay ends on its date.",
        "Indefinite: no end date. The stay runs until the tenant gives notice.",
        "A fixed-term stay past its end date is still a fixed term. It is Pending exit, waiting for you to end it.",
        "A stay with no agreement counts as indefinite.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Fixed and indefinite terms"
    >
      <SegmentedBar accessibilityLabel={segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")} segments={segments} />
    </ChartCard>
  );
}

const AGREEMENTS_ENDING = [
  { key: "D0_30", label: "0–30d" },
  { key: "D31_60", label: "31–60d" },
  { key: "D61_90", label: "61–90d" },
];

export function TermsEndingCard({ metric, onRetry }: CardProps) {
  const buckets = columnsOf(metric, AGREEMENTS_ENDING);
  const fixed = figure(metric, "fixed_terms");
  const endedOpen = figure(metric, "ended_open");
  const ending = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  return (
    <ChartCard
      emptyText="No fixed-term agreements running"
      footnote={`${plural(fixed, "stay is", "stays are")} on a fixed term.${endedOpen > 0 ? ` ${plural(endedOpen, "agreement has", "agreements have")} already ended, waiting for you to end the stay.` : ""}`}
      info={[
        "Fixed-term agreements ending in the next 90 days. The stay ends with the agreement.",
        "An agreement already past its end date is not in the columns. Its stay is Pending exit, waiting for you to end it, and the note below counts it.",
        "Tap a column to see its exact figure.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Agreements ending"
    >
      {ending === 0 ? (
        <Note>None end in the next 90 days</Note>
      ) : (
        <OrderedColumns
          accessibilityLabel={buckets.map((bucket) => `${bucket.label} ${stays(bucket.value)}`).join(", ")}
          buckets={buckets}
          formatTick={(tick) => String(tick)}
          formatValue={stays}
          integer
        />
      )}
    </ChartCard>
  );
}

export function TimeToSignCard({ compareLabel, metric, onRetry, period }: CardProps) {
  const median = figureOf(metric, "median_minutes");
  const signed = figure(metric, "signed");
  return (
    <ChartCard
      caption={periodSectionTitle(period)}
      emptyText="No agreements signed in this period"
      footnote={`${plural(signed, "agreement", "agreements")} signed`}
      info={[
        { formula: ["Time to sign", "=", "Signed at − Created at"], note: "From when the agreement was created at onboarding to when the tenant accepted it." },
        "Median: half were signed faster, half slower. It shows from 5 signed agreements.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Time to sign"
      tooFewText={`${plural(signed, "agreement", "agreements")} signed. The median shows from 5`}
    >
      {median ? (
        <HeroFigure delta={moneyDelta(median.value, median.previous, compareLabel, false)} suffix="median" value={formatDuration(median.value)} />
      ) : null}
    </ChartCard>
  );
}

// ---- Food and moves ----------------------------------------------------------------

export function MealPreferencesCard({ metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  const profiles = metric.parts.filter((part) => part.key !== "OTHER" && part.key !== "NOT_SUBSCRIBED");
  const slices = [
    ...profiles.map((part, index) => ({ color: palette.series[index], key: part.key, label: part.label ?? "Profile", value: part.value, valueText: String(part.value) })),
    { color: palette.other, key: "OTHER", label: "Other", value: partValue(metric, "OTHER"), valueText: String(partValue(metric, "OTHER")) },
    { color: palette.series[4], key: "NOT_SUBSCRIBED", label: "Not subscribed", value: partValue(metric, "NOT_SUBSCRIBED"), valueText: String(partValue(metric, "NOT_SUBSCRIBED")) },
  ].filter((slice) => slice.value > 0);
  const eating = metric.sampleSize - partValue(metric, "NOT_SUBSCRIBED");
  return (
    <ChartCard
      emptyText="No monthly tenants right now"
      info={[
        "Monthly tenants living here, by the food profile they are subscribed to.",
        "Your four largest profiles are shown, the rest are grouped as Other.",
        "Not subscribed: not on any food profile.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Meal preferences"
    >
      <Donut accessibilityLabel={slices.map((slice) => `${slice.label} ${slice.value}`).join(", ")} centerLabel="on food" centerValue={String(eating)} slices={slices} />
    </ChartCard>
  );
}

/**
 * Two counts over time: paired columns with the net under each bucket, or two
 * tiles with their change when the period is a single month.
 */
function TwoCountsCard({
  aGood,
  aKey,
  aLabel,
  bKey,
  bLabel,
  compareLabel,
  emptyText,
  info,
  metric,
  onRetry,
  period,
  title,
}: CardProps & { aGood: boolean; aKey: string; aLabel: string; bKey: string; bLabel: string; emptyText: string; info: string[]; title: string }) {
  const palette = useChartPalette();
  const trend = metric.series.length > 1;
  const a = figure(metric, aKey);
  const b = figure(metric, bKey);
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
  return (
    <ChartCard
      caption={periodSectionTitle(period)}
      emptyText={emptyText}
      info={[...info, ...(trend ? ["Tap a month to see its figures."] : [])]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title={title}
    >
      {trend ? (
        <PairedColumns
          accessibilityLabel={metric.series.map((point) => `${bucketLabel(point.from, point.to, period.bucket)}: ${aLabel} ${point.values[aKey] ?? 0}, ${bLabel} ${point.values[bKey] ?? 0}`).join(". ")}
          buckets={metric.series.map((point) => ({
            a: point.values[aKey] ?? 0,
            b: point.values[bKey] ?? 0,
            footer: signed((point.values[aKey] ?? 0) - (point.values[bKey] ?? 0)),
            key: point.from,
            label: bucketLabel(point.from, point.to, period.bucket),
          }))}
          formatTick={(tick) => String(tick)}
          formatValue={(value) => String(value)}
          seriesA={{ color: palette.pair[0], label: aLabel }}
          seriesB={{ color: palette.pair[1], label: bLabel }}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <StatTile delta={countDelta(a, previousOf(metric, aKey), compareLabel, aGood)} label={aLabel} value={String(a)} />
          <StatTile delta={countDelta(b, previousOf(metric, bKey), compareLabel, !aGood)} label={bLabel} value={String(b)} />
        </View>
      )}
    </ChartCard>
  );
}

export function MovesCard(props: CardProps) {
  return (
    <TwoCountsCard
      {...props}
      aGood
      aKey="move_ins"
      aLabel="Moved in"
      bKey="move_outs"
      bLabel="Moved out"
      emptyText="Nobody moved in or out in this period"
      info={[
        "Moved in: monthly tenants whose stay began.",
        "Moved out: monthly tenants who left or were evicted.",
        "The number under each month is moved in minus moved out.",
        "Room changes and daily guests are not counted.",
      ]}
      title="Move-ins and move-outs"
    />
  );
}

export function FoodSubscriptionsCard(props: CardProps) {
  return (
    <TwoCountsCard
      {...props}
      aGood
      aKey="started"
      aLabel="Started"
      bKey="ended"
      bLabel="Ended"
      emptyText="No food subscriptions started or ended in this period"
      info={["Started: food subscriptions that began.", "Ended: subscriptions that stopped, including when a tenant moved out.", "The number under each month is started minus ended."]}
      title="Food subscriptions"
    />
  );
}
