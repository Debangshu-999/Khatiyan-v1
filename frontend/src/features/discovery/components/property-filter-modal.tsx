import { useEffect, useRef, useState, type ComponentType } from "react";
import { Modal, PanResponder, ScrollView, Text, TextInput, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import {
  ArrowLeft,
  Mars,
  Search,
  TrainFront,
  UsersRound,
  Venus,
  X,
  type LucideProps,
} from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { TabSwitcher } from "@/components/tab-switcher";
import { pinnedFooterEdge } from "@/components/pinned-footer";
import { PropertyFiltersSkeleton } from "@/components/skeletons";
import { ChoiceChip, ChoiceGrid, ChoiceSection, MultiChoiceGrid } from "@/components/choice-section";
import {
  BATHROOM_TYPES,
  MEAL_TYPES,
  PG_FOR_OPTIONS,
  PREFERRED_TENANT_OPTIONS,
  ROOM_TYPES,
  type BathroomType,
  type MealType,
  type PgFor,
  type PreferredTenantType,
  type PropertyType,
  type RoomType,
} from "@/store/services/property-api";
import { useGetMetroSystemsQuery } from "@/store/services/metro-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { softShadow } from "@/theme/shadows";

import { humanizeToken } from "../discovery-format";
import { MetroLineScreen } from "../metro/metro-line-screen";
import type { DevicePoint } from "../metro/metro-system";
import { MetroTab } from "../metro/metro-tab";

type LucideIcon = ComponentType<LucideProps>;

/** The bottom sheet's entrance, after which the real controls render. */
const SHEET_ENTER_MS = 320;

const PG_FOR_ICONS: Record<PgFor, LucideIcon> = {
  ANYONE: UsersRound,
  FEMALE: Venus,
  MALE: Mars,
};

export type PropertyFilterState = {
  pgFor: PgFor | null;
  minRentPaise: number | null;
  maxRentPaise: number | null;
  preferredFor: PreferredTenantType | null;
  mealTypes: MealType[];
  electricityIncluded: boolean | null;
  bathroomType: BathroomType | null;
  sharingTypes: RoomType[];
  propertyType: PropertyType | null;
  /** Ticked stations: properties within 5 km of any. They replace the searched place while any are ticked. */
  metroStationCodes: string[];
};

/**
 * The kinds a searcher can ask for. Apartments and societies exist in the model
 * for later but are not listed in v1, so offering them would only find nothing.
 */
const DISCOVERABLE_PROPERTY_TYPES: PropertyType[] = ["PG", "HOSTEL"];

export const emptyPropertyFilters: PropertyFilterState = {
  bathroomType: null,
  electricityIncluded: null,
  maxRentPaise: null,
  mealTypes: [],
  metroStationCodes: [],
  minRentPaise: null,
  pgFor: null,
  preferredFor: null,
  propertyType: null,
  sharingTypes: [],
};

type PropertyFilterModalProps = {
  /** The person's current city decides which metro the tab shows. */
  deviceLocation: DevicePoint;
  filters: PropertyFilterState;
  onApply: (filters: PropertyFilterState) => void;
  onClose: () => void;
  onReset: () => void;
  onUpdate: (filters: PropertyFilterState) => void;
  visible: boolean;
};

export function countActivePropertyFilters(filters: PropertyFilterState) {
  let count = 0;
  if (filters.pgFor && filters.pgFor !== "ANYONE") count += 1;
  if (filters.minRentPaise !== null || filters.maxRentPaise !== null) count += 1;
  if (filters.preferredFor && filters.preferredFor !== "ANYONE") count += 1;
  if (filters.mealTypes.length > 0) count += 1;
  if (filters.electricityIncluded !== null) count += 1;
  if (filters.bathroomType !== null) count += 1;
  if (filters.sharingTypes.length > 0) count += 1;
  if (filters.propertyType !== null) count += 1;
  if (filters.metroStationCodes.length > 0) count += 1;
  return count;
}

/** The choices take the card's full width, with no empty column under its icon (user, 2026-10-31). */
const FULL_WIDTH = { marginLeft: 0 };

type FilterPageTab = "general" | "metro";

// Filled in the tab's own colour, so white on the selected pill. Drawn here for
// the hole in its head: lucide's pin only fills to a solid blob.
function FilledMapPin({ color, size = 18 }: LucideProps) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path
        clipRule="evenodd"
        d="M12 1a9 9 0 0 1 9 9c0 5.4-5.9 10.9-7.8 12.5a1.9 1.9 0 0 1-2.4 0C8.9 20.9 3 15.4 3 10a9 9 0 0 1 9-9zm0 5.75a3.25 3.25 0 1 0 0 6.5a3.25 3.25 0 0 0 0-6.5z"
        fill={color}
        fillRule="evenodd"
      />
    </Svg>
  );
}

