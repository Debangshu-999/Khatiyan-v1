import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { AirVent, BedDouble, CalendarClock, Check, ChevronDown, Filter, IndianRupee, Layers, RotateCcw, Search } from "lucide-react-native";

import { PropertyIcon } from "@/components/property-icon";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Section } from "@/components/section";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonCard } from "@/components/skeleton";
import { ActionButton, BackButton, ChoiceButton, FormInput, formatMoneyPaise, humanizeToken } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  ROOM_CONDITIONINGS,
  ROOM_TYPES,
  useListMyPropertiesQuery,
  useListPropertyRoomsQuery,
  type OwnerProperty,
  type OwnerRoom,
  type RoomConditioning,
  type RoomType,
} from "@/store/services/property-api";
import { useListPropertyRoomChangeRequestsQuery, useListPropertyTenanciesQuery, type TenancySummary } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ConditioningFilter = "ANY" | RoomConditioning;
type RoomTypeFilter = "ANY" | RoomType;
type UpcomingRoom = { beds: number; date: string; room: OwnerRoom };

type SearchCriteria = {
  conditioning: ConditioningFilter;
  floor: string;
  minBeds: string;
  roomType: RoomTypeFilter;
  showUpcoming: boolean;
};

const DEFAULT_CRITERIA: SearchCriteria = {
  conditioning: "ANY",
  floor: "",
  minBeds: "1",
  roomType: "ANY",
  showUpcoming: false,
};

function sameCriteria(left: SearchCriteria, right: SearchCriteria) {
  return left.conditioning === right.conditioning
    && left.floor.trim() === right.floor.trim()
    && left.minBeds === right.minBeds
    && left.roomType === right.roomType
    && left.showUpcoming === right.showUpcoming;
}

// Exact match = enough free beds AND the selected AC + room type + floor (or
// "Any" / blank). Rooms that have a vacancy but differ are surfaced as
// "similar" rather than hidden.
//
// Floor used to be excluded here and applied only as a sort preference, which
// put floor-1 rooms under a heading that says "Matches your search" when the
// search said floor 3. A stated filter has to hold for everything in that list.
function roomMatchesFilters(
  room: OwnerRoom,
  conditioning: ConditioningFilter,
  roomType: RoomTypeFilter,
  floorQuery: string,
) {
  return (conditioning === "ANY" || room.conditioning === conditioning)
    && (roomType === "ANY" || room.roomType === roomType)
    && (floorQuery === "" || (room.floor ?? "") === floorQuery);
}

// Within the "similar" bucket the requested floor still sorts first, so the
// nearest alternatives lead.
function compareByFloor(left: OwnerRoom, right: OwnerRoom, floorQuery: string) {
  if (floorQuery) {
    const leftOnFloor = (left.floor ?? "") === floorQuery ? 0 : 1;
    const rightOnFloor = (right.floor ?? "") === floorQuery ? 0 : 1;
    if (leftOnFloor !== rightOnFloor) {
      return leftOnFloor - rightOnFloor;
    }
  }
  return (left.floor ?? "").localeCompare(right.floor ?? "") || left.roomNumber.localeCompare(right.roomNumber);
}

