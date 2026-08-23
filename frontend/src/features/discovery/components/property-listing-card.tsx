import { Image, Linking, Text, View } from "react-native";
import { CalendarClock, CalendarDays, Eye, ImageOff, MapPin, Navigation, type LucideProps } from "lucide-react-native";
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
  // Pincode included: it was the one part of an Indian address a reader looks
  // for to place somewhere exactly, and the line was assembled without it.
  const addressLine = [property.area, property.city, property.state, property.pincode]
    .filter(Boolean)
    .join(", ");
  const hasRent = property.startingRoomRentPaise != null && property.startingRoomRentPaise > 0;

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
    // Gap surrendered to the sections below, which set their own rhythm around
    // their dividers. Card padding stays — the photo is a thumbnail again, not
    // something that runs to the edges.
    <Card style={{ gap: 0 }}>
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

        <View style={{ flex: 1, gap: 5, justifyContent: "center", minWidth: 0 }}>
          <View
            style={{
              alignSelf: "flex-start",
              backgroundColor: colors.surfaceSunken,
              borderRadius: 999,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
            }}
          >
            <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.3 }}>
              {humanizeToken(property.type)}
            </Text>
          </View>
          <Text
            numberOfLines={2}
            style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.3, lineHeight: 24 }}
          >
            {property.name}
          </Text>
        </View>
      </View>

      {/* Its own row, under the thumbnail rather than squeezed beside it: an
          Indian address with a pincode does not fit the column left over next to
          a 72px image, and wrapping it there pushed the card taller than putting
          it here does.

          No "ADDRESS" label — the pin says what the line is. Distance sits on the
          same line because it is a fact ABOUT this address; as a tinted chip
          elsewhere it left the reader to join the two up. */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm }}>
        <MapPin color={colors.inkSoft} size={14} strokeWidth={2.4} style={{ marginTop: 2 }} />
        <Text style={{ color: colors.muted, flex: 1, fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 18 }}>
          {addressLine}
        </Text>
        {property.distanceKm != null ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 3, marginTop: 1 }}>
            <Navigation color={colors.jade} fill={colors.jade} size={10} strokeWidth={2} />
            <Text style={{ color: colors.jade, fontFamily: fonts.sansBold, fontSize: 12, fontVariant: ["tabular-nums"] }}>
              {property.distanceKm < 1
                ? `${Math.round(property.distanceKm * 1000)} m`
                : `${property.distanceKm.toFixed(1)} km`}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Rent leads at display weight with the period beside it, the way every
          listing app states a price; deposit follows quietly, because it is the
          second question. Both were set in mono at one size, which read as a
          spreadsheet and gave neither any priority. */}
      <View style={[section, { alignItems: "flex-end", flexDirection: "row", gap: spacing.sm }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {hasRent ? (
            <View style={{ alignItems: "baseline", flexDirection: "row", gap: 4 }}>
              <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12 }}>
                from
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, letterSpacing: -0.4 }}
              >
                {formatMoneyPaise(property.startingRoomRentPaise)}
              </Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12 }}>
                /month
              </Text>
            </View>
          ) : (
            // One phrase, not "from Not set /month". A price expression built
            // around a missing number reads as a bug, and every part of it —
            // "from", the period — is a claim about a figure that isn't there.
            <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 15 }}>
              Rent on request
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end", gap: 1 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            Deposit
          </Text>
          {/* "None" rather than the profile's "No deposit": this slot is sized
              for a number and sits beside the rent, where the longer phrase
              wraps. ₹0 is the one thing it must not say. */}
          <Text
            style={{
              color: property.standardDepositPaise > 0 ? colors.inkSoft : colors.muted,
              fontFamily: fonts.sansBold,
              fontSize: 15,
            }}
          >
            {property.standardDepositPaise > 0 ? formatMoneyPaise(property.standardDepositPaise) : "None"}
          </Text>
        </View>
      </View>

      {match && match.activeCount > 0 ? (
        <View style={section}>
          <MatchSummary match={match} />
        </View>
      ) : null}

      <View style={[section, { alignItems: "center", flexDirection: "row", gap: spacing.xs }]}>
        {property.dailyRentingAvailable ? (
          <CalendarClock color={colors.jade} size={15} strokeWidth={2.2} />
        ) : (
          <CalendarDays color={colors.muted} size={15} strokeWidth={2.2} />
        )}
        <Text style={{ color: colors.inkSoft, flex: 1, fontFamily: fonts.sansMedium, fontSize: 13 }}>
          {property.dailyRentingAvailable ? "Daily renting available" : "Monthly renting only"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
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
    <View style={{ gap: spacing.sm }}>
      <MatchMeter matched={match.matchedCount} strength={match.strength} total={match.activeCount} />
      {match.matchedTags.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {match.matchedTags.map((tag) => (
            <FeatureTag key={tag} label={tag} />
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
  const { colors, fonts, type } = useTheme();
  const color = strength === "strong" ? colors.jade : strength === "moderate" ? colors.primary : colors.muted;
  const label = strength === "strong" ? "Strong match" : strength === "moderate" ? "Moderate match" : "Weak match";

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: 3 }}>
        {Array.from({ length: total }, (_unused, index) => (
          <View
            key={index}
            style={{
              backgroundColor: index < matched ? color : colors.border,
              borderRadius: 2,
              height: 4,
              width: 14,
            }}
          />
        ))}
      </View>
      <Text style={{ color, fontFamily: fonts.sansBold, fontSize: 12 }}>
        {label}
      </Text>
      <Text style={[type.caption, { color: colors.kicker }]}>
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

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 11.5 }}>
        {label}
      </Text>
    </View>
  );
}
