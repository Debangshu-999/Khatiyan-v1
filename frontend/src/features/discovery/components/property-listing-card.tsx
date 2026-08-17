import { Image, Linking, Text, View } from "react-native";
import { Eye, ImageOff, MapPin, Navigation, type LucideProps } from "lucide-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Card } from "@/components/card";
import { IconButton } from "@/components/icon-button";
import type { PropertyDiscoveryCard } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { computeFilterMatches, type FilterMatch, type MatchStrength } from "../discovery-match";
import type { PropertyFilterState } from "./property-filter-modal";
import { formatMoneyPaise, humanizeToken } from "../discovery-format";

type PropertyListingCardProps = {
  property: PropertyDiscoveryCard;
  filters?: PropertyFilterState;
  onView: () => void;
};

export function PropertyListingCard({ filters, property, onView }: PropertyListingCardProps) {
  const { colors, fonts, type } = useTheme();
  const match = filters ? computeFilterMatches(filters, property) : null;
  const imageUri = property.imageUrls?.find(Boolean) ?? property.profileImageUrl ?? null;
  const addressLine = [property.area, property.city, property.state].filter(Boolean).join(", ");

  function openDirections() {
    if (property.directionsUrl) {
      void Linking.openURL(property.directionsUrl);
      return;
    }

    const query = encodeURIComponent(
      [property.name, property.address, property.area, property.city, property.state, property.pincode].filter(Boolean).join(", "),
    );
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  return (
    <Card>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        {imageUri ? (
          <Image
            resizeMode="cover"
            source={{ uri: imageUri }}
            style={{
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              height: 72,
              width: 72,
            }}
          />
        ) : (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              gap: 3,
              height: 72,
              justifyContent: "center",
              width: 72,
            }}
          >
            <ImageOff color={colors.kicker} size={22} strokeWidth={1.9} />
            <Text style={{ color: colors.kicker, fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.4 }}>
              No image
            </Text>
          </View>
        )}

        <View style={{ flex: 1, gap: spacing.xxs, justifyContent: "center", minWidth: 0 }}>
          <Text style={[type.eyebrow, { color: colors.primary }]}>
            {humanizeToken(property.type)}
          </Text>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 20,
              letterSpacing: -0.3,
              lineHeight: 24,
            }}
          >
            {property.name}
          </Text>
        </View>
      </View>

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            Address
          </Text>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
            <MapPin color={colors.muted} size={13} strokeWidth={2.2} style={{ marginTop: 2.5 }} />
            <Text style={[type.body, { color: colors.inkSoft, flex: 1, fontSize: 13, lineHeight: 18 }]}>
              {addressLine}
            </Text>
          </View>
        </View>
        {property.distanceKm != null ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.jadeSoft,
              borderRadius: 999,
              flexDirection: "row",
              gap: 4,
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
            }}
          >
            <Navigation color={colors.jade} fill={colors.jade} size={10} strokeWidth={2} />
            <Text style={{ color: colors.jade, fontFamily: fonts.sansBold, fontSize: 11, fontVariant: ["tabular-nums"], }}>
              {property.distanceKm < 1
                ? `${Math.round(property.distanceKm * 1000)} m away`
                : `${property.distanceKm.toFixed(1)} km away`}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ backgroundColor: colors.border, height: 1 }} />

      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            Rent from
          </Text>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.mono,
              fontSize: 17,
              fontVariant: ["tabular-nums"],
              fontWeight: "500",
            }}
          >
            {formatMoneyPaise(property.startingRoomRentPaise)}
          </Text>
        </View>
        <View style={{ backgroundColor: colors.border, width: 1 }} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            Deposit
          </Text>
          {/* "None" rather than the profile's "No deposit": this slot is sized
              for a number and sits beside the rent, where the longer phrase
              wraps. ₹0 is the one thing it must not say. */}
          <Text
            style={{
              color: colors.ink,
              fontFamily: property.standardDepositPaise > 0 ? fonts.mono : fonts.sansBold,
              fontSize: 17,
              fontVariant: ["tabular-nums"],
            }}
          >
            {property.standardDepositPaise > 0 ? formatMoneyPaise(property.standardDepositPaise) : "None"}
          </Text>
        </View>
      </View>

      <Text style={[type.caption, { color: property.dailyRentingAvailable ? colors.jade : colors.muted }]}>
        {property.dailyRentingAvailable ? "✦ Daily renting available" : "Monthly renting only"}
      </Text>

      {match && match.activeCount > 0 ? <MatchSummary match={match} /> : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <IconButton icon={Eye} label="View" muted onPress={onView} style={{ flex: 1 }} />
        <IconButton icon={DirectionsIcon} label="Directions" onPress={openDirections} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

// Google-Maps-style directions glyph (diamond with a turn arrow); wrapped so it
// satisfies IconButton's lucide icon contract.
function DirectionsIcon({ color, size }: LucideProps) {
  return (
    <MaterialCommunityIcons
      color={color as string}
      name="directions"
      size={typeof size === "number" ? size + 3 : 20}
    />
  );
}

function MatchSummary({ match }: { match: FilterMatch }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        {match.strength ? <StrengthBadge matched={match.matchedCount} strength={match.strength} total={match.activeCount} /> : null}
      </View>
      {match.matchedTags.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {match.matchedTags.map((tag) => (
            <FeatureTag key={tag} highlighted label={tag} />
          ))}
        </View>
      ) : (
        <Text style={[type.caption, { color: colors.muted }]}>
          Outside your preferences, shown nearby.
        </Text>
      )}
    </View>
  );
}

function StrengthBadge({ matched, strength, total }: { matched: number; strength: MatchStrength; total: number }) {
  const { colors, type } = useTheme();
  const color = strength === "strong" ? colors.jade : strength === "moderate" ? colors.primary : colors.muted;
  const label = strength === "strong" ? "Strong match" : strength === "moderate" ? "Moderate match" : "Weak match";
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: color,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
      }}
    >
      <View style={{ backgroundColor: color, borderRadius: 999, height: 7, width: 7 }} />
      <Text style={[type.caption, { color, fontWeight: "800" }]}>
        {label} · {matched}/{total}
      </Text>
    </View>
  );
}

function FeatureTag({ highlighted, label }: { highlighted?: boolean; label: string }) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        backgroundColor: highlighted ? colors.primarySoft : "transparent",
        borderColor: highlighted ? colors.primary : colors.border,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
      }}
    >
      <Text style={[type.caption, { color: highlighted ? colors.primary : colors.inkSoft, fontWeight: "700" }]}>
        {label}
      </Text>
    </View>
  );
}
