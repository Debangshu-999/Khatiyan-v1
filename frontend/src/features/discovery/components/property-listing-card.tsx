import { Image, Linking, Text, View } from "react-native";
import {
  Bath,
  BedDouble,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CircleCheck,
  Eye,
  GraduationCap,
  ImageOff,
  MapPin,
  Navigation,
  Utensils,
  Zap,
  type LucideProps,
} from "lucide-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Card } from "@/components/card";
import { IconButton } from "@/components/icon-button";
import type { PropertyDiscoveryCard } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { computeFilterMatches, type FilterMatch, type MatchStrength } from "../discovery-match";
import type { PropertyFilterState } from "./property-filter-modal";
import { formatMoneyPaise } from "../discovery-format";

type PropertyListingCardProps = {
  property: PropertyDiscoveryCard;
  filters?: PropertyFilterState;
  onView: () => void;
};

export function PropertyListingCard({ filters, property, onView }: PropertyListingCardProps) {
  const { colors, fonts } = useTheme();
  const match = filters ? computeFilterMatches(filters, property) : null;
  const imageUri = property.imageUrls?.find(Boolean) ?? property.profileImageUrl ?? null;
  // Pincode included: it was the one part of an Indian address a reader looks
  // for to place somewhere exactly, and the line was assembled without it.
  const addressLine = [property.area, property.city, property.state, property.pincode]
    .filter(Boolean)
    .join(", ");
  const hasRent = property.startingRoomRentPaise != null && property.startingRoomRentPaise > 0;
  const hasActiveMatch = Boolean(match && match.activeCount > 0);
  const propertyNameFontSize = property.name.length > 34 ? 15 : property.name.length > 24 ? 17 : 19;
  const propertyNameLineHeight = Math.round(propertyNameFontSize * 1.18);

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

  // Each divider owns the space around it, rather than the card owning one gap
  // for everything: the sections are different weights of information and a
  // uniform rhythm made the whole card read as one undifferentiated stack.
  const section = {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  } as const;

  return (
    <Card style={{ gap: 0, padding: spacing.md }}>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        {imageUri ? (
          <Image
            resizeMode="cover"
            source={{ uri: imageUri }}
            style={{
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.border,
              borderRadius: 16,
              borderWidth: 1,
              height: 104,
              width: 104,
            }}
          />
        ) : (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: 16,
              borderWidth: 1,
              gap: 3,
              height: 104,
              justifyContent: "center",
              width: 104,
            }}
          >
            <ImageOff color={colors.kicker} size={26} strokeWidth={1.9} />
            <Text style={{ color: colors.kicker, fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.4 }}>
              No image
            </Text>
          </View>
        )}

        <View
          style={{
            flex: 1,
            height: 104,
            justifyContent: "space-between",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={2}
            style={{
              color: colors.ink,
              fontFamily: fonts.sansBold,
              fontSize: propertyNameFontSize,
              letterSpacing: -0.5,
              lineHeight: propertyNameLineHeight,
            }}
          >
            {property.name}
          </Text>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 5 }}>
            <MapPin color={colors.muted} size={14} strokeWidth={2.2} style={{ marginTop: 1 }} />
            <Text
              numberOfLines={2}
              style={{ color: colors.muted, flex: 1, fontFamily: fonts.sansMedium, fontSize: 11.5, lineHeight: 15 }}
            >
              {addressLine}
            </Text>
          </View>
          {property.distanceKm != null ? (
            <View
              style={{
                alignItems: "center",
                alignSelf: "flex-start",
                flexDirection: "row",
                gap: 4,
              }}
            >
              <Navigation color={colors.jade} fill={colors.jade} size={11} strokeWidth={2} />
              <Text style={{ color: colors.jade, fontFamily: fonts.sansBold, fontSize: 11, fontVariant: ["tabular-nums"] }}>
                {property.distanceKm < 1
                  ? `${Math.round(property.distanceKm * 1000)} m`
                  : `${property.distanceKm.toFixed(1)} km`}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={[section, { alignItems: "stretch", flexDirection: "row", paddingHorizontal: spacing.xs }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 13, marginBottom: 5 }}>
            Rent from
          </Text>
          {hasRent ? (
            <View style={{ alignItems: "baseline", flexDirection: "row", gap: 4 }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 22, letterSpacing: -0.5 }}
              >
                {formatMoneyPaise(property.startingRoomRentPaise)}
              </Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12 }}>
                /month
              </Text>
            </View>
          ) : (
            <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 15 }}>
              Rent on request
            </Text>
          )}
        </View>
        <View style={{ alignSelf: "stretch", backgroundColor: colors.border, marginHorizontal: spacing.md, width: 1 }} />
        <View style={{ flex: 0.8, minWidth: 0 }}>
          <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 13, marginBottom: 7 }}>
            Deposit
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: property.standardDepositPaise > 0 ? colors.ink : colors.muted,
              fontFamily: fonts.sansBold,
              fontSize: 20,
              letterSpacing: -0.3,
            }}
          >
            {property.standardDepositPaise > 0 ? formatMoneyPaise(property.standardDepositPaise) : "None"}
          </Text>
        </View>
      </View>

      {hasActiveMatch && match ? (
        <View style={section}>
          <MatchSummary match={match} />
        </View>
      ) : null}

      {property.dailyRentingAvailable ? (
        <View
          style={[section, { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xs }]}
        >
          <CalendarDays color={colors.jade} size={18} strokeWidth={2.2} />
          <Text style={{ color: colors.inkSoft, flex: 1, fontFamily: fonts.sansMedium, fontSize: 13.5 }}>
            Daily renting available
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
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
  const { colors, fonts } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <MatchMeter matched={match.matchedCount} strength={match.strength} total={match.activeCount} />
      {match.matchedTags.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {match.matchedTags.map((tag) => (
            <FeatureTag key={tag} label={tag} />
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12.5 }}>
          Outside your preferences, shown nearby.
        </Text>
      )}
    </View>
  );
}

