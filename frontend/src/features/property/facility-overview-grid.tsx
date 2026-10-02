import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { AirVent } from "lucide-react-native";

import { humanizeToken } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const COLLAPSED_FACILITY_ROWS = 3;
const FACILITIES_PER_ROW = 2;

/**
 * The facility grid used wherever a property's amenities are shown.
 *
 * <p>
 * Lifted out of the discovery profile so the owner's own property screen shows
 * the same thing a prospective tenant sees. It previously rendered flat pills
 * there — the same data in a weaker form, which meant the owner could not tell
 * how their listing actually reads.
 *
 * <p>
 * Collapses past three rows behind a blurred "tap to expand", because a property
 * with twenty facilities would otherwise push everything below it off screen.
 */
export function FacilityOverviewGrid({
  collapsedLabel,
  facilities,
  variant = "grid",
  collapsible = true,
}: {
  /**
   * What the expand bar says, given how many are hidden. Defaults to the
   * tenant-facing "n more facilities". An owner editing wants the total they
   * have picked instead.
   */
  collapsedLabel?: (hidden: number) => string;
  facilities: string[];
  variant?: "grid" | "cards";
  collapsible?: boolean;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const collapsedLimit = COLLAPSED_FACILITY_ROWS * FACILITIES_PER_ROW;
  const canCollapse = collapsible && facilities.length > collapsedLimit;
  const visibleFacilities = expanded || !canCollapse ? facilities : facilities.slice(0, collapsedLimit);
  const rows = useMemo(() => chunkPairs(visibleFacilities), [visibleFacilities]);

  return (
    <View style={{ gap: spacing.sm, width: "100%", minWidth: 0 }}>
      <View
        style={{
          // Matches the detail grids on the same screen — the outlined boxes
          // on this page all take the stronger hairline.
          borderColor: colors.borderStrong,
          borderRadius: variant === "cards" ? 12 : 10,
          borderWidth: 1,
          backgroundColor: variant === "cards" ? colors.surface : undefined,
          padding: variant === "cards" ? spacing.sm : 0,
          gap: variant === "cards" ? spacing.sm : 0,
          overflow: variant === "cards" ? "visible" : "hidden",
        }}
      >
        {rows.map((row, rowIndex) => (
          <View
            key={row.map((item) => item).join("-")}
            style={{
              borderBottomColor: colors.border,
              borderBottomWidth: variant === "cards" || rowIndex === rows.length - 1 ? 0 : 1,
              flexDirection: "row",
              alignSelf: "stretch",
              minWidth: 0,
              gap: variant === "cards" ? spacing.sm : 0,
              minHeight: 86,
            }}
          >
            {row.map((facility, columnIndex) => (
              <FacilityOverviewCell
                facility={facility}
                card={variant === "cards"}
                key={facility}
                showDivider={columnIndex === 0 && row.length > 1}
              />
            ))}
            {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}

        {canCollapse && !expanded ? (
          <Pressable
            accessibilityLabel="Expand facilities"
            accessibilityRole="button"
            onPress={() => setExpanded(true)}
            style={{
              bottom: 0,
              left: 0,
              position: "absolute",
              right: 0,
            }}
          >
            <BlurView
              intensity={70}
              tint="default"
              style={{
                alignItems: "center",
                borderTopColor: colors.border,
                borderTopWidth: 1,
                justifyContent: "center",
                minHeight: 58,
                overflow: "hidden",
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <View
                pointerEvents="none"
                style={{
                  backgroundColor: colors.neutralSoft,
                  bottom: 0,
                  left: 0,
                  opacity: 1,
                  position: "absolute",
                  right: 0,
                  top: 0,
                }}
              />
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900" }}>
                {collapsedLabel
                  ? collapsedLabel(facilities.length - visibleFacilities.length)
                  : `${facilities.length - visibleFacilities.length} more facilities. Tap to expand`}
              </Text>
            </BlurView>
          </Pressable>
        ) : null}
      </View>

      {canCollapse && expanded ? (
        <Pressable accessibilityLabel="Collapse facilities" accessibilityRole="button" onPress={() => setExpanded(false)}>
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900", textAlign: "center" }}>
            Show fewer facilities
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FacilityOverviewCell({ facility, showDivider, card = false }: { facility: string; showDivider: boolean; card?: boolean }) {
  const { colors, fonts } = useTheme();
  const iconName = iconForFacility(facility);

  return (
    <View
      style={{
        alignItems: "center",
        borderRightColor: card ? colors.borderStrong : colors.border,
        borderRightWidth: card || showDivider ? 1 : 0,
        ...(card ? {
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderWidth: 1,
          borderRadius: 12,
          elevation: 2,
          shadowColor: colors.shadow,
          shadowOffset: { height: 2, width: 0 },
          shadowOpacity: 1,
          shadowRadius: 6,
        } : {}),
        flex: 1,
        flexBasis: 0,
        flexDirection: "row",
        gap: spacing.sm,
        minWidth: 0,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      {/* AC is drawn with lucide's air vent, as everywhere else in the app.
          Material's air-conditioner glyph is a different picture of it. */}
      {facility === "AIR_CONDITIONING" ? (
        <AirVent color={card ? "#000000" : colors.muted} size={card ? 38 : 25} strokeWidth={1.9} />
      ) : (
        <MaterialCommunityIcons color={card ? "#000000" : colors.muted} name={iconName} size={card ? 38 : 25} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{ color: colors.text, fontFamily: card ? fonts.sansSemiBold : undefined, fontSize: 15, fontWeight: card ? undefined : "800", lineHeight: 19 }}
        >
          {humanizeToken(facility)}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 }}>
          Available
        </Text>
      </View>
    </View>
  );
}

function chunkPairs(items: string[]) {
  const rows: string[][] = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }
  return rows;
}

function iconForFacility(facility: string): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (facility) {
    case "WIFI":
      return "wifi";
    case "MESS":
    case "COMMON_KITCHEN":
      return "silverware-fork-knife";
    case "PARKING":
      return "parking";
    case "GYM":
      return "dumbbell";
    case "CCTV":
      return "cctv";
    case "SECURITY":
      return "shield-check-outline";
    case "DRINKING_WATER":
      return "cup-water";
    case "HOT_WATER":
      return "shower-head";
    case "REFRIGERATOR":
      return "fridge-outline";
    case "WASHING_MACHINE":
    case "LAUNDRY_SERVICE":
      return "washing-machine";
    case "HOUSEKEEPING":
      return "broom";
    case "ROOM_CLEANING":
      return "spray-bottle";
    case "POWER_BACKUP":
      return "power-plug-battery-outline";
    case "LIFT":
      return "elevator";
    case "AIR_CONDITIONING":
      return "air-conditioner";
    case "STUDY_AREA":
      return "book-open-page-variant-outline";
    default:
      return "check-circle-outline";
  }
}