const FILTER_PAGE_TABS: { icon: LucideIcon; label: string; value: FilterPageTab }[] = [
  { icon: FilledMapPin, label: "General search", value: "general" },
  { icon: TrainFront, label: "Search along metro", value: "metro" },
];

export function PropertyFilterModal({
  deviceLocation,
  filters,
  onApply,
  onClose,
  onReset,
  onUpdate,
  visible,
}: PropertyFilterModalProps) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  // Direct, not useSoftShadow: this opens from a tab, whose shadow phones do not draw.
  const raisedCard = softShadow(colors.shadow, 4, 12);

  // The sheet's skeleton holds while it slides up (user, 2026-10-02): the
  // eight sections of chips are the heaviest thing on the frame, and laying
  // them out on the same frames as the slide made the opening stutter.
  const [contentReady, setContentReady] = useState(false);
  const [pageTab, setPageTab] = useState<FilterPageTab>("general");
  const [openLineCode, setOpenLineCode] = useState<string | null>(null);
  // Here, not in the tab: the tab unmounts while a line is open.
  const [pickedCityCode, setPickedCityCode] = useState<string | null>(null);
  const systemsQuery = useGetMetroSystemsQuery(undefined, { skip: !visible });
  const openLine =
    systemsQuery.data?.flatMap((system) => system.lines).find((line) => line.code === openLineCode) ?? null;
  // Reopens where the ticks are, so somebody who searched by metro sees them.
  const opensOnMetro = filters.metroStationCodes.length > 0;
  const codesOnOpening = useRef("");
  useEffect(() => {
    if (!visible) {
      setContentReady(false);
      setOpenLineCode(null);
      return;
    }
    setPageTab(opensOnMetro ? "metro" : "general");
    codesOnOpening.current = filters.metroStationCodes.join();
    const timer = setTimeout(() => setContentReady(true), SHEET_ENTER_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  function update(partial: Partial<PropertyFilterState>) {
    onUpdate({ ...filters, ...partial });
  }

  // Back from a line returns to the tab, not out of the filters.
  function handleBack() {
    if (openLine) {
      setOpenLineCode(null);
      return;
    }
    // The metro tab has no Search button, so leaving with changed ticks is what applies them.
    if (filters.metroStationCodes.join() !== codesOnOpening.current) {
      onApply(filters);
      return;
    }
    onClose();
  }

  function toggleMeal(meal: MealType) {
    const exists = filters.mealTypes.includes(meal);
    update({ mealTypes: exists ? filters.mealTypes.filter((item) => item !== meal) : [...filters.mealTypes, meal] });
  }

  function toggleSharing(sharing: RoomType) {
    const exists = filters.sharingTypes.includes(sharing);
    update({
      sharingTypes: exists
        ? filters.sharingTypes.filter((item) => item !== sharing)
        : [...filters.sharingTypes, sharing],
    });
  }

  return (
    // A page of its own over the tab, with the wallet history's header (user, 2026-10-31).
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={handleBack}
      statusBarTranslucent
      transparent={false}
      visible={visible}
    >
      <View style={{ backgroundColor: colors.surface, flex: 1, paddingTop: insets.top }}>
        {openLine ? (
          <MetroLineScreen
            line={openLine}
            onBack={handleBack}
            onChange={(metroStationCodes) => update({ metroStationCodes })}
            onDone={() => onApply(filters)}
            selected={filters.metroStationCodes}
          />
        ) : (<>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 14, paddingHorizontal: 18, paddingVertical: 16 }}>
            <AnimatedPressable
              accessibilityLabel="Back"
              accessibilityRole="button"
              onPress={handleBack}
              style={{ alignItems: "center", borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 36, justifyContent: "center", width: 36 }}
            >
              <ArrowLeft color={colors.ink} size={21} strokeWidth={2.75} />
            </AnimatedPressable>
            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 18 }}>Property filters</Text>
          </View>

          <View style={{ paddingBottom: spacing.sm, paddingHorizontal: spacing.md }}>
            <TabSwitcher active={pageTab} onChange={setPageTab} options={FILTER_PAGE_TABS} />
          </View>

          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              gap: spacing.md,
              // The metro tab has no footer, and its credit sits at the foot of the page.
              paddingBottom: (pageTab === "metro" ? spacing.md : 116) + insets.bottom,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.xs,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!contentReady ? <PropertyFiltersSkeleton /> : pageTab === "metro" ? (
              <View style={{ flexGrow: 1, paddingTop: spacing.md }}>
                <MetroTab
                  deviceLocation={deviceLocation}
                  onChange={(metroStationCodes) => update({ metroStationCodes })}
                  onOpenLine={setOpenLineCode}
                  onPickCity={setPickedCityCode}
                  pickedCityCode={pickedCityCode}
                  selected={filters.metroStationCodes}
                />
              </View>
            ) : (<>
            <ChoiceSection
              cardStyle={raisedCard}
              contentStyle={FULL_WIDTH}
              description="What kind of place are you looking for?"
              title="Property type"
            >
              <ChoiceGrid
                getLabel={(option) => (option === "ANY" ? "Any" : humanizeToken(option))}
                options={["ANY", ...DISCOVERABLE_PROPERTY_TYPES]}
                selected={filters.propertyType ?? "ANY"}
                onSelect={(value) => update({ propertyType: value === "ANY" ? null : (value as PropertyType) })}
              />
            </ChoiceSection>

            {/* "PG for" understated the results. Discovery draws from every
                visible profile with no property-type restriction, so hostels
                come back alongside PGs — the heading has to cover both. */}
            <ChoiceSection
              cardStyle={raisedCard}
              contentStyle={FULL_WIDTH}
              description="Who can stay at this property?"
              title="PG/Hostel for"
            >
              <ChoiceGrid
                getIcon={(option) => (option === "ANYONE" ? undefined : PG_FOR_ICONS[option])}
                getLabel={(option) => (option === "ANYONE" ? "Anyone" : humanizeToken(option))}
                options={PG_FOR_OPTIONS}
                selected={filters.pgFor ?? "ANYONE"}
                onSelect={(value) => update({ pgFor: value === "ANYONE" ? null : value })}
              />
            </ChoiceSection>

            <ChoiceSection
              cardStyle={raisedCard}
              contentStyle={FULL_WIDTH}
              description="Select one or more room occupancies"
              title="Room sharing"
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                <ChoiceChip
                  columns={2}
                  label="Any"
                  onPress={() => update({ sharingTypes: [] })}
                  selected={filters.sharingTypes.length === 0}
                />
                {ROOM_TYPES.map((sharingType) => (
                  <ChoiceChip
                    columns={2}
                    key={sharingType}
                    label={sharingType === "FOUR_SHARING" ? "Four" : humanizeToken(sharingType)}
                    onPress={() => toggleSharing(sharingType)}
                    selected={filters.sharingTypes.includes(sharingType)}
                  />
                ))}
              </View>
            </ChoiceSection>

            <ChoiceSection
              cardStyle={raisedCard}
              contentStyle={FULL_WIDTH}
              description="Set your preferred monthly budget"
              title="Budget"
            >
              <RentRange
                maxRupees={filters.maxRentPaise === null ? 0 : Math.round(filters.maxRentPaise / 100)}
                minRupees={filters.minRentPaise === null ? 0 : Math.round(filters.minRentPaise / 100)}
                onChange={(next) =>
                  update({
                    maxRentPaise: next.max > 0 ? next.max * 100 : null,
                    minRentPaise: next.min > 0 ? next.min * 100 : null,
                  })
                }
              />
            </ChoiceSection>

            <ChoiceSection
              cardStyle={raisedCard}
              contentStyle={FULL_WIDTH}
              description="Who is this property suitable for?"
              title="Preferred for"
            >
              <ChoiceGrid
                getLabel={(option) => (option === "PROFESSIONAL" ? "Working" : humanizeToken(option))}
                options={PREFERRED_TENANT_OPTIONS}
                selected={filters.preferredFor ?? "ANYONE"}
                onSelect={(value) => update({ preferredFor: value === "ANYONE" ? null : value })}
              />
            </ChoiceSection>

            <ChoiceSection
              cardStyle={raisedCard}
              contentStyle={FULL_WIDTH}
              description="Which meals should be included?"
              title="Meals included"
            >
              <MultiChoiceGrid
                columns={2}
                getLabel={(meal) => (meal === "EVENING_SNACKS" ? "Snacks" : humanizeToken(meal))}
                onToggle={toggleMeal}
                options={MEAL_TYPES}
                selected={filters.mealTypes}
              />
            </ChoiceSection>

            <ChoiceSection
              cardStyle={raisedCard}
              contentStyle={FULL_WIDTH}
              description="Is electricity included in the rent?"
              title="Electricity included"
            >
              <BooleanChoice
                value={filters.electricityIncluded}
                onChange={(value) => update({ electricityIncluded: value })}
              />
            </ChoiceSection>

            <ChoiceSection
              cardStyle={raisedCard}
              contentStyle={FULL_WIDTH}
              description="Choose the bathroom arrangement"
              title="Bathroom type"
            >
              <ChoiceGrid
                getLabel={(option) => (option === "ANY" ? "Any" : humanizeToken(option))}
                options={["ANY", ...BATHROOM_TYPES]}
                selected={filters.bathroomType ?? "ANY"}
                onSelect={(value) => update({ bathroomType: value === "ANY" ? null : (value as BathroomType) })}
              />
            </ChoiceSection>
            </>)}
          </ScrollView>

          {pageTab === "metro" ? null : (
          <View
            style={{
              ...pinnedFooterEdge(colors),
              backgroundColor: colors.surface,
              bottom: 0,
              flexDirection: "row",
              gap: spacing.sm,
              left: 0,
              paddingBottom: insets.bottom + spacing.md,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.md,
              position: "absolute",
              right: 0,
            }}
          >
            {/* Blocked while every filter is already at its default: there is
                nothing to reset, and a live button that does nothing reads as
                broken. */}
            <FilterFooterButton
              disabled={countActivePropertyFilters(filters) === 0}
              label="Reset"
              onPress={onReset}
              style={{ flex: 1 }}
            />
            <FilterFooterButton
              icon={Search}
              label="Search"
              onPress={() => onApply(filters)}
              style={{ flex: 1.1 }}
            />
          </View>
          )}
        </>)}
      </View>
    </Modal>
  );
}