/**
 * How many of the reader's filters this place actually meets.
 *
 * <p>A meter rather than the badge it replaced. "● Strong match · 3/4" was a
 * bordered pill sitting directly above a row of tags, so the one line that
 * summarises the match competed with the evidence for it — and a fraction set in
 * a pill is read, not glanced at. Filled segments carry the count, colour
 * carries the verdict, and the words spell out what the fraction counts.
 */
function MatchMeter({ matched, strength, total }: { matched: number; strength: MatchStrength | null; total: number }) {
  const { colors, fonts } = useTheme();
  const color =
    strength === "strong" ? colors.jade : strength === "moderate" ? colors.primary : colors.warningText;
  const backgroundColor =
    strength === "strong" ? colors.successSoft : strength === "moderate" ? colors.primarySoft : colors.warningSoft;
  const label = strength === "strong" ? "Strong match" : strength === "moderate" ? "Moderate match" : "Weak match";

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor,
        borderRadius: 12,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 9,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: color,
          borderRadius: 999,
          height: 26,
          justifyContent: "center",
          width: 26,
        }}
      >
        <Check color="#FFFFFF" size={16} strokeWidth={3} />
      </View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        numberOfLines={1}
        style={{ color, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 11.5 }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: 3, marginLeft: "auto" }}>
        {Array.from({ length: total }, (_unused, index) => (
          <View
            key={index}
            style={{
              backgroundColor: index < matched ? color : colors.borderStrong,
              borderRadius: 999,
              height: 8,
              width: 8,
            }}
          />
        ))}
      </View>
      <View style={{ backgroundColor: colors.borderStrong, height: 22, width: 1 }} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        numberOfLines={1}
        style={{ color: colors.muted, flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 10.5 }}
      >
        {matched} of {total} filter{total === 1 ? "" : "s"}
      </Text>
    </View>
  );
}

/**
 * One filter this place matched.
 *
 * <p>Outlined, never filled. These were `primarySoft` blocks, and three or four
 * of them was a band of blue louder than the property's own name — they are
 * evidence for the match line above, not a call to action.
 */
function FeatureTag({ label }: { label: string }) {
  const { colors, fonts } = useTheme();
  const displayLabel = label.replace(/^PG for /, "");

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 5,
      }}
    >
      <FeatureIcon color={colors.inkSoft} label={label} />
      <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 11.25 }}>
        {displayLabel}
      </Text>
    </View>
  );
}

function FeatureIcon({ color, label }: { color: string; label: string }) {
  const normalized = label.toLowerCase();

  if (normalized.includes("female")) {
    return <MaterialCommunityIcons color={color} name="gender-female" size={15} />;
  }
  if (normalized.includes("male")) {
    return <MaterialCommunityIcons color={color} name="gender-male" size={15} />;
  }
  if (normalized.includes("student")) {
    return <GraduationCap color={color} size={13} strokeWidth={2.1} />;
  }
  if (normalized.includes("professional") || normalized.includes("working")) {
    return <BriefcaseBusiness color={color} size={13} strokeWidth={2.1} />;
  }
  if (
    normalized.includes("food") ||
    normalized.includes("breakfast") ||
    normalized.includes("lunch") ||
    normalized.includes("dinner")
  ) {
    return <Utensils color={color} size={13} strokeWidth={2.1} />;
  }
  if (normalized.includes("electricity")) {
    return <Zap color={color} size={13} strokeWidth={2.1} />;
  }
  if (normalized.includes("bathroom")) {
    return <Bath color={color} size={13} strokeWidth={2.1} />;
  }
  if (normalized.includes("sharing")) {
    return <BedDouble color={color} size={13} strokeWidth={2.1} />;
  }

  return <CircleCheck color={color} size={13} strokeWidth={2.1} />;
}
