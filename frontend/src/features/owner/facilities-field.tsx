import { useState, type ComponentType } from "react";
import { Modal, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AirVent,
  BatteryCharging,
  BookOpen,
  Brush,
  Cctv,
  ChevronRight,
  CircleParking,
  CookingPot,
  Dumbbell,
  Flame,
  GlassWater,
  MoveVertical,
  Pencil,
  Plus,
  Refrigerator,
  ShieldCheck,
  Shirt,
  Sparkles,
  Utensils,
  WashingMachine,
  Wifi,
  Wrench,
  X,
  type LucideProps,
} from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { ActionButton, humanizeToken } from "@/features/owner/owner-ui";
import { PROPERTY_FACILITIES, type PropertyFacility } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const FACILITY_ICONS: Record<PropertyFacility, ComponentType<LucideProps>> = {
  AIR_CONDITIONING: AirVent,
  CCTV: Cctv,
  COMMON_KITCHEN: CookingPot,
  DRINKING_WATER: GlassWater,
  GYM: Dumbbell,
  HOT_WATER: Flame,
  HOUSEKEEPING: Brush,
  LAUNDRY_SERVICE: Shirt,
  LIFT: MoveVertical,
  MESS: Utensils,
  PARKING: CircleParking,
  POWER_BACKUP: BatteryCharging,
  REFRIGERATOR: Refrigerator,
  ROOM_CLEANING: Sparkles,
  SECURITY: ShieldCheck,
  STUDY_AREA: BookOpen,
  WASHING_MACHINE: WashingMachine,
  WIFI: Wifi,
};

type FacilitiesFieldProps = {
  customFacilities: string[];
  facilities: PropertyFacility[];
  onChangeCustom: (next: string[]) => void;
  onChangeFacilities: (next: PropertyFacility[]) => void;
};

// Inline form field: a tappable "selections card" summarising the chosen
// facilities (predefined with their icon, custom ones with a spanner), plus a
// full picker modal with an icon grid and a custom-facility adder.
export function FacilitiesField({ customFacilities, facilities, onChangeCustom, onChangeFacilities }: FacilitiesFieldProps) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);
  const total = facilities.length + customFacilities.length;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.label, { color: colors.inkSoft }]}>
        Facilities & amenities
      </Text>

      <AnimatedPressable
        accessibilityHint="Opens the facilities picker"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          gap: spacing.sm,
          padding: spacing.md,
        }}
      >
        {total === 0 ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Plus color={colors.primary} size={18} strokeWidth={2.4} />
            <Text style={[type.body, { color: colors.muted, flex: 1 }]}>
              Select facilities & amenities
            </Text>
            <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {facilities.map((facility) => (
                <SelectedChip icon={FACILITY_ICONS[facility]} key={facility} label={humanizeToken(facility)} />
              ))}
              {customFacilities.map((custom) => (
                <SelectedChip icon={Wrench} key={`custom-${custom}`} label={custom} tone="custom" />
              ))}
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
                {total} selected
              </Text>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                <Pencil color={colors.primary} size={14} strokeWidth={2.3} />
                <Text style={[type.caption, { color: colors.primary, fontWeight: "800" }]}>
                  Edit
                </Text>
              </View>
            </View>
          </>
        )}
      </AnimatedPressable>

      {open ? (
        <FacilitiesPickerModal
          customFacilities={customFacilities}
          facilities={facilities}
          onChangeCustom={onChangeCustom}
          onChangeFacilities={onChangeFacilities}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

function SelectedChip({ icon: Icon, label, tone }: { icon: ComponentType<LucideProps>; label: string; tone?: "custom" }) {
  const { colors, type } = useTheme();
  const accent = tone === "custom" ? colors.accent : colors.primary;
  const background = tone === "custom" ? colors.accentSoft : colors.primarySoft;
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: background,
        borderRadius: 999,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
      }}
    >
      <Icon color={accent} size={13} strokeWidth={2.3} />
      <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>
        {label}
      </Text>
    </View>
  );
}

