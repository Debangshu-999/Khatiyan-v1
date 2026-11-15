import { Image, ScrollView, Text, View } from "react-native";
import { EmptySearch } from "@/components/empty-art";
import { Search } from "lucide-react-native";

import { AiGradient, aiGradientSpans } from "@/components/ai-style";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { MarqueeText } from "@/components/marquee-text";
import type { ListingSort } from "@/store/services/discovery-api";
import type { SmartSearchListing, SmartSearchResult } from "@/store/services/intelligence-api";
import { cardShadow, softShadow } from "@/theme/shadows";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import type { FilterMatch, MatchStrength } from "../discovery-match";
import { ListingSortButton, sortListings } from "./listing-sort";
import { PropertyListingCard } from "./property-listing-card";

const EMPTY_SEARCH_ILLUSTRATION = require("../../../../assets/empty-states/discovery-empty-search.png");

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
  onOpenSort,
  onTryAgain,
  onView,
  result,
  sort,
  visible,
}: {
  onOpenSort: () => void;
  /** Clears the sentence and its answer, for the empty state's button. */
  onTryAgain: () => void;
  onView: (propertyId: string) => void;
  result: SmartSearchResult;
  /** Re-orders each section on the device. Both arrived whole, so this is exact. */
  sort: ListingSort;
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
  const foundLine =
    found === 0 ? "No results match your search" : `Found ${found} result${found === 1 ? "" : "s"} matching your search`;
  // The matching section fills first: those are the answers, and the related
  // ones only start appearing once somebody has scrolled past them.
  const matching = sortListings(result.matching, sort).slice(0, visible);
  const related = sortListings(result.related, sort).slice(0, Math.max(0, visible - result.matching.length));
  const hidden =
    result.matching.length + result.related.length - matching.length - related.length;

  return (
    <>
      <View style={{ gap: spacing.xxs }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          {/* One line, always. On a phone the sentence wrapped beside the sort button. */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <MarqueeText spans={aiGradientSpans(foundLine)} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
              {foundLine}
            </MarqueeText>
          </View>
          {found + result.related.length > 1 ? <ListingSortButton onPress={onOpenSort} sort={sort} /> : null}
        </View>

        {/* Under the count they describe, not above it: they say what "matching
            your search" meant for this sentence. */}
        {/* One line that slides sideways. Wrapping grew the header by a row
            for every few requirements and pushed the first card down. */}
        {result.requirements.length > 0 ? (
          <ScrollView
            // The padding is room for the bubbles' shadow, which the scroller would clip.
            contentContainerStyle={{ gap: spacing.xs, paddingBottom: 6, paddingHorizontal: 2, paddingTop: 2 }}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {result.requirements.map((requirement) => (
              // Two layers: the shadow on the outer, as the gradient edge needs overflow hidden.
              <View
                key={requirement}
                style={{ backgroundColor: colors.surface, borderRadius: 999, ...cardShadow(colors.shadow) }}
              >
                <View style={{ borderCurve: "continuous", borderRadius: 999, overflow: "hidden", padding: 1.5 }}>
                  <AiGradient />
                  <View style={{ backgroundColor: colors.surface, borderCurve: "continuous", borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
                    <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 11.5 }}>
                      {requirement}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {/* The same empty state the ordinary search shows, so an empty answer
          reads as "nothing matched" rather than as a different kind of screen. */}
      {found === 0 && result.related.length === 0 ? (
        <Card>
          <View
            style={{
              alignItems: "center",
              gap: spacing.sm,
              paddingBottom: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.sm,
            }}
          >
            <EmptySearch size={144} />
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 21,
                letterSpacing: -0.25,
                textAlign: "center",
              }}
            >
              No listings found
            </Text>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={onTryAgain}
              style={{
                alignItems: "center",
                borderColor: colors.primary,
                borderRadius: 12,
                borderWidth: 1.5,
                flexDirection: "row",
                gap: spacing.sm,
                justifyContent: "center",
                marginTop: spacing.sm,
                minHeight: 48,
                paddingHorizontal: spacing.lg,
              }}
            >
              <Search color={colors.primary} size={19} strokeWidth={2.3} />
              <Text style={{ color: colors.primary, fontFamily: fonts.displaySoft, fontSize: 15 }}>
                Try a different search
              </Text>
            </AnimatedPressable>
          </View>
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
          {/* The heading of the AI review card, closer in on both sides than the list's own spacing. */}
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15, marginBottom: -spacing.xs, marginTop: -spacing.xs }}>
            Related results
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
 * The server's verdict, in the shape the existing match meter reads.
 *
 * <p>The strength is taken as given, never recomputed from the counts. A
 * landmark's distance moves it on its own scale, so two listings that both meet
 * "near a metro" can be strong and moderate — and a count alone would call them
 * the same.
 */
function toMatch(listing: SmartSearchListing): FilterMatch {
  const active = listing.requirementCount;
  const matched = listing.matchedTags.length;
  const strength: MatchStrength | null = listing.strength
    ? (listing.strength.toLowerCase() as MatchStrength)
    : null;
  return {
    activeCount: active,
    matchedCount: matched,
    matchedTags: listing.matchedTags,
    strength,
  };
}
