import { Text, View } from "react-native";

import { FitText } from "@/components/fit-text";
import { PropertyCardScenery, propertyCardGround } from "@/components/property-card-scenery";
import { PropertyHouseIcon } from "@/components/property-house-icon";
import { cardShadow } from "@/theme/shadows";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** A property's name split for the card: all but the last word, and the last word in gold. */
export function fancyPropertyName(name: string) {
  // "Pg" or "pg" reads as the abbreviation it is, PG (user, 2026-11-14).
  const words = name.trim().split(/\s+/).map((word) => (/^pg$/i.test(word) ? "PG" : word));
  if (words.length < 2) return { lead: "", tail: words.join(" ") };
  return { lead: words.slice(0, -1).join(" "), tail: words[words.length - 1] };
}

/**
 * The Home property card's face (user, 2026-11-14): the drawn sky and skyline, the
 * coloured house, and the name in Playfair with its last word in gold. Shown on
 * the Property screen too, so the property looks the same in both places.
 */
export function PropertyNameCard({ joined = false, name }: { joined?: boolean; name: string }) {
  const { colors, fonts, isDark } = useTheme();
  const { lead, tail } = fancyPropertyName(name);
  return (
    <View
      accessibilityLabel={name}
      accessibilityRole="header"
      style={{
        alignItems: "center",
        backgroundColor: propertyCardGround(isDark),
        borderCurve: "continuous",
        // Joined to a card under it: the shared outer card owns the corners and the shadow.
        borderRadius: joined ? 0 : 8,
        flexDirection: "row",
        gap: spacing.md,
        minHeight: 60,
        overflow: "hidden",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        ...(joined
          ? {}
          : {
              ...cardShadow(colors.shadow),
              borderBottomColor: "rgba(255, 255, 255, 0.9)",
              borderBottomWidth: 1.5,
              borderLeftColor: "rgba(255, 255, 255, 0.9)",
              borderLeftWidth: 1.5,
              borderRightColor: "rgba(255, 255, 255, 0.9)",
              borderRightWidth: 1.5,
              borderTopColor: "rgba(255, 255, 255, 0.9)",
              borderTopWidth: 1.5,
            }),
      }}
    >
      <PropertyCardScenery dark={isDark} />
      <PropertyHouseIcon size={34} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <FitText
          numberOfLines={1}
          style={{
            color: colors.ink,
            fontFamily: fonts.fancy,
            fontSize: 23,
            letterSpacing: 0.2,
            lineHeight: 29,
            textShadowColor: isDark ? "rgba(0, 0, 0, 0.45)" : "rgba(255, 255, 255, 0.9)",
            textShadowOffset: { height: 0, width: 0 },
            textShadowRadius: 6,
          }}
        >
          {lead}
          {tail ? (
            <Text style={{ color: colors.accent, fontFamily: fonts.fancy, fontSize: 23, lineHeight: 29 }}>{`${lead ? " " : ""}${tail}`}</Text>
          ) : null}
        </FitText>
      </View>
    </View>
  );
}
