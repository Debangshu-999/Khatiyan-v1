import { Linking, Text, View } from "react-native";
import { Eye, Send } from "lucide-react-native";

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
          <Text style={[type.body, { color: colors.muted, fontSize: 13 }]} selectable>
            {[property.area, property.city, property.state].filter(Boolean).join(", ")}
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

      {match && match.activeCount > 0 ? <MatchSummary match={match} /> : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <IconButton icon={Eye} label="View" muted onPress={onView} style={{ flex: 1 }} />
        <IconButton icon={Send} label="Directions" onPress={openDirections} style={{ flex: 1 }} />
      </View>
    </Card>
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
        <Text style={[type.caption, { color: colors.muted }]} selectable>
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
      <Text style={[type.caption, { color, fontWeight: "800" }]} selectable>
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
      <Text style={[type.caption, { color: highlighted ? colors.primary : colors.inkSoft, fontWeight: "700" }]} selectable>
        {label}
      </Text>
    </View>
  );
}
