import { useRef, useState, type ComponentType } from "react";
import { Modal, PanResponder, ScrollView, Text, TextInput, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bath,
  BedDouble,
  GraduationCap,
  Mars,
  Search,
  UsersRound,
  UtensilsCrossed,
  Venus,
  Wallet,
  X,
  Zap,
  type LucideProps,
} from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
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
  type RoomType,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { humanizeToken } from "../discovery-format";

type LucideIcon = ComponentType<LucideProps>;

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
};

export const emptyPropertyFilters: PropertyFilterState = {
  bathroomType: null,
  electricityIncluded: null,
  maxRentPaise: null,
  mealTypes: [],
  minRentPaise: null,
  pgFor: null,
  preferredFor: null,
  sharingTypes: [],
};

type PropertyFilterModalProps = {
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
  return count;
}

export function PropertyFilterModal({
  filters,
  onApply,
  onClose,
  onReset,
  onUpdate,
  visible,
}: PropertyFilterModalProps) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();

  function update(partial: Partial<PropertyFilterState>) {
    onUpdate({ ...filters, ...partial });
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
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surfaceRaised,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "94%",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              alignSelf: "center",
              backgroundColor: colors.borderStrong,
              borderRadius: 999,
              height: 5,
              marginTop: spacing.sm,
              width: 42,
            }}
          />
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              paddingBottom: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.display,
                  fontSize: 24,
                  letterSpacing: -0.45,
                }}
              >
                Property filters
              </Text>
              <Text style={[type.caption, { color: colors.muted, fontSize: 13 }]}>
                Refine listed PG and hostel profiles
              </Text>
            </View>
            <AnimatedPressable
              accessibilityLabel="Close filters"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={{
                alignItems: "center",
                backgroundColor: colors.neutralSoft,
                borderRadius: 999,
                height: 46,
                justifyContent: "center",
                width: 46,
              }}
            >
              <X color={colors.muted} size={22} strokeWidth={2.3} />
            </AnimatedPressable>
          </View>

          <ScrollView
            contentContainerStyle={{
              gap: spacing.md,
              paddingBottom: 116 + insets.bottom,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.xs,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* "PG for" understated the results. Discovery draws from every
                visible profile with no property-type restriction, so hostels
                come back alongside PGs — the heading has to cover both. */}
            <ChoiceSection
              description="Who can stay at this property?"
              icon={UsersRound}
              title="PG/Hostel for"
            >
              <ChoiceGrid
                getIcon={(option) => PG_FOR_ICONS[option]}
                getLabel={(option) => (option === "ANYONE" ? "Any" : humanizeToken(option))}
                options={PG_FOR_OPTIONS}
                selected={filters.pgFor ?? "ANYONE"}
                onSelect={(value) => update({ pgFor: value === "ANYONE" ? null : value })}
              />
            </ChoiceSection>

            <ChoiceSection
              contentStyle={{ marginLeft: 0 }}
              description="Set your preferred monthly budget"
              icon={Wallet}
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
              description="Who is this property suitable for?"
              icon={GraduationCap}
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
              description="Which meals should be included?"
              icon={UtensilsCrossed}
              title="Meals included"
            >
              <MultiChoiceGrid
                getLabel={humanizeToken}
                onToggle={toggleMeal}
                options={MEAL_TYPES}
                selected={filters.mealTypes}
              />
            </ChoiceSection>

            <ChoiceSection
              description="Is electricity included in the rent?"
              icon={Zap}
              title="Electricity included"
            >
              <BooleanChoice
                value={filters.electricityIncluded}
                onChange={(value) => update({ electricityIncluded: value })}
              />
            </ChoiceSection>

            <ChoiceSection
              description="Choose the bathroom arrangement"
              icon={Bath}
              title="Bathroom type"
            >
              <ChoiceGrid
                getLabel={(option) => (option === "ANY" ? "Any" : humanizeToken(option))}
                options={["ANY", ...BATHROOM_TYPES]}
                selected={filters.bathroomType ?? "ANY"}
                onSelect={(value) => update({ bathroomType: value === "ANY" ? null : (value as BathroomType) })}
              />
            </ChoiceSection>

            <ChoiceSection
              description="Select one or more room occupancies"
              icon={BedDouble}
              title="Room sharing"
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                <ChoiceChip
                  columns={2}
                  label="Any sharing"
                  onPress={() => update({ sharingTypes: [] })}
                  selected={filters.sharingTypes.length === 0}
                />
                {ROOM_TYPES.map((sharingType) => (
                  <ChoiceChip
                    columns={2}
                    key={sharingType}
                    label={humanizeToken(sharingType)}
                    onPress={() => toggleSharing(sharingType)}
                    selected={filters.sharingTypes.includes(sharingType)}
                  />
                ))}
              </View>
            </ChoiceSection>
          </ScrollView>

          <View
            style={{
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              borderTopWidth: 1,
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
            <FilterFooterButton label="Reset" muted onPress={onReset} style={{ flex: 1 }} />
            <FilterFooterButton
              icon={Search}
              label="Search"
              onPress={() => onApply(filters)}
              style={{ flex: 1.1 }}
            />
          </View>
        </View>
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
  icon: Icon,
  label,
  muted = false,
  onPress,
  style,
}: {
  icon?: LucideIcon;
  label: string;
  muted?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        {
          alignItems: "center",
          backgroundColor: muted ? colors.surface : colors.primary,
          borderColor: colors.primary,
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
      {Icon ? <Icon color={muted ? colors.primary : colors.onPrimary} size={21} strokeWidth={2.3} /> : null}
      <Text
        style={{
          color: muted ? colors.primary : colors.onPrimary,
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

/**
 * Budget: a slider for the ceiling, and two boxes for anyone who would rather
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
      <RentSlider
        onChange={(rupees) => onChange({ max: rupees, min: Math.min(minRupees, rupees || RENT_MAX) })}
        value={maxRupees}
      />

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

function RentSlider({ onChange, value }: { onChange: (rupees: number) => void; value: number }) {
  const { colors, fonts, type } = useTheme();
  const trackRef = useRef<View>(null);
  const trackLeftRef = useRef(0);
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);

  function measure() {
    trackRef.current?.measureInWindow((x, _y, width) => {
      trackLeftRef.current = x;
      trackWidthRef.current = width;
      setTrackWidth(width);
    });
  }

  function setFromPageX(pageX: number) {
    const width = trackWidthRef.current;
    if (width <= 0) {
      return;
    }
    const ratio = Math.min(Math.max((pageX - trackLeftRef.current) / width, 0), 1);
    const stepped = Math.round((RENT_MIN + ratio * (RENT_MAX - RENT_MIN)) / RENT_STEP) * RENT_STEP;
    onChange(Math.min(Math.max(stepped, RENT_MIN), RENT_MAX));
  }

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => setFromPageX(event.nativeEvent.pageX),
      onPanResponderMove: (event) => setFromPageX(event.nativeEvent.pageX),
    }),
  ).current;

  const ratio = (value - RENT_MIN) / (RENT_MAX - RENT_MIN);
  const filledWidth = Math.max(ratio * trackWidth, 0);
  const thumbSize = 24;
  const thumbLeft = Math.min(
    Math.max(ratio * trackWidth - thumbSize / 2, 0),
    Math.max(trackWidth - thumbSize, 0),
  );

  return (
    <View
      style={{
        backgroundColor: colors.primarySoft,
        borderRadius: 14,
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <View style={{ gap: 1 }}>
        <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.sansMedium }]}>
          Up to
        </Text>
        <Text style={{ color: colors.primaryDeep, fontFamily: fonts.display, fontSize: 29, letterSpacing: -0.65 }}>
          {value === 0 ? "Any rent" : `₹${value.toLocaleString("en-IN")}`}
        </Text>
      </View>

      <View ref={trackRef} {...responder.panHandlers} onLayout={measure} style={{ height: 36, justifyContent: "center" }}>
        <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 6 }} />
        <View
          style={{
            backgroundColor: colors.ink,
            borderRadius: 999,
            height: 6,
            left: 0,
            position: "absolute",
            width: filledWidth,
          }}
        />
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.ink,
            borderRadius: 999,
            borderWidth: 2,
            elevation: 4,
            height: thumbSize,
            left: thumbLeft,
            position: "absolute",
            shadowColor: "#000000",
            shadowOffset: { height: 3, width: 0 },
            shadowOpacity: 0.22,
            shadowRadius: 3,
            width: thumbSize,
          }}
        >
          <View
            style={{
              backgroundColor: colors.ink,
              borderRadius: 999,
              height: 8,
              left: "50%",
              marginLeft: -1,
              position: "absolute",
              top: 6,
              width: 2,
            }}
          />
        </View>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.caption, { color: colors.kicker }]}>
          ₹0
        </Text>
        <Text style={[type.caption, { color: colors.kicker }]}>
          ₹{RENT_MAX.toLocaleString("en-IN")}
        </Text>
      </View>
    </View>
  );
}
