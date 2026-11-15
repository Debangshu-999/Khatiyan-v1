import { useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Moon, X } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { InPageDropdown, useInPageDropdown } from "@/components/anchored-dropdown";
import { AnimatedPressable } from "@/components/animated-pressable";
import { ColorCalendarIcon } from "@/components/color-calendar-icon";
import { RoundIconButton } from "@/components/month-selector";
import { AbsentArt, ActiveTenancyArt, NotMarkedArt, OnNoticeTenancyArt, RollCallArt } from "@/components/control-art";
import { EmptyState } from "@/components/empty-state";
import { PILL_CHOICE_MAX_WIDTH, pillChoice } from "@/components/filtered-queue";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { SheetShell } from "@/components/sheet-shell";
import { Skeleton } from "@/components/skeletons/primitives";
import { useToast } from "@/components/toast";
import { StateChip, type Tone } from "@/features/enquiry/enquiry-tags";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton } from "@/features/owner/owner-ui";
import { FactColumn } from "@/features/tenancy/request-form-cards";
import { cardName } from "@/lib/person-name";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import {
  minutesLabel,
  rollCallTime,
  useGetPropertyRollCallQuery,
  useSetRollCallMarkMutation,
  type RollCallEntry,
  type RollCallMethod,
  type RollCallState,
  type WardenStatus,
} from "@/store/services/roll-call-api";
import { cardShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Filter = "ALL" | "NOT_MARKED" | "PRESENT" | "AWAY" | "ABSENT";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All", value: "ALL" },
  { label: "Not marked", value: "NOT_MARKED" },
  { label: "Present", value: "PRESENT" },
  { label: "Away", value: "AWAY" },
  { label: "Absent", value: "ABSENT" },
];

const STATE: Record<RollCallState, { label: string; tone: Tone }> = {
  ABSENT: { label: "Absent", tone: "danger" },
  AWAY: { label: "Away", tone: "neutral" },
  AWAY_DECLARED: { label: "Away", tone: "neutral" },
  NOT_MARKED: { label: "Not marked", tone: "warning" },
  PRESENT: { label: "Present", tone: "success" },
};

/** Who marked it (user, 2026-11-15): "You" for the viewer's own mark, the person's name, or how the tenant did. */
function markedBy(entry: RollCallEntry, viewerId: string | null, withBy = false) {
  if (entry.state === "AWAY_DECLARED") return "Stay out";
  if (!entry.method) return null;
  if (entry.method === "WARDEN") {
    // "By you" on the card, where no label says who (user, 2026-11-15); the sheet's column is labelled.
    const who = entry.markedByUserId && entry.markedByUserId === viewerId
      ? (withBy ? "you" : "You")
      : entry.markedByName ? cardName(entry.markedByName) : (withBy ? "property staff" : "Property staff");
    return withBy ? `By ${who}` : who;
  }
  return METHOD[entry.method];
}

/** The status word's colour in the mark sheet. */
const STATE_COLOR = (colors: ReturnType<typeof useTheme>["colors"]): Record<RollCallState, string> => ({
  ABSENT: colors.danger,
  AWAY: colors.warningText,
  AWAY_DECLARED: colors.warningText,
  NOT_MARKED: colors.warningText,
  PRESENT: colors.successText,
});

const METHOD: Record<RollCallMethod, string> = {
  LOCATION: "Location",
  SELF: "Self-marked",
  WARDEN: "Property staff",
  WIFI: "WiFi",
};

/**
 * Roll call (user, 2026-11-15, from the demo): one night's roll, tonight first.
 * Four counts, a sticky search with a state filter, and every tenant on the roll
 * with their room, how they were marked and when. Tapping one sets the warden's
 * mark: Present, Absent, Away, or clears it.
 */