export default function OwnerVacancyFinderScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);

  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const rooms = useMemo(() => (roomsQuery.data ?? []).filter((room) => room.active), [roomsQuery.data]);

  // The form is a draft until Search commits it. Filtering used to re-run on
  // every keystroke and every tap, so the list churned under the reader while
  // they were still choosing — and a half-typed floor emptied it in passing.
  // `applied` is the only thing the result memos and the queries read.
  //
  // The upcoming toggle is committed with the rest rather than acting live:
  // it is a filter like the others, and it also gates two network calls.
  const [draft, setDraft] = useState<SearchCriteria>(DEFAULT_CRITERIA);
  const [applied, setApplied] = useState<SearchCriteria>(DEFAULT_CRITERIA);
  const { conditioning, roomType, showUpcoming } = applied;

  const updateDraft = <K extends keyof SearchCriteria>(key: K, value: SearchCriteria[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const unsearched = !sameCriteria(draft, applied);
  const filtersSet = !sameCriteria(draft, DEFAULT_CRITERIA) || !sameCriteria(applied, DEFAULT_CRITERIA);

  // Active tenancies drive upcoming vacancies; fetched only when the toggle is
  // on so the default search keeps its current behaviour and cost.
  const tenanciesQuery = useListPropertyTenanciesQuery(
    { includePast: false, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty || !showUpcoming },
  );

  // An approved room change frees the tenant's CURRENT bed on its transfer date
  // just as surely as a notice period does — and unlike a notice it is already
  // committed, with the target bed held. Without this that bed never shows up.
  const roomChangeQuery = useListPropertyRoomChangeRequestsQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty || !showUpcoming,
  });

  const requiredBeds = Math.max(1, Number.isInteger(Number(applied.minBeds)) ? Number(applied.minBeds) : 1);
  const floorQuery = applied.floor.trim();

  // The floors this property actually has, so the filter cannot be set to one
  // that returns nothing. Free text let someone type "4" in a three-floor
  // building and read the empty result as a bug. "" leads, meaning any floor.
  const floorOptions = useMemo(() => {
    const present = new Set<string>();
    for (const room of rooms) {
      const value = (room.floor ?? "").trim();
      if (value) {
        present.add(value);
      }
    }
    // Numeric where possible — a string sort puts floor 10 between 1 and 2.
    const sorted = [...present].sort((left, right) => {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      return Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        ? leftNumber - rightNumber
        : left.localeCompare(right);
    });
    return ["", ...sorted];
  }, [rooms]);

  // Available-now rooms, split into exact matches and "similar" vacancies.
  // Min free beds + maintenance stay hard filters; AC / room type only decides
  // which bucket a room lands in, so non-matching rooms are no longer hidden.
  const { nowMatches, nowSimilar } = useMemo(() => {
    const matched: OwnerRoom[] = [];
    const similar: OwnerRoom[] = [];
    for (const room of rooms) {
      if (room.status === "MAINTENANCE" || room.availableVacancies < requiredBeds) {
        continue;
      }
      (roomMatchesFilters(room, conditioning, roomType, floorQuery) ? matched : similar).push(room);
    }
    matched.sort((left, right) => compareByFloor(left, right, floorQuery));
    similar.sort((left, right) => compareByFloor(left, right, floorQuery));
    return { nowMatches: matched, nowSimilar: similar };
  }, [conditioning, floorQuery, requiredBeds, roomType, rooms]);

  // roomId -> nearest future vacancy date (+ how many beds free up). A room
  // qualifies when a monthly tenancy is on notice with an end date, or a daily
  // tenancy has an end date, and that date is today or later.
  const roomUpcoming = useMemo(() => {
    const map = new Map<string, { beds: number; date: string }>();
    if (!showUpcoming) {
      return map;
    }
    const today = todayIso();

    function addVacancy(roomId: string, date: string) {
      const existing = map.get(roomId);
      if (existing) {
        map.set(roomId, { beds: existing.beds + 1, date: date < existing.date ? date : existing.date });
      } else {
        map.set(roomId, { beds: 1, date });
      }
    }

    for (const tenancy of tenanciesQuery.data ?? []) {
      const date = upcomingVacancyDate(tenancy, today);
      if (date) {
        addVacancy(tenancy.roomId, date);
      }
    }

    for (const request of roomChangeQuery.data ?? []) {
      if (request.status !== "APPROVED" || request.effectiveTransferDate < today) {
        continue;
      }
      addVacancy(request.currentRoomId, request.effectiveTransferDate);
    }

    return map;
  }, [showUpcoming, tenanciesQuery.data, roomChangeQuery.data]);

  // Full rooms that free up in the future, split the same way (matches vs
  // similar). Sorted by soonest vacancy.
  const { upcomingMatches, upcomingSimilar } = useMemo(() => {
    if (!showUpcoming) {
      return { upcomingMatches: [] as UpcomingRoom[], upcomingSimilar: [] as UpcomingRoom[] };
    }
    const matched: UpcomingRoom[] = [];
    const similar: UpcomingRoom[] = [];
    for (const room of rooms) {
      if (room.status === "MAINTENANCE" || room.availableVacancies >= requiredBeds) {
        continue; // maintenance, or already an "available now" room
      }
      const upcoming = roomUpcoming.get(room.id);
      if (!upcoming) {
        continue;
      }
      const entry: UpcomingRoom = { beds: upcoming.beds, date: upcoming.date, room };
      (roomMatchesFilters(room, conditioning, roomType, floorQuery) ? matched : similar).push(entry);
    }
    const bySoonest = (left: UpcomingRoom, right: UpcomingRoom) =>
      left.date.localeCompare(right.date) || left.room.roomNumber.localeCompare(right.room.roomNumber);
    matched.sort(bySoonest);
    similar.sort(bySoonest);
    return { upcomingMatches: matched, upcomingSimilar: similar };
  }, [conditioning, floorQuery, requiredBeds, roomType, rooms, roomUpcoming, showUpcoming]);

  const matchCount = nowMatches.length + upcomingMatches.length;
  const similarCount = nowSimilar.length + upcomingSimilar.length;
  const matchBeds = nowMatches.reduce((sum, room) => sum + room.availableVacancies, 0);
  const loadingUpcoming = showUpcoming && tenanciesQuery.isFetching && (tenanciesQuery.data ?? []).length === 0;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader onBack={() => router.back()}
        eyebrow="Owner tool"
        title="Vacancy"
        italicTail="finder."
        subtitle={selectedProperty ? `Search available rooms in ${selectedProperty.name}.` : "Select a property on Home first."}
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={PropertyIcon}
          title="No active property selected"
          description="Choose the property whose rooms you want to search from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <Card>
            <View style={{ gap: spacing.md }}>
              {/* Three mutually exclusive peers — the shared segmented
                  control, not a wrapped row of pills. */}
              <View style={{ gap: spacing.xs }}>
                <Text style={[type.caption, { color: colors.muted }]}>
                  Conditioning
                </Text>
                <SegmentedChoice
                  onChange={(value) => updateDraft("conditioning", value)}
                  options={["ANY", ...ROOM_CONDITIONINGS].map((option) => ({
                    label: option === "ANY" ? "Any" : humanizeToken(option),
                    value: option as ConditioningFilter,
                  }))}
                  value={draft.conditioning}
                />
              </View>

              {/* Seven options would wrap to three ragged rows as segments or
                  pills, so this one collapses into a picker. */}
              <OptionPicker
                label="Room type"
                onChange={(value) => updateDraft("roomType", value)}
                options={["ANY", ...ROOM_TYPES] as RoomTypeFilter[]}
                value={draft.roomType}
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <FormInput
                    keyboardType="number-pad"
                    label="Min free beds"
                    onChangeText={(value) => updateDraft("minBeds", value)}
                    placeholder="1"
                    value={draft.minBeds}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  {/* Floors are a closed set the property already knows, so
                      this is a picker rather than free text. Its label sits
                      above the bar, not inside it, so it lines up with the
                      field it stands beside. */}
                  <OptionPicker
                    format={(option) => (option === "" ? "Any floor" : `Floor ${option}`)}
                    label="Floor"
                    labelOutside
                    onChange={(value) => updateDraft("floor", value)}
                    options={floorOptions}
                    value={draft.floor}
                  />
                </View>
              </View>
              <UpcomingVacanciesToggle
                checked={draft.showUpcoming}
                onToggle={() => updateDraft("showUpcoming", !draft.showUpcoming)}
              />

              {/* Reset first, then the commit — the destructive-ish one never
                  sits where the thumb lands after reading the form. */}
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <ActionButton
                  disabled={!filtersSet}
                  icon={RotateCcw}
                  label="Reset"
                  onPress={() => {
                    setDraft(DEFAULT_CRITERIA);
                    setApplied(DEFAULT_CRITERIA);
                  }}
                  variant="outline"
                />
                <ActionButton disabled={!unsearched} icon={Search} label="Search" onPress={() => setApplied(draft)} />
              </View>
            </View>
          </Card>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Matches" value={String(matchCount)} hint={matchCount > 0 ? `${matchBeds} free now` : "Exact fit"} tone={matchCount > 0 ? "primary" : "default"} />
            <MetricTile
              label="Similar"
              value={String(similarCount)}
              hint={conditioning === "ANY" && roomType === "ANY" && floorQuery === "" ? "Set a filter" : "Other vacancies"}
            />
          </View>

          {roomsQuery.isFetching && rooms.length === 0 ? (
            <SkeletonCard />
          ) : loadingUpcoming && matchCount === 0 && similarCount === 0 ? (
            <SkeletonCard />
          ) : matchCount === 0 && similarCount === 0 ? (
            <EmptyState
              icon={Search}
              title={showUpcoming ? "No active or upcoming vacancies" : "No available rooms"}
              description={
                showUpcoming
                  ? "Nothing matches your search now or soon. Try fewer beds, another floor or type, or clear the conditioning filter."
                  : "No room fits these filters. Try fewer beds, another floor or type, or turn on upcoming vacancies."
              }
            />
          ) : (
            <>
              {matchCount > 0 ? (
                <Section title={`${matchCount} room${matchCount === 1 ? "" : "s"}`}>
                  {nowMatches.map((room) => (
                    <RoomResultCard key={room.id} highlight={Boolean(floorQuery) && (room.floor ?? "") === floorQuery} room={room} />
                  ))}
                  {upcomingMatches.map(({ beds, date, room }) => (
                    <RoomResultCard availableFrom={date} key={room.id} room={room} upcomingBeds={beds} />
                  ))}
                </Section>
              ) : null}
              {similarCount > 0 ? (
                <>
                  {matchCount > 0 ? (
                    <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
                      <View style={{ backgroundColor: colors.border, height: 1 }} />
                      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                        These do not match your filters, but they are vacant.
                      </Text>
                    </View>
                  ) : null}
                <Section title={`${similarCount} other room${similarCount === 1 ? "" : "s"}`}>
                  {nowSimilar.map((room) => (
                    <RoomResultCard key={room.id} highlight={Boolean(floorQuery) && (room.floor ?? "") === floorQuery} room={room} />
                  ))}
                  {upcomingSimilar.map(({ beds, date, room }) => (
                    <RoomResultCard availableFrom={date} key={room.id} room={room} upcomingBeds={beds} />
                  ))}
                </Section>
                </>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </ScreenScrollView>
  );
}

function RoomResultCard({
  availableFrom,
  highlight = false,
  room,
  upcomingBeds,
}: {
  availableFrom?: string;
  highlight?: boolean;
  room: OwnerRoom;
  upcomingBeds?: number;
}) {
  const { colors, fonts, type } = useTheme();
  const upcoming = Boolean(availableFrom);

  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: upcoming ? colors.accentSoft : highlight ? colors.primary : colors.primarySoft,
            borderRadius: 12,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          {upcoming ? (
            <CalendarClock color={colors.accent} size={20} strokeWidth={2.2} />
          ) : (
            <BedDouble color={highlight ? colors.onPrimary : colors.primary} size={20} strokeWidth={2.2} />
          )}
        </View>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, }}>
              Room {room.roomNumber}
            </Text>
            {upcoming ? (
              <View style={{ alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 999, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                <CalendarClock color={colors.accent} size={13} strokeWidth={2.4} />
                <Text style={[type.caption, { color: colors.accent, fontWeight: "900" }]}>
                  From {formatShortDate(availableFrom!)}
                </Text>
              </View>
            ) : (
              <Text style={[type.caption, { color: colors.primary, fontWeight: "900" }]}>
                {room.availableVacancies} free
              </Text>
            )}
          </View>
          <InfoLine icon={Layers} label="Floor" value={room.floor ? `Floor ${room.floor}` : "Unassigned"} />
          <InfoLine icon={BedDouble} label="Type" value={`${humanizeToken(room.roomType)} · ${room.occupiedCount}/${room.capacity} filled`} />
          {/* Conditioning is one of the two filters at the top of the screen,
              so it gets its own labelled row instead of a fragment buried in
              the middle of a dot-separated string. */}
          <InfoLine icon={AirVent} label="Conditioning" value={room.conditioning === "AC" ? "AC" : "Non-AC"} />
          {upcoming ? (
            <InfoLine icon={CalendarClock} label="Frees" value={`${upcomingBeds ?? 1} bed${(upcomingBeds ?? 1) === 1 ? "" : "s"} by ${formatShortDate(availableFrom!)}`} />
          ) : null}
          <InfoLine icon={IndianRupee} label="Rent" value={`${formatMoneyPaise(room.baseRentPaise)} / bed`} />
        </View>
      </View>
    </Card>
  );
}

/**
 * A single-choice picker, matching the staff category filter.
 *
 * <p>A labelled bar that opens a sheet, rather than a wall of chips. Seven room
 * types laid out flat wrapped to three ragged rows and pushed the results off
 * screen — the thing the filters exist to reveal.
 */
function OptionPicker<T extends string>({
  format,
  label,
  labelOutside,
  onChange,
  options,
  value,
}: {
  /** Overrides the default enum-token wording — floors are not enum tokens. */
  format?: (option: T) => string;
  label: string;
  /**
   * Lifts the label out of the bar and sizes the bar like a FormInput, for a
   * picker standing in a row beside one. With the label inside, the bar is
   * taller and its caption sits where the input's box starts, so the pair
   * reads as two misaligned controls.
   */
  labelOutside?: boolean;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const labelOf = format ?? ((option: T) => (option === "ANY" ? "Any" : humanizeToken(option)));

  const trigger = labelOutside ? (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: colors.inkSoft }]}>
        {label}
      </Text>
      <AnimatedPressable
        accessibilityLabel={`${label}: ${labelOf(value)}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 14,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: spacing.xs,
          minHeight: 50,
          paddingHorizontal: spacing.md,
        }}
      >
        <Text numberOfLines={1} style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansMedium, fontSize: 15 }}>
          {labelOf(value)}
        </Text>
        <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
      </AnimatedPressable>
    </View>
  ) : (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={() => setOpen(true)}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Filter color={colors.kicker} size={16} strokeWidth={2.2} />
      <View style={{ flex: 1 }}>
        <Text style={[type.caption, { color: colors.kicker }]}>
          {label}
        </Text>
        <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink }]}>
          {labelOf(value)}
        </Text>
      </View>
      <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );

  return (
    <>
      {trigger}

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title={`Filter by ${label.toLowerCase()}`}>
          <View style={{ gap: spacing.xs }}>
            {options.map((option) => {
              const active = option === value;
              return (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={option || "__any"}
                  onPress={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  style={{
                    alignItems: "center",
                    backgroundColor: active ? colors.ink : colors.surface,
                    borderColor: active ? colors.ink : colors.border,
                    borderRadius: 12,
                    borderWidth: 1,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Text style={[type.body, { color: active ? colors.surface : colors.ink }]}>
                    {labelOf(option)}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </SheetShell>
      ) : null}
    </>
  );
}

function ChoiceRow<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {options.map((option) => (
          <ChoiceButton active={option === value} key={option} label={option === "ANY" ? "Any" : humanizeToken(option)} onPress={() => onChange(option)} />
        ))}
      </View>
    </View>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Icon color={colors.kicker} size={14} strokeWidth={2.1} />
      <Text style={[type.caption, { color: colors.muted }]}>
        {label}
      </Text>
      <Text style={[type.caption, { color: colors.ink, flex: 1, fontWeight: "700", textAlign: "right" }]}>
        {value}
      </Text>
    </View>
  );
}

function UpcomingVacanciesToggle({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const { colors, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: checked ? colors.primary : "transparent",
          borderColor: checked ? colors.primary : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 6,
          borderWidth: 1.5,
          height: 22,
          justifyContent: "center",
          width: 22,
        }}
      >
        {checked ? <Check color={colors.onPrimary} size={14} strokeWidth={3} /> : null}
      </View>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>
        Show upcoming future vacancies
      </Text>
    </Pressable>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}

// A tenancy contributes an upcoming vacancy when a monthly stay is on notice or a
// daily stay has its checkout set, and that date is today or later. Active daily
// stays keep the checkout in plannedEndDate (endDate is null until they actually
// end); monthly stays on notice carry it in endDate. Returns the vacancy date
// (ISO yyyy-MM-dd) or null.
function upcomingVacancyDate(tenancy: TenancySummary, today: string): string | null {
  if (tenancy.billingType === "DAILY") {
    return tenancy.plannedEndDate && tenancy.plannedEndDate >= today ? tenancy.plannedEndDate : null;
  }
  if (tenancy.billingType === "MONTHLY" && (tenancy.status === "ON_NOTICE" || tenancy.status === "ON_PREMATURE_NOTICE")) {
    return tenancy.endDate && tenancy.endDate >= today ? tenancy.endDate : null;
  }
  return null;
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return iso;
  }
  const suffix = year === new Date().getFullYear() ? "" : ` ${year}`;
  return `${day} ${SHORT_MONTHS[month - 1]}${suffix}`;
}
