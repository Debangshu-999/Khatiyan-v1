import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { BedDouble, Building2, CalendarClock, Check, IndianRupee, Layers, Search } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
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

export default function OwnerVacancyFinderScreen() {
  const router = useRouter();
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

  const matches = useMemo(() => {
    // Hard filters: a room must have enough free beds, not be under maintenance,
    // and match the AC / room-type filters when those are set.
    const filtered = rooms.filter((room) => {
      if (room.status === "MAINTENANCE") {
        return false;
      }
      if (room.availableVacancies < requiredBeds) {
        return false;
      }
      if (conditioning !== "ANY" && room.conditioning !== conditioning) {
        return false;
      }
      if (roomType !== "ANY" && room.roomType !== roomType) {
        return false;
      }
      return true;
    });

    // Floor is a soft preference: never exclude on floor. When a floor is
    // requested, surface rooms on that floor first; otherwise order by floor.
    return [...filtered].sort((left, right) => {
      if (floorQuery) {
        const leftOnFloor = (left.floor ?? "") === floorQuery ? 0 : 1;
        const rightOnFloor = (right.floor ?? "") === floorQuery ? 0 : 1;
        if (leftOnFloor !== rightOnFloor) {
          return leftOnFloor - rightOnFloor;
        }
      }
      return (left.floor ?? "").localeCompare(right.floor ?? "") || left.roomNumber.localeCompare(right.roomNumber);
    });
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

  // Rooms that lack enough free beds now but free up in the future and still
  // match the AC / room-type filters. Sorted by soonest vacancy.
  const upcomingMatches = useMemo(() => {
    if (!showUpcoming) {
      return [] as { beds: number; date: string; room: OwnerRoom }[];
    }
    return rooms
      .filter((room) => {
        if (room.status === "MAINTENANCE") {
          return false;
        }
        if (room.availableVacancies >= requiredBeds) {
          return false; // already an "available now" match
        }
        if (conditioning !== "ANY" && room.conditioning !== conditioning) {
          return false;
        }
        if (roomType !== "ANY" && room.roomType !== roomType) {
          return false;
        }
        return roomUpcoming.has(room.id);
      })
      .map((room) => {
        const upcoming = roomUpcoming.get(room.id)!;
        return { beds: upcoming.beds, date: upcoming.date, room };
      })
      .sort((left, right) => left.date.localeCompare(right.date) || left.room.roomNumber.localeCompare(right.room.roomNumber));
  }, [conditioning, requiredBeds, roomType, rooms, roomUpcoming, showUpcoming]);

  const floorMatchCount = floorQuery ? matches.filter((room) => (room.floor ?? "") === floorQuery).length : 0;
  const totalBeds = matches.reduce((sum, room) => sum + room.availableVacancies, 0);

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />

      <ScreenHeader
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
            <MetricTile label="Rooms found" value={String(matches.length)} hint={`${totalBeds} free bed${totalBeds === 1 ? "" : "s"}`} tone={matches.length > 0 ? "primary" : "default"} />
            <MetricTile label="On floor" value={floorQuery ? String(floorMatchCount) : "—"} hint={floorQuery ? `Floor ${floorQuery}` : "No floor set"} />
          </View>

          {floorQuery && matches.length > 0 && floorMatchCount === 0 ? (
            <Card tone="sunken">
              <Text style={[type.caption, { color: colors.muted }]} selectable>
                No matching rooms on floor {floorQuery}. Showing other available rooms that fit your criteria.
              </Text>
            </Card>
          ) : null}

          {roomsQuery.isFetching && rooms.length === 0 ? (
            <Card>
              <ActivityIndicator color={colors.primary} />
            </Card>
          ) : showUpcoming ? (
            tenanciesQuery.isFetching && (tenanciesQuery.data ?? []).length === 0 && matches.length === 0 ? (
              <Card>
                <ActivityIndicator color={colors.primary} />
              </Card>
            ) : matches.length === 0 && upcomingMatches.length === 0 ? (
              <EmptyState
                icon={Search}
                eyebrow="No matches"
                title="No active or upcoming vacancies"
                description="No active or upcoming vacancies match your search. Try fewer beds, a different type, or clear the conditioning filter."
              />
            ) : (
              <>
                {matches.length > 0 ? (
                  <Section eyebrow="Available now" title={`${matches.length} available room${matches.length === 1 ? "" : "s"}`}>
                    {matches.map((room) => (
                      <RoomResultCard key={room.id} highlight={Boolean(floorQuery) && (room.floor ?? "") === floorQuery} room={room} />
                    ))}
                  </Section>
                ) : null}
                {upcomingMatches.length > 0 ? (
                  <Section eyebrow="Freeing up soon" title={`${upcomingMatches.length} upcoming vacanc${upcomingMatches.length === 1 ? "y" : "ies"}`}>
                    {upcomingMatches.map(({ beds, date, room }) => (
                      <RoomResultCard availableFrom={date} key={room.id} room={room} upcomingBeds={beds} />
                    ))}
                  </Section>
                ) : null}
              </>
            )
          ) : matches.length === 0 ? (
            <EmptyState
              icon={Search}
              eyebrow="No matches"
              title="No available rooms"
              description="No active room fits these filters. Try fewer beds, a different type, or clear the conditioning filter."
            />
          ) : (
            <Section eyebrow="Results" title={`${matches.length} available room${matches.length === 1 ? "" : "s"}`}>
              {matches.map((room) => (
                <RoomResultCard key={room.id} highlight={Boolean(floorQuery) && (room.floor ?? "") === floorQuery} room={room} />
              ))}
            </Section>
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

// A tenancy contributes an upcoming vacancy when a monthly stay is on notice
// with an end date, or a daily stay has an end date, and that date is today or
// later. Returns the vacancy date (ISO yyyy-MM-dd) or null.
function upcomingVacancyDate(tenancy: TenancySummary, today: string): string | null {
  if (!tenancy.endDate || tenancy.endDate < today) {
    return null;
  }
  if (tenancy.billingType === "DAILY") {
    return tenancy.endDate;
  }
  if (tenancy.billingType === "MONTHLY" && (tenancy.status === "ON_NOTICE" || tenancy.status === "ON_PREMATURE_NOTICE")) {
    return tenancy.endDate;
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