export default function OwnerRollCallScreen() {
  const { colors, fonts, type } = useTheme();
  const router = useGuardedRouter();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const viewerId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const property = properties.find((candidate) => candidate.id === selectedPropertyId) ?? (properties.length === 1 ? properties[0] : null);
  const propertyId = property?.id ?? "";
  const [night, setNight] = useState<string | null>(null);
  const query = useGetPropertyRollCallQuery({ night, propertyId }, { skip: !propertyId });
  const roll = query.currentData;
  const [setMark, markState] = useSetRollCallMarkMutation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [chosen, setChosen] = useState<RollCallEntry | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const filterMenu = useInPageDropdown();
  const searchRestY = useRef(0);
  const [pinned, setPinned] = useState(false);
  const gear = useMemo(() => (
    <AnimatedPressable
      accessibilityLabel="Attendance settings"
      accessibilityRole="button"
      onPress={() => router.push("/owner-roll-call-settings")}
      hitSlop={10}
      // The Enquiries and Account screens' own gear, no border (user, 2026-11-15).
      style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}
    >
      <Ionicons color={colors.ink} name="settings" size={22} />
    </AnimatedPressable>
  ), [colors.ink, router]);

  const rows = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (roll?.entries ?? []).filter((entry) => {
      const state = entry.state === "AWAY_DECLARED" ? "AWAY" : entry.state;
      if (filter !== "ALL" && state !== filter) return false;
      if (!words) return true;
      return [entry.tenantName, entry.roomNumber, entry.tenancyCode].some((part) => part?.toLowerCase().includes(words));
    });
  }, [filter, roll, search]);

  const failure = loadFailure(propertiesQuery, query);
  if (failure) return <LoadFailedScreen failure={failure} />;

  const shownNight = roll?.night ?? null;
  const isTonight = Boolean(roll && roll.night === roll.tonight);
  const chosenFilter = FILTERS.find((option) => option.value === filter) ?? FILTERS[0];

  async function mark(entry: RollCallEntry, status: WardenStatus) {
    if (!shownNight) return;
    try {
      await setMark({ night: shownNight, propertyId, status, tenancyId: entry.tenancyId }).unwrap();
      setChosen(null);
      toast.success(status === null ? "Warden's mark cleared" : `Marked ${status.toLowerCase()}`);
    } catch (caught) {
      setChosen(null);
      setRefusal(errorMessage(caught));
    }
  }

  return (
    <View collapsable={false} ref={filterMenu.host} style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        onRefresh={() => void query.refetch()}
        onScroll={({ nativeEvent }) => {
          const nowPinned = searchRestY.current > 0 && nativeEvent.contentOffset.y >= searchRestY.current;
          if (nowPinned !== pinned) {
            setPinned(nowPinned);
            if (nowPinned) filterMenu.close();
          }
        }}
        safeAreaEdges={["top", "bottom"]}
        scrollEventThrottle={16}
        stickyHeaderIndices={roll?.enabled ? [3] : []}
      >
        <ScreenHeader italicTail="attendance." subtitle={property ? `Tonight's head count at ${property.name}.` : undefined} title="Tenant" trailing={gear} />

        {/* The night: tonight by default, a step back to look at earlier ones. The window's
            times under it in a grey pill (user, 2026-11-15). One child, so the sticky index holds. */}
        {/* Billing's month switcher, for a night (user, 2026-11-15): a card with grey discs either
            side and the coloured calendar. The window's times in a grey pill under it, at the left. */}
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              flexDirection: "row",
              justifyContent: "space-between",
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              ...cardShadow(colors.shadow),
            }}
          >
            <RoundIconButton disabled={!shownNight} icon={ChevronLeft} label="Earlier night" onPress={() => shownNight && setNight(shiftDay(shownNight, -1))} />
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
              <ColorCalendarIcon size={22} />
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>
                {shownNight ? `${nightLabel(shownNight)}${isTonight ? ", Tonight" : ""}` : " "}
              </Text>
            </View>
            <RoundIconButton disabled={isTonight || !shownNight} icon={ChevronRight} label="Later night" onPress={() => shownNight && setNight(shiftDay(shownNight, 1))} />
          </View>
          {roll?.enabled && roll.windowStartMinute != null && roll.windowEndMinute != null ? (
            <View style={{ alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.neutralSoft, borderRadius: 999, flexDirection: "row", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
              <Clock color={colors.inkSoft} size={13} strokeWidth={2.4} />
              <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 12 }}>
                {`${minutesLabel(roll.windowStartMinute)} - ${minutesLabel(roll.windowEndMinute)}`}
              </Text>
            </View>
          ) : null}
        </View>

        {roll?.enabled ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <MetricTile icon={ActiveTenancyArt} iconPlacement="side" iconTone="ink" label="Present" value={String(roll.counts.present)} />
              <MetricTile icon={OnNoticeTenancyArt} iconPlacement="side" iconTone="ink" label="Staying out" value={String(roll.counts.away)} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <MetricTile icon={NotMarkedArt} iconPlacement="side" iconTone="ink" label="Not marked" value={String(roll.counts.notMarked)} />
              <MetricTile icon={AbsentArt} iconPlacement="side" iconTone="ink" label="Absent" value={String(roll.counts.absent)} />
            </View>
          </View>
        ) : <View />}

        {/* Sticks under the header. On a phone a sticky child's style moves to a wrapper: the row needs its own View. */}
        {roll?.enabled ? (
          <View
            onLayout={(event) => { searchRestY.current = event.nativeEvent.layout.y; }}
            style={{ backgroundColor: colors.background, marginHorizontal: -spacing.lg, paddingBottom: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <SearchField onChangeText={setSearch} placeholder="Search name or room" value={search} />
              </View>
              <View collapsable={false} ref={filterMenu.ref}>
                <AnimatedPressable
                  accessibilityLabel={`Show: ${chosenFilter.label}`}
                  accessibilityRole="button"
                  disabled={pinned}
                  onPress={pinned ? undefined : filterMenu.open}
                  style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: `${colors.ink}40`, borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 4, height: 36, paddingLeft: spacing.md, paddingRight: spacing.sm }}
                >
                  <Text numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 12.5, maxWidth: PILL_CHOICE_MAX_WIDTH }}>
                    {pillChoice(chosenFilter.label)}
                  </Text>
                  {pinned ? null : <ChevronDown color={colors.ink} size={15} strokeWidth={2.4} />}
                </AnimatedPressable>
              </View>
            </View>
          </View>
        ) : <View />}

        {!roll ? (
          <RollCallSkeleton />
        ) : !roll.enabled ? (
          <EmptyState
            action={
              // As wide as its words, white with a blue edge and label (user, 2026-11-15). The shared
              // ActionButton is flex 1 and stretched to the screen's width on a phone.
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => router.push("/owner-roll-call-settings")}
                style={{ alignItems: "center", alignSelf: "center", backgroundColor: colors.surface, borderColor: colors.primary, borderCurve: "continuous", borderRadius: radii.md, borderWidth: 1, height: 38, justifyContent: "center", paddingHorizontal: spacing.lg }}
              >
                <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13.5 }}>Set up attendance</Text>
              </AnimatedPressable>
            }
            artworkNode={<RollCallArt size={96} />}
            description="Pick a window and switch it on in attendance settings."
            title="Attendance is off"
          />
        ) : rows.length === 0 ? (
          <EmptyState
            artworkNode={<RollCallArt size={96} />}
            description={search || filter !== "ALL" ? "Try another name, room or filter." : "Tenants of current monthly stays appear here."}
            title={search || filter !== "ALL" ? "No matching tenants" : "Nobody on the roll"}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {rows.map((entry) => (
              <AnimatedPressable
                accessibilityLabel={`${entry.tenantName ?? "Tenant"}, ${STATE[entry.state].label}`}
                accessibilityRole="button"
                key={entry.tenancyId}
                onPress={() => setChosen(entry)}
                style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md, ...cardShadow(colors.shadow) }}
              >
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{cardName(entry.tenantName)}</Text>
                  <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
                    {[entry.roomNumber ? `Room ${entry.roomNumber}` : null, markedBy(entry, viewerId, true)].filter(Boolean).join(" · ")}
                  </Text>
                  {/* The time on its own line (user, 2026-11-15). */}
                  {entry.markedAt && entry.state !== "AWAY_DECLARED" ? (
                    <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>{`Marked at: ${rollCallTime(entry.markedAt)}`}</Text>
                  ) : null}
                </View>
                <StateChip label={STATE[entry.state].label} tone={STATE[entry.state].tone} />
                <ChevronRight color={colors.muted} size={18} strokeWidth={2.4} />
              </AnimatedPressable>
            ))}
          </View>
        )}
      </ScreenScrollView>

      {filterMenu.trigger && !pinned ? (
        <InPageDropdown onClose={filterMenu.close} trigger={filterMenu.trigger} width={180}>
          {FILTERS.map((option) => (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected: option.value === filter }}
              key={option.value}
              onPress={() => {
                setFilter(option.value);
                filterMenu.close();
              }}
              style={{ backgroundColor: option.value === filter ? colors.surfaceSunken : colors.surface, padding: spacing.md }}
            >
              <Text style={{ color: colors.ink, fontFamily: option.value === filter ? fonts.sansBold : fonts.sansMedium, fontSize: 14 }}>{option.label}</Text>
            </AnimatedPressable>
          ))}
        </InPageDropdown>
      ) : null}

      {chosen ? (
        <SheetShell
          animated
          // The date on one line beside the name, with a calendar (user, 2026-11-15).
          besideTitle={shownNight ? (
            <View style={{ alignItems: "center", flexDirection: "row", flexShrink: 0, gap: 4, marginLeft: spacing.xs }}>
              <CalendarDays color={colors.muted} size={15} strokeWidth={2.3} />
              <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 14 }}>{nightLabel(shownNight)}</Text>
            </View>
          ) : null}
          onClose={() => setChosen(null)}
          size="content"
          title={cardName(chosen.tenantName)}
        >
          {/* Room, status and how they were marked in one row split by lines (user, 2026-11-15). */}
          <View style={{ borderColor: colors.border, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
            <FactColumn label="Room" value={chosen.roomNumber ?? "Not set"} />
            <FactColumn divided dividerColor={colors.borderStrong} label="Status" tone={STATE_COLOR(colors)[chosen.state]} value={STATE[chosen.state].label} />
            <View style={{ flex: 1, gap: 2, minWidth: 0, paddingLeft: spacing.sm }}>
              <View style={{ backgroundColor: colors.borderStrong, bottom: 0, left: 0, position: "absolute", top: 0, width: 1 }} />
              <Text style={[type.caption, { color: colors.muted, fontSize: 10.5 }]}>Marked by</Text>
              <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{markedBy(chosen, viewerId) ?? "-"}</Text>
              {chosen.markedAt && chosen.state !== "AWAY_DECLARED" ? (
                <Text style={[type.caption, { color: colors.muted }]}>{rollCallTime(chosen.markedAt)}</Text>
              ) : null}
            </View>
          </View>
          <Text style={[type.caption, { color: colors.muted }]}>Your mark replaces the tenant's.</Text>
          {/* Present in green, Absent in red, Away in amber, each outlined like Absent (user, 2026-11-15). */}
          <View style={{ gap: spacing.sm }}>
            <MarkButton color={colors.successText} disabled={markState.isLoading} icon={Check} label="Present" onPress={() => void mark(chosen, "PRESENT")} />
            <MarkButton color={colors.danger} disabled={markState.isLoading} icon={X} label="Absent" onPress={() => void mark(chosen, "ABSENT")} />
            <MarkButton color={colors.warningText} disabled={markState.isLoading} icon={Moon} label="Away" onPress={() => void mark(chosen, "AWAY")} />
            {chosen.method === "WARDEN" ? (
              <ActionButton disabled={markState.isLoading} label="Clear warden's mark" onPress={() => void mark(chosen, null)} variant="secondary" />
            ) : null}
          </View>
        </SheetShell>
      ) : null}
      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </View>
  );
}

