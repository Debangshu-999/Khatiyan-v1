import { useRef, useState } from "react";
import { Modal, PanResponder, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
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
import { DiscoveryButton } from "./discovery-button";

export type PropertyFilterState = {
  pgFor: PgFor | null;
  minRentPaise: number | null;
  maxRentPaise: number | null;
  preferredFor: PreferredTenantType | null;
  foodIncluded: boolean | null;
  mealTypes: MealType[];
  electricityIncluded: boolean | null;
  bathroomType: BathroomType | null;
  sharingTypes: RoomType[];
};

export const emptyPropertyFilters: PropertyFilterState = {
  bathroomType: null,
  electricityIncluded: null,
  foodIncluded: null,
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
  if (filters.foodIncluded !== null) count += 1;
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
    update({
      foodIncluded: true,
      mealTypes: exists ? filters.mealTypes.filter((item) => item !== meal) : [...filters.mealTypes, meal],
    });
  }

  function toggleSharingType(sharingType: RoomType) {
    const exists = filters.sharingTypes.includes(sharingType);
    update({
      sharingTypes: exists
        ? filters.sharingTypes.filter((item) => item !== sharingType)
        : [...filters.sharingTypes, sharingType],
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
            backgroundColor: colors.background,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            maxHeight: "90%",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              alignItems: "center",
              borderBottomColor: colors.border,
              borderBottomWidth: 1,
              flexDirection: "row",
              justifyContent: "space-between",
              padding: spacing.lg,
            }}
          >
            <View>
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.display,
                  fontSize: 22,
                  fontWeight: "600",
                  letterSpacing: -0.2,
                }}
                selectable
              >
                Property filters
              </Text>
              <Text style={[type.caption, { color: colors.muted }]} selectable>
                Refine listed PG and hostel profiles
              </Text>
            </View>
            <AnimatedPressable accessibilityLabel="Close filters" accessibilityRole="button" onPress={onClose}>
              <X color={colors.muted} size={24} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>

          <ScrollView
            contentContainerStyle={{
              gap: spacing.lg,
              padding: spacing.lg,
              paddingBottom: 120 + insets.bottom,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <FilterSection title="PG for">
              <ChoiceGrid
                options={PG_FOR_OPTIONS}
                selected={filters.pgFor ?? "ANYONE"}
                onSelect={(value) => update({ pgFor: value === "ANYONE" ? null : value })}
              />
            </FilterSection>

            <FilterSection title="Minimum rent">
              <RentSlider
                onChange={(rupees) =>
                  update({ maxRentPaise: null, minRentPaise: rupees > 0 ? rupees * 100 : null })
                }
                value={filters.minRentPaise === null ? 0 : Math.round(filters.minRentPaise / 100)}
              />
            </FilterSection>

            <FilterSection title="Preferred for">
              <ChoiceGrid
                options={PREFERRED_TENANT_OPTIONS}
                selected={filters.preferredFor ?? "ANYONE"}
                onSelect={(value) => update({ preferredFor: value === "ANYONE" ? null : value })}
              />
            </FilterSection>

            <FilterSection title="Food">
              <BooleanChoice
                value={filters.foodIncluded}
                onChange={(value) => update({ foodIncluded: value, mealTypes: value ? filters.mealTypes : [] })}
              />
              {filters.foodIncluded ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {MEAL_TYPES.map((meal) => (
                    <FilterChip
                      key={meal}
                      label={humanizeToken(meal)}
                      selected={filters.mealTypes.includes(meal)}
                      onPress={() => toggleMeal(meal)}
                    />
                  ))}
                  <FilterChip
                    label="All meals"
                    selected={filters.mealTypes.length === MEAL_TYPES.length}
                    onPress={() =>
                      update({
                        foodIncluded: true,
                        mealTypes: filters.mealTypes.length === MEAL_TYPES.length ? [] : [...MEAL_TYPES],
                      })
                    }
                  />
                </View>
              ) : null}
            </FilterSection>

            <FilterSection title="Electricity included">
              <BooleanChoice value={filters.electricityIncluded} onChange={(value) => update({ electricityIncluded: value })} />
            </FilterSection>

            <FilterSection title="Bathroom type">
              <ChoiceGrid
                options={["ANY", ...BATHROOM_TYPES]}
                selected={filters.bathroomType ?? "ANY"}
                onSelect={(value) => update({ bathroomType: value === "ANY" ? null : (value as BathroomType) })}
              />
            </FilterSection>

            <FilterSection title="Room sharing">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {ROOM_TYPES.map((sharingType) => (
                  <FilterChip
                    key={sharingType}
                    label={humanizeToken(sharingType)}
                    selected={filters.sharingTypes.includes(sharingType)}
                    onPress={() => toggleSharingType(sharingType)}
                  />
                ))}
              </View>
            </FilterSection>
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
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              position: "absolute",
              right: 0,
            }}
          >
            <DiscoveryButton label="Reset" muted onPress={onReset} style={{ flex: 1 }} />
            <DiscoveryButton label="Search" onPress={() => onApply(filters)} style={{ flex: 1.4 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterSection({ children, title }: { children: React.ReactNode; title: string }) {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ChoiceGrid<T extends string>({
  onSelect,
  options,
  selected,
}: {
  onSelect: (value: T) => void;
  options: T[];
  selected: T;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {options.map((option) => (
        <FilterChip key={option} label={option === "ANY" ? "Any" : humanizeToken(option)} selected={option === selected} onPress={() => onSelect(option)} />
      ))}
    </View>
  );
}

function BooleanChoice({ onChange, value }: { onChange: (value: boolean | null) => void; value: boolean | null }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      <FilterChip label="Any" selected={value === null} onPress={() => onChange(null)} />
      <FilterChip label="Yes" selected={value === true} onPress={() => onChange(true)} />
      <FilterChip label="No" selected={value === false} onPress={() => onChange(false)} />
    </View>
  );
}

function FilterChip({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  const { colors, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        backgroundColor: selected ? colors.primary : colors.surfaceRaised,
        borderColor: selected ? colors.primary : colors.border,
        borderRadius: 13,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
      }}
    >
      <Text style={[type.caption, { color: selected ? colors.onPrimary : colors.ink, fontWeight: "900" }]} selectable>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// Single-thumb rent slider (0 – ₹1,00,000). The chosen value is the MINIMUM
// rent; 0 means "Any". Built on PanResponder so it needs no extra package.
const RENT_MIN = 0;
const RENT_MAX = 100000;
const RENT_STEP = 1000;

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
  const thumbLeft = Math.min(Math.max(ratio * trackWidth - 12, 0), Math.max(trackWidth - 24, 0));

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]} selectable>
          At least
        </Text>
        <Text style={{ color: colors.ink, fontFamily: fonts.mono, fontSize: 17, fontWeight: "800" }} selectable>
          {value === 0 ? "Any" : `₹${value.toLocaleString("en-IN")}`}
        </Text>
      </View>

      <View ref={trackRef} {...responder.panHandlers} onLayout={measure} style={{ height: 36, justifyContent: "center" }}>
        <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 6 }} />
        <View
          style={{
            backgroundColor: colors.primary,
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
            borderColor: colors.primary,
            borderRadius: 999,
            borderWidth: 3,
            elevation: 3,
            height: 24,
            left: thumbLeft,
            position: "absolute",
            shadowColor: colors.shadow,
            shadowOffset: { height: 2, width: 0 },
            shadowOpacity: 1,
            shadowRadius: 4,
            width: 24,
          }}
        />
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.caption, { color: colors.kicker }]} selectable>
          ₹0
        </Text>
        <Text style={[type.caption, { color: colors.kicker }]} selectable>
          ₹{RENT_MAX.toLocaleString("en-IN")}
        </Text>
      </View>
    </View>
  );
}