function FacilitiesPickerModal({
  customFacilities,
  facilities,
  onChangeCustom,
  onChangeFacilities,
  onClose,
}: {
  customFacilities: string[];
  facilities: PropertyFacility[];
  onChangeCustom: (next: string[]) => void;
  onChangeFacilities: (next: PropertyFacility[]) => void;
  onClose: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState("");

  const columns = 3;
  const tileGap = spacing.sm;
  const tileWidth = Math.floor((width - spacing.lg * 2 - tileGap * (columns - 1)) / columns);

  function toggleFacility(facility: PropertyFacility) {
    onChangeFacilities(
      facilities.includes(facility) ? facilities.filter((item) => item !== facility) : [...facilities, facility],
    );
  }

  function addCustom() {
    const value = draft.trim();
    if (!value) {
      return;
    }
    const exists = customFacilities.some((item) => item.toLowerCase() === value.toLowerCase());
    if (!exists) {
      onChangeCustom([...customFacilities, value]);
    }
    setDraft("");
  }

  function removeCustom(value: string) {
    onChangeCustom(customFacilities.filter((item) => item !== value));
  }

  return (
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "92%",
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
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.accent }]}>
                Amenities
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.3 }}>
                Select facilities
              </Text>
            </View>
            <AnimatedPressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose}>
              <X color={colors.muted} size={24} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>

          <ScrollView
            contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tileGap }}>
              {PROPERTY_FACILITIES.map((facility) => (
                <FacilityTile
                  active={facilities.includes(facility)}
                  icon={FACILITY_ICONS[facility]}
                  key={facility}
                  label={humanizeToken(facility)}
                  onPress={() => toggleFacility(facility)}
                  width={tileWidth}
                />
              ))}
            </View>

            <View style={{ gap: spacing.sm }}>
              <Text style={[type.label, { color: colors.inkSoft }]}>
                Custom facilities
              </Text>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: 14,
                    borderWidth: 1,
                    flex: 1,
                    flexDirection: "row",
                    gap: spacing.sm,
                    minHeight: 50,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <Wrench color={colors.accent} size={16} strokeWidth={2.3} />
                  <AppTextInput
                    accessibilityLabel="Custom facility"
                    autoCapitalize="words"
                    onChangeText={setDraft}
                    onSubmitEditing={addCustom}
                    placeholder="e.g. Rooftop lounge"
                    placeholderTextColor={colors.kicker}
                    returnKeyType="done"
                    style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, minHeight: 48, paddingVertical: 0 }}
                    value={draft}
                  />
                </View>
                <AnimatedPressable
                  accessibilityLabel="Add custom facility"
                  accessibilityRole="button"
                  onPress={addCustom}
                  // Outlined with an ink glyph, matching the amenity picker:
                  // fills are for status, outlines for actions.
                  style={{
                    alignItems: "center",
                    borderColor: draft.trim() ? colors.ink : colors.border,
                    borderCurve: "continuous",
                    borderRadius: 14,
                    borderWidth: 1.5,
                    height: 50,
                    justifyContent: "center",
                    width: 50,
                  }}
                >
                  <Plus color={draft.trim() ? colors.ink : colors.kicker} size={20} strokeWidth={2.6} />
                </AnimatedPressable>
              </View>

              {customFacilities.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  {customFacilities.map((custom) => (
                    <AnimatedPressable
                      accessibilityLabel={`Remove ${custom}`}
                      accessibilityRole="button"
                      key={custom}
                      onPress={() => removeCustom(custom)}
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.accentSoft,
                        borderRadius: 999,
                        flexDirection: "row",
                        gap: spacing.xs,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 7,
                      }}
                    >
                      <Wrench color={colors.accent} size={13} strokeWidth={2.3} />
                      <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>
                        {custom}
                      </Text>
                      <X color={colors.muted} size={14} strokeWidth={2.4} />
                    </AnimatedPressable>
                  ))}
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View
            style={{
              borderTopColor: colors.border,
              borderTopWidth: 1,
              flexDirection: "row",
              paddingBottom: insets.bottom + spacing.md,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
            }}
          >
            <ActionButton label="Done" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FacilityTile({
  active,
  icon: Icon,
  label,
  onPress,
  width,
}: {
  active: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  width: number;
}) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        // The app's selection green, not a pale blue wash: primarySoft is not a
        // fill anywhere, and this was the last place still using it as one.
        backgroundColor: active ? colors.jadeSoft : colors.surface,
        borderColor: active ? colors.jade : colors.border,
        borderRadius: 16,
        borderWidth: active ? 1.5 : 1,
        gap: spacing.xs,
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.md,
        position: "relative",
        width,
      }}
    >
      {/* No corner badge. A filled blue disc was a second, louder answer to a
          question the tile's own fill and border already answer. */}
      <Icon color={active ? colors.ink : colors.muted} size={24} strokeWidth={2} />
      <Text numberOfLines={2} style={[type.caption, { color: active ? colors.ink : colors.muted, fontWeight: "700", textAlign: "center" }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
