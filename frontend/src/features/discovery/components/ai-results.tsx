import { Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";

import { Card } from "@/components/card";
import type { SmartSearchListing, SmartSearchResult } from "@/store/services/intelligence-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import type { FilterMatch, MatchStrength } from "../discovery-match";
import { PropertyListingCard } from "./property-listing-card";

/**
 * The answer to a sentence.
 *
 * <p>Three things, in this order: what the search understood, how many
 * listings answer it, and the listings themselves. Then a second section for
 * the ones that answer only part of it — shown rather than dropped, each
 * carrying what it missed, because a blank screen over stock that nearly fits
 * is the worst answer this search can give.
 *
 * <p>Every strength meter here is the server's, not one computed on this side.
 * Smart search scores requirements the filter sheet cannot express — a property
 * type, a deposit ceiling, a facility, a distance from a metro station — and
 * the reason lines are written from the same figures. Working the strength out
 * again here would eventually contradict the sentence printed beneath it.
 */
export function AiResults({
  onView,
  result,
  visible,
}: {
  onView: (propertyId: string) => void;
  result: SmartSearchResult;
  /**
   * How many cards to draw, across both sections.
   *
   * <p>Everything arrived in one call — the whole ranked list is already here —
   * so this is only about not mounting two hundred cards to show eight. The
   * screen raises it as somebody scrolls.
   */
  visible: number;
}) {
  const { colors, fonts, type } = useTheme();
  const found = result.matching.length;
  // The matching section fills first: those are the answers, and the related
  // ones only start appearing once somebody has scrolled past them.
  const matching = result.matching.slice(0, visible);
  const related = result.related.slice(0, Math.max(0, visible - result.matching.length));
  const hidden =
    result.matching.length + result.related.length - matching.length - related.length;

  return (
    <>
      {result.requirements.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {result.requirements.map((requirement) => (
            <View
              key={requirement}
              style={{
                backgroundColor: colors.primarySoft,
                borderCurve: "continuous",
                borderRadius: 999,
                paddingHorizontal: spacing.sm,
                paddingVertical: 5,
              }}
            >
              <Text style={{ color: colors.primaryDeep, fontFamily: fonts.sansMedium, fontSize: 11.5 }}>
                {requirement}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Sparkles color={colors.primary} size={16} strokeWidth={2.2} />
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>
          {found === 0
            ? "No results match your search"
            : `Found ${found} result${found === 1 ? "" : "s"} matching your search`}
        </Text>
      </View>

      {found === 0 && result.related.length === 0 ? (
        <Card>
          <Text style={[type.body, { color: colors.muted }]}>
            Nothing here answers that yet. Try widening the area, or switch AI search off to set the
            filters by hand.
          </Text>
        </Card>
      ) : null}

      {matching.map((listing) => (
        <Listing
          hideDeviceDistance={result.landmark !== null}
          key={listing.property.propertyId}
          listing={listing}
          onView={onView}
        />
      ))}

      {related.length > 0 ? (
        <>
          <Text
            style={[
              type.caption,
              { color: colors.muted, fontWeight: "700", marginTop: spacing.xs },
            ]}
          >
            Related results
          </Text>
          <Text style={[type.caption, { color: colors.kicker }]}>
            These match part of your search. Each one says what it does not.
          </Text>
          {related.map((listing) => (
            <Listing
              hideDeviceDistance={result.landmark !== null}
              key={listing.property.propertyId}
              listing={listing}
              onView={onView}
            />
          ))}
        </>
      ) : null}

      {hidden > 0 ? (
        <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
          Keep scrolling for {hidden} more
        </Text>
      ) : null}
    </>
  );
}

function Listing({
  hideDeviceDistance,
  listing,
  onView,
}: {
  hideDeviceDistance: boolean;
  listing: SmartSearchListing;
  onView: (propertyId: string) => void;
}) {
  return (
    <PropertyListingCard
      // "10.9 km" from the device, beside a line about a metro station, is two
      // reference points on one card. The landmark distance replaces it.
      hideDistance={hideDeviceDistance}
      match={toMatch(listing)}
      nearest={
        listing.nearestName != null && listing.nearestKm != null
          ? { km: listing.nearestKm, name: listing.nearestName }
          : null
      }
      onView={() => onView(listing.property.propertyId)}
      property={listing.property}
      reason={listing.reason}
    />
  );
}

/**
 * The server's count, in the shape the existing match meter reads.
 *
 * <p>Same thresholds as the manual search's own calculation, so a "strong
 * match" means the same thing in both halves of the screen.
 */
function toMatch(listing: SmartSearchListing): FilterMatch {
  const active = listing.requirementCount;
  const matched = listing.matchedTags.length;
  let strength: MatchStrength | null = null;
  if (active > 0) {
    const ratio = matched / active;
    strength = ratio >= 1 ? "strong" : ratio >= 0.5 ? "moderate" : "weak";
  }
  return {
    activeCount: active,
    matchedCount: matched,
    matchedTags: listing.matchedTags,
    strength,
  };
}