/** The night loading: the four counts, the search row and tenant cards, as grey shapes of their own size. */
function RollCallSkeleton() {
  const { colors } = useTheme();
  const tile = { backgroundColor: colors.surface, borderColor: colors.border, borderCurve: "continuous" as const, borderRadius: radii.card, borderWidth: 1, flex: 1, flexDirection: "row" as const, gap: spacing.sm, padding: spacing.md };
  return (
    <View accessibilityLabel="Loading attendance" style={{ gap: spacing.md }}>
      {[0, 1].map((row) => (
        <View key={row} style={{ flexDirection: "row", gap: spacing.sm }}>
          {[0, 1].map((cell) => (
            <View key={cell} style={tile}>
              <Skeleton height={36} radius={999} width={36} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton height={11} width="60%" />
                <Skeleton height={20} width="30%" />
              </View>
            </View>
          ))}
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Skeleton height={38} radius={999} /></View>
        <Skeleton height={36} radius={999} width={64} />
      </View>
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={{ ...tile, alignItems: "center", flex: undefined }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={15} width="45%" />
            <Skeleton height={11} width="65%" />
          </View>
          <Skeleton height={22} radius={999} width={72} />
        </View>
      ))}
    </View>
  );
}

/** The warden's mark buttons: white, outlined and labelled in their own colour, like Absent. */
function MarkButton({ color, disabled, icon: Icon, label, onPress }: { color: string; disabled: boolean; icon: typeof Check; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={`Mark ${label.toLowerCase()}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: disabled ? colors.borderStrong : color, borderCurve: "continuous", borderRadius: radii.md, borderWidth: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48, paddingHorizontal: spacing.md }}
    >
      <Icon color={disabled ? colors.muted : color} size={18} strokeWidth={2.4} />
      <Text style={{ color: disabled ? colors.muted : color, fontFamily: fonts.sansBold, fontSize: 15 }}>{label}</Text>
    </AnimatedPressable>
  );
}

/** "Sat 15 Nov". */
function nightLabel(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC", weekday: "short" })
    .format(new Date(`${iso}T00:00:00Z`))
    .replace(",", "");
}

function shiftDay(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
