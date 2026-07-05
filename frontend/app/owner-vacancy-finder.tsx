import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { BedDouble, Building2, CalendarClock, Check, IndianRupee, Layers, Search } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard } from "@/components/skeleton";
import { BackButton, ChoiceButton, FormInput, formatMoneyPaise, humanizeToken } from "@/features/owner/owner-ui";
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
import { useListPropertyTenanciesQuery, type TenancySummary } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ConditioningFilter = "ANY" | RoomConditioning;
type RoomTypeFilter = "ANY" | RoomType;
type UpcomingRoom = { beds: number; date: string; room: OwnerRoom };

// Exact match = enough free beds AND the selected AC + room type (or "Any").
// Rooms that have a vacancy but differ in AC / type are surfaced as "similar".
function roomMatchesType(room: OwnerRoom, conditioning: ConditioningFilter, roomType: RoomTypeFilter) {
  return (conditioning === "ANY" || room.conditioning === conditioning)
    && (roomType === "ANY" || room.roomType === roomType);
}

// Floor is a soft preference: requested-floor rooms sort first, then by floor.
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

  const [conditioning, setConditioning] = useState<ConditioningFilter>("ANY");
  const [roomType, setRoomType] = useState<RoomTypeFilter>("ANY");
  const [minBeds, setMinBeds] = useState("1");
  const [floor, setFloor] = useState("");
  // Opt-in: also surface rooms that are full now but free up soon (a monthly
  // tenancy on notice with an end date, or a daily tenancy with an end date).
  const [showUpcoming, setShowUpcoming] = useState(false);

  // Active tenancies drive upcoming vacancies; fetched only when the toggle is
  // on so the default search keeps its current behaviour and cost.
  const tenanciesQuery = useListPropertyTenanciesQuery(
    { includePast: false, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty || !showUpcoming },
  );

  const requiredBeds = Math.max(1, Number.isInteger(Number(minBeds)) ? Number(minBeds) : 1);
  const floorQuery = floor.trim();

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
      (roomMatchesType(room, conditioning, roomType) ? matched : similar).push(room);
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
    for (const tenancy of tenanciesQuery.data ?? []) {
      const date = upcomingVacancyDate(tenancy, today);
      if (!date) {
        continue;
      }
      const existing = map.get(tenancy.roomId);
      if (existing) {
        map.set(tenancy.roomId, { beds: existing.beds + 1, date: date < existing.date ? date : existing.date });
      } else {
        map.set(tenancy.roomId, { beds: 1, date });
      }
    }
    return map;
  }, [showUpcoming, tenanciesQuery.data]);

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
      (roomMatchesType(room, conditioning, roomType) ? matched : similar).push(entry);
    }
    const bySoonest = (left: UpcomingRoom, right: UpcomingRoom) =>
      left.date.localeCompare(right.date) || left.room.roomNumber.localeCompare(right.room.roomNumber);
    matched.sort(bySoonest);
    similar.sort(bySoonest);
    return { upcomingMatches: matched, upcomingSimilar: similar };
  }, [conditioning, requiredBeds, roomType, rooms, roomUpcoming, showUpcoming]);

  const matchCount = nowMatches.length + upcomingMatches.length;
  const similarCount = nowSimilar.length + upcomingSimilar.length;
  const matchBeds = nowMatches.reduce((sum, room) => sum + room.availableVacancies, 0);
  const loadingUpcoming = showUpcoming && tenanciesQuery.isFetching && (tenanciesQuery.data ?? []).length === 0;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader onBack={() => router.back()}
        eyebrow="Property"
        title="Vacancy"
        italicTail="finder."
        subtitle={selectedProperty ? `Search available rooms in ${selectedProperty.name}.` : "Select a property on Home first."}
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={Building2}
          eyebrow="Property required"
          title="No active property selected"
          description="Choose the property whose rooms you want to search from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <Card>
            <View style={{ gap: spacing.md }}>
              <ChoiceRow label="Conditioning" onChange={setConditioning} options={["ANY", ...ROOM_CONDITIONINGS]} value={conditioning} />
              <ChoiceRow label="Room type" onChange={setRoomType} options={["ANY", ...ROOM_TYPES]} value={roomType} />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <FormInput keyboardType="number-pad" label="Min free beds" onChangeText={setMinBeds} placeholder="1" value={minBeds} />
                </View>
                <View style={{ flex: 1 }}>
                  <FormInput label="Floor (optional)" onChangeText={setFloor} placeholder="Any · 1, 2…" value={floor} />
                </View>
              </View>
              <UpcomingVacanciesToggle checked={showUpcoming} onToggle={() => setShowUpcoming((current) => !current)} />
            </View>
          </Card>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile label="Matches" value={String(matchCount)} hint={matchCount > 0 ? `${matchBeds} free now` : "Exact fit"} tone={matchCount > 0 ? "primary" : "default"} />
            <MetricTile label="Similar" value={String(similarCount)} hint={conditioning === "ANY" && roomType === "ANY" ? "Set AC or type" : "Other vacancies"} />
          </View>

          {roomsQuery.isFetching && rooms.length === 0 ? (
            <SkeletonCard />
          ) : loadingUpcoming && matchCount === 0 && similarCount === 0 ? (
            <SkeletonCard />
          ) : matchCount === 0 && similarCount === 0 ? (
            <EmptyState
              icon={Search}
              eyebrow="No matches"
              title={showUpcoming ? "No active or upcoming vacancies" : "No available rooms"}
              description={
                showUpcoming
                  ? "Nothing matches your search now or soon. Try fewer beds, a different type, or clear the conditioning filter."
                  : "No room fits these filters. Try fewer beds, a different type, or turn on upcoming vacancies."
              }
            />
          ) : (
            <>
              {matchCount > 0 ? (
                <Section eyebrow="Matches your search" title={`${matchCount} room${matchCount === 1 ? "" : "s"}`}>
                  {nowMatches.map((room) => (
                    <RoomResultCard key={room.id} highlight={Boolean(floorQuery) && (room.floor ?? "") === floorQuery} room={room} />
                  ))}
                  {upcomingMatches.map(({ beds, date, room }) => (
                    <RoomResultCard availableFrom={date} key={room.id} room={room} upcomingBeds={beds} />
                  ))}
                </Section>
              ) : null}
              {similarCount > 0 ? (
                <Section eyebrow="Similar vacancies" title={`${similarCount} other room${similarCount === 1 ? "" : "s"}`}>
                  {nowSimilar.map((room) => (
                    <RoomResultCard key={room.id} highlight={Boolean(floorQuery) && (room.floor ?? "") === floorQuery} room={room} />
                  ))}
                  {upcomingSimilar.map(({ beds, date, room }) => (
                    <RoomResultCard availableFrom={date} key={room.id} room={room} upcomingBeds={beds} />
                  ))}
                </Section>
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
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, fontWeight: "500" }} selectable>
              Room {room.roomNumber}
            </Text>
            {upcoming ? (
              <View style={{ alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 999, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                <CalendarClock color={colors.accent} size={13} strokeWidth={2.4} />
                <Text style={[type.caption, { color: colors.accent, fontWeight: "900" }]} selectable>
                  From {formatShortDate(availableFrom!)}
                </Text>
              </View>
            ) : (
              <Text style={[type.caption, { color: colors.primary, fontWeight: "900" }]} selectable>
                {room.availableVacancies} free
              </Text>
            )}
          </View>
          <InfoLine icon={Layers} label="Floor" value={room.floor ? `Floor ${room.floor}` : "Unassigned"} />
          <InfoLine icon={BedDouble} label="Type" value={`${humanizeToken(room.roomType)} · ${room.conditioning === "AC" ? "AC" : "Non-AC"} · ${room.occupiedCount}/${room.capacity} filled`} />
          {upcoming ? (
            <InfoLine icon={CalendarClock} label="Frees" value={`${upcomingBeds ?? 1} bed${(upcomingBeds ?? 1) === 1 ? "" : "s"} by ${formatShortDate(availableFrom!)}`} />
          ) : null}
          <InfoLine icon={IndianRupee} label="Rent" value={`${formatMoneyPaise(room.baseRentPaise)} / bed`} />
        </View>
      </View>
    </Card>
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
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
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
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        {label}
      </Text>
      <Text style={[type.caption, { color: colors.ink, flex: 1, fontWeight: "700", textAlign: "right" }]} selectable>
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
      <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]} selectable={false}>
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