function BooleanChoice({ onChange, value }: { onChange: (value: boolean | null) => void; value: boolean | null }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      <ChoiceChip label="Any" selected={value === null} onPress={() => onChange(null)} />
      <ChoiceChip label="Yes" selected={value === true} onPress={() => onChange(true)} />
      <ChoiceChip label="No" selected={value === false} onPress={() => onChange(false)} />
    </View>
  );
}

function FilterFooterButton({
  disabled = false,
  icon: Icon,
  label,
  onPress,
  style,
}: {
  disabled?: boolean;
  icon?: LucideIcon;
  label: string;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const { colors, fonts } = useTheme();
  const foreground = disabled ? colors.muted : colors.onPrimary;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={[
        {
          alignItems: "center",
          // Both footer buttons are the same blue fill. A disabled one goes
          // grey, so "nothing to do" is visible rather than a dead blue button.
          backgroundColor: disabled ? colors.neutralSoft : colors.primary,
          borderColor: disabled ? colors.neutralSoft : colors.primary,
          borderRadius: 14,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: spacing.sm,
          justifyContent: "center",
          minHeight: 52,
          paddingHorizontal: spacing.md,
        },
        style,
      ]}
    >
      {Icon ? <Icon color={foreground} size={21} strokeWidth={2.3} /> : null}
      <Text
        style={{
          color: foreground,
          fontFamily: fonts.displaySoft,
          fontSize: 15,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// Single-thumb rent slider (0 – ₹1,00,000). The chosen value is the MAXIMUM
// rent someone will pay — a budget is a ceiling. It was wired to the minimum,
// so asking for ₹8,000 hid every room at or below it and showed the expensive
// ones instead, which is the opposite of what a searcher means.
//
// 0 means "Any". Built on PanResponder so it needs no extra package.
const RENT_MIN = 0;
const RENT_MAX = 100000;
const RENT_STEP = 1000;
const SLIDER_TOUCH = 44;

/**
 * Budget: a slider for the range, and two boxes for anyone who would rather
 * type it.
 *
 * <p>The slider drives the MAX only. A single thumb cannot express two ends, and
 * a two-thumb slider on a phone is a fiddly way to say a number you already know
 * — so the boxes are the way to set a floor, and they stay in step with the
 * slider rather than duplicating it.
 *
 * <p>Min defaults to 0 and is left alone unless someone types in it: almost
 * nobody searching for a room has a minimum, and defaulting it to anything else
 * would quietly hide the cheapest listings.
 */
function RentRange({
  maxRupees,
  minRupees,
  onChange,
}: {
  maxRupees: number;
  minRupees: number;
  onChange: (next: { max: number; min: number }) => void;
}) {
  const { colors, fonts, type } = useTheme();

  // Digits only, and empty reads as 0 — "Any" — rather than NaN.
  function parse(text: string) {
    const digits = text.replace(/[^0-9]/g, "");
    return digits ? Math.min(Number(digits), RENT_MAX) : 0;
  }

  return (
    <View style={{ gap: spacing.md }}>
      <RentSlider max={maxRupees} min={minRupees} onCommit={onChange} />

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            flex: 1,
            minHeight: 62,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.sm,
            position: "relative",
          }}
        >
          <Text
            style={[
              type.caption,
              {
                backgroundColor: colors.surface,
                color: colors.muted,
                fontFamily: fonts.sansMedium,
                left: spacing.sm,
                paddingHorizontal: spacing.xs,
                position: "absolute",
                top: -9,
                zIndex: 1,
              },
            ]}
          >
            Min
          </Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={(text) => {
              const min = parse(text);
              // A floor above the ceiling returns nothing and looks broken, so
              // the ceiling gives way — the slider is the thing being typed
              // against, not the thing being fought.
              onChange({ max: maxRupees > 0 && min > maxRupees ? min : maxRupees, min });
            }}
            placeholder="0"
            placeholderTextColor={colors.kicker}
            style={{
              color: colors.ink,
              fontFamily: fonts.sansBold,
              fontSize: 16,
              minHeight: 32,
              padding: 0,
            }}
            value={minRupees > 0 ? String(minRupees) : ""}
          />
        </View>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            flex: 1,
            minHeight: 62,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.sm,
            position: "relative",
          }}
        >
          <Text
            style={[
              type.caption,
              {
                backgroundColor: colors.surface,
                color: colors.muted,
                fontFamily: fonts.sansMedium,
                left: spacing.sm,
                paddingHorizontal: spacing.xs,
                position: "absolute",
                top: -9,
                zIndex: 1,
              },
            ]}
          >
            Max
          </Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={(text) => {
              const max = parse(text);
              onChange({ max, min: max > 0 ? Math.min(minRupees, max) : minRupees });
            }}
            placeholder="Any"
            placeholderTextColor={colors.kicker}
            style={{
              color: colors.ink,
              fontFamily: fonts.sansBold,
              fontSize: 16,
              minHeight: 32,
              padding: 0,
            }}
            value={maxRupees > 0 ? String(maxRupees) : ""}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * The budget as a range: two handles and the range in words (user, 2026-10-31).
 *
 * <p>A drag stays inside this component and reaches the filters only when the
 * finger lifts. Sending every move up re-rendered the whole Discovery tab under
 * the finger, which is what made it lag.
 */
function RentSlider({
  max,
  min,
  onCommit,
}: {
  /** 0 is no ceiling. */
  max: number;
  /** 0 is no floor. */
  min: number;
  onCommit: (next: { max: number; min: number }) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const [low, setLow] = useState(min);
  const [high, setHigh] = useState(max || RENT_MAX);
  const [dragging, setDragging] = useState(false);
  // What a gesture reads: its handlers are made once, so they must not close over a render.
  const live = useRef({ commit: onCommit, high, low, width: 0 });
  live.current.commit = onCommit;
  live.current.high = high;
  live.current.low = low;

  // Typed into the boxes, or reset: follow, unless a finger is on a handle.
  useEffect(() => {
    if (!dragging) {
      setLow(min);
      setHigh(max || RENT_MAX);
    }
  }, [dragging, max, min]);

  function commit(nextLow: number, nextHigh: number) {
    live.current.commit({ max: nextHigh >= RENT_MAX ? 0 : nextHigh, min: nextLow });
  }

  function handle(which: "high" | "low") {
    let start = 0;
    return PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start = live.current[which];
        setDragging(true);
      },
      onPanResponderMove: (_event, gesture) => {
        const width = live.current.width;
        if (width <= 0) {
          return;
        }
        const raw = start + (gesture.dx / width) * RENT_MAX;
        const stepped = Math.round(raw / RENT_STEP) * RENT_STEP;
        if (which === "low") {
          setLow(Math.min(Math.max(stepped, RENT_MIN), live.current.high - RENT_STEP));
        } else {
          setHigh(Math.max(Math.min(stepped, RENT_MAX), live.current.low + RENT_STEP));
        }
      },
      onPanResponderRelease: () => {
        setDragging(false);
        commit(live.current.low, live.current.high);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        commit(live.current.low, live.current.high);
      },
      // The page scrolls too: a handle keeps the finger once it has it.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onStartShouldSetPanResponder: () => true,
    });
  }

  const lowHandle = useRef(handle("low")).current;
  const highHandle = useRef(handle("high")).current;

  const rupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;
  const noCeiling = high >= RENT_MAX;
  // Words light, numbers bold (user, 2026-10-31).
  const words = (text: string) => <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 15 }}>{text}</Text>;
  const number = (value: number) => <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>{rupees(value)}</Text>;
  const range =
    low === 0 && noCeiling
      ? <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>Any budget</Text>
      : low === 0
        ? <>{words("Up to ")}{number(high)}</>
        : noCeiling
          ? <>{words("From ")}{number(low)}</>
          : <>{number(low)}{words(" to ")}{number(high)}</>;

  const lowX = (low / RENT_MAX) * trackWidth;
  const highX = (high / RENT_MAX) * trackWidth;

  const thumb = (x: number, panHandlers: object, label: string) => (
    <View
      {...panHandlers}
      accessibilityLabel={label}
      style={{
        alignItems: "center",
        height: SLIDER_TOUCH,
        justifyContent: "center",
        left: x - SLIDER_TOUCH / 2,
        position: "absolute",
        top: 0,
        width: SLIDER_TOUCH,
      }}
    >
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.primary,
          borderRadius: 999,
          borderWidth: 2,
          height: 26,
          width: 26,
          ...softShadow(colors.shadow, 2, 6),
        }}
      />
    </View>
  );

  return (
    <View style={{ gap: spacing.xs }}>
      <Text>{range}</Text>
      {/* Inset by half a handle, so both can reach the ends without leaving the card. */}
      <View style={{ height: SLIDER_TOUCH, marginHorizontal: 13 }}>
        <View
          onLayout={(event) => {
            live.current.width = event.nativeEvent.layout.width;
            setTrackWidth(event.nativeEvent.layout.width);
          }}
          style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 6, marginTop: (SLIDER_TOUCH - 6) / 2 }}
        />
        <View
          pointerEvents="none"
          style={{
            backgroundColor: colors.primary,
            borderRadius: 999,
            height: 6,
            left: lowX,
            position: "absolute",
            top: (SLIDER_TOUCH - 6) / 2,
            width: Math.max(highX - lowX, 0),
          }}
        />
        {thumb(lowX, lowHandle.panHandlers, "Lowest rent")}
        {thumb(highX, highHandle.panHandlers, "Highest rent")}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.caption, { color: colors.kicker }]}>₹0</Text>
        <Text style={[type.caption, { color: colors.kicker }]}>{`${rupees(RENT_MAX)}+`}</Text>
      </View>
    </View>
  );
}
