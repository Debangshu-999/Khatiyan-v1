import { Linking, Text, View } from "react-native";
import { Eye, Send } from "lucide-react-native";

import { Card } from "@/components/card";
import { IconButton } from "@/components/icon-button";
import type { PropertyDiscoveryCard } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { formatDistance, formatMoneyPaise, humanizeToken } from "../discovery-format";

type PropertyListingCardProps = {
  property: PropertyDiscoveryCard;
  onView: () => void;
};

export function PropertyListingCard({ property, onView }: PropertyListingCardProps) {
  const { colors, fonts, type } = useTheme();
  const visibleFacilities = [...(property.facilities ?? []), ...(property.customFacilities ?? [])].slice(0, 3);

  function openDirections() {
    if (property.directionsUrl) {
      void Linking.openURL(property.directionsUrl);
      return;
    }

    const query = encodeURIComponent(`${property.name}, ${property.address}, ${property.city}, ${property.pincode}`);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  return (
    <Card>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.primary,
            borderRadius: 12,
            borderWidth: 1,
            height: 56,
            justifyContent: "center",
            width: 56,
          }}
        >
          <Text
            style={{
              color: colors.primary,
              fontFamily: fonts.display,
              fontSize: 26,
              fontStyle: "italic",
              fontWeight: "500",
              letterSpacing: -0.5,
            }}
            selectable
          >
            {property.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text
              style={{
                color: colors.ink,
                flex: 1,
                fontFamily: fonts.display,
                fontSize: 20,
                fontWeight: "500",
                letterSpacing: -0.3,
                lineHeight: 24,
              }}
              selectable
            >
              {property.name}
            </Text>
            <Text style={[type.eyebrow, { color: colors.primary }]} selectable>
              {humanizeToken(property.type)}
            </Text>
          </View>
          <Text style={[type.eyebrow, { color: colors.primary }]} selectable>
            {formatDistance(property.distanceKm)}
          </Text>
          <Text style={[type.body, { color: colors.muted, fontSize: 13 }]} selectable>
            {property.address}, {property.city}
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: colors.border, height: 1 }} />

      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
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
            selectable
          >
            {formatMoneyPaise(property.startingRoomRentPaise)}
          </Text>
        </View>
        <View style={{ backgroundColor: colors.border, width: 1 }} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            Deposit
          </Text>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.mono,
              fontSize: 17,
              fontVariant: ["tabular-nums"],
              fontWeight: "500",
            }}
            selectable
          >
            {formatMoneyPaise(property.standardDepositPaise)}
          </Text>
        </View>
      </View>

      <Text style={[type.caption, { color: property.dailyRentingAvailable ? colors.jade : colors.muted }]} selectable>
        {property.dailyRentingAvailable ? "✦ Daily renting available" : "Monthly renting only"}
      </Text>

      {visibleFacilities.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {visibleFacilities.map((facility) => (
            <FeatureTag key={facility} label={humanizeToken(facility)} />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <IconButton icon={Eye} label="View" muted onPress={onView} style={{ flex: 1 }} />
        <IconButton icon={Send} label="Directions" onPress={openDirections} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

function FeatureTag({ label }: { label: string }) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
      }}
    >
      <Text style={[type.caption, { color: colors.inkSoft, fontWeight: "700" }]} selectable>
        {label}
      </Text>
    </View>
  );
}
