import { useEffect, useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { MarqueeText } from "@/components/marquee-text";
import { SheetShell } from "@/components/sheet-shell";
import { CHIP_GLYPHS, formatMetres, type MaterialGlyph } from "@/features/discovery/nearby-places";
import { forgetSearch, loadRecentSearches } from "@/features/discovery/recent-place-searches";
import { useDebouncedValue } from "@/features/discovery/use-debounced-value";
import { useGetMyLocalPlacesMapQuery, type PropertyLocalPlace } from "@/store/services/discovery-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Below this, a search is too vague to spend a vendor call on. */
const MIN_SUGGEST_LENGTH = 2;

/**
 * Where a search is actually typed.
 *
 * <p>The bar on the map is a button, not a field. Typing over a map means a
 * keyboard covering the thing you are looking at, and suggestions that cannot
 * be listed without burying it. Here the map is out of the way, what you
 * looked for last time is one tap, and nothing is committed until a suggestion
 * is chosen or the search key is pressed.
 *
 * <p>Suggestions come from the same endpoint the map itself reads. A chosen
 * suggestion therefore lands on a cache entry that is already filled, and the
 * map draws its pins without a second round trip.
 */
export function NearbySearchSheet({
  listedPlaces,
  onClose,
  onSubmit,
  suggestedCategories,
}: {
  listedPlaces: PropertyLocalPlace[];
  onClose: () => void;
  onSubmit: (query: string) => void;
  suggestedCategories: { label: string; query: string }[];
}) {
  const { colors, fonts, type } = useTheme();
  const [draft, setDraft] = useState("");
  const debounced = useDebouncedValue(draft, 350);
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    void loadRecentSearches().then(setRecents);
  }, []);

  const typed = draft.trim();
  const settled = debounced.trim();
  const suggestQuery = useGetMyLocalPlacesMapQuery(
    { q: settled },
    { skip: settled.length < MIN_SUGGEST_LENGTH },
  );
  // Only trusted once it is the answer to what is in the box. A settled query
  // lagging the draft would otherwise list the previous word's places under
  // the new one.
  const liveResults = settled === typed ? suggestQuery.data?.liveResults ?? [] : [];

  const categoryMatches = useMemo(
    () =>
      typed
        ? suggestedCategories.filter((category) =>
            `${category.label} ${category.query}`.toLowerCase().includes(typed.toLowerCase()))
        : [],
    [suggestedCategories, typed],
  );

  const listedMatches = useMemo(
    () =>
      typed
        ? listedPlaces
            .filter((place) =>
              `${place.name} ${place.subcategoryNames.join(" ")}`
                .toLowerCase()
                .includes(typed.toLowerCase()))
            .slice(0, 5)
        : [],
    [listedPlaces, typed],
  );

  function commit(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    onSubmit(trimmed);
    onClose();
  }

  const looking = suggestQuery.isFetching && settled.length >= MIN_SUGGEST_LENGTH;
  const nothingYet =
    typed.length > 0
    && !looking
    && categoryMatches.length === 0
    && listedMatches.length === 0
    && liveResults.length === 0;

  return (
    <SheetShell animated onClose={onClose} title="Search nearby">
      <View style={{ gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderRadius: radii.pill,
            flexDirection: "row",
            gap: spacing.xs,
            paddingHorizontal: spacing.md,
          }}
        >
          <MaterialCommunityIcons color={colors.kicker} name="magnify" size={19} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppTextInput
              autoFocus
              onChangeText={setDraft}
              onSubmitEditing={() => commit(draft)}
              placeholder="A place or a category"
              returnKeyType="search"
              style={{ backgroundColor: "transparent", borderWidth: 0, paddingHorizontal: 0 }}
              value={draft}
            />
          </View>
          {typed ? (
            <AnimatedPressable
              accessibilityLabel="Clear"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setDraft("")}
              tapLockMs={0}
            >
              <MaterialCommunityIcons color={colors.kicker} name="close-circle" size={18} />
            </AnimatedPressable>
          ) : null}
        </View>

        {/* Nothing typed: what you looked for before, then what is worth
            looking for. Both are one tap, which is the point of the sheet. */}
        {!typed && recents.length > 0 ? (
          <View style={{ gap: spacing.xxs }}>
            <GroupLabel text="Recent" />
            {recents.map((entry) => (
              <SuggestionRow
                glyph="history"
                key={entry}
                onForget={() => void forgetSearch(entry).then(setRecents)}
                onPress={() => commit(entry)}
                title={entry}
              />
            ))}
          </View>
        ) : null}

        {!typed ? (
          <View style={{ gap: spacing.xxs }}>
            <GroupLabel text="Suggested" />
            {suggestedCategories.map((category) => (
              <SuggestionRow
                glyph={CHIP_GLYPHS[category.query] ?? "map-marker-outline"}
                key={category.query}
                onPress={() => commit(category.query)}
                title={category.label}
              />
            ))}
          </View>
        ) : null}

        {categoryMatches.length > 0 ? (
          <View style={{ gap: spacing.xxs }}>
            <GroupLabel text="Categories" />
            {categoryMatches.map((category) => (
              <SuggestionRow
                glyph={CHIP_GLYPHS[category.query] ?? "map-marker-outline"}
                key={category.query}
                onPress={() => commit(category.query)}
                title={category.label}
              />
            ))}
          </View>
        ) : null}

        {listedMatches.length > 0 ? (
          <View style={{ gap: spacing.xxs }}>
            <GroupLabel text="Listed by your property" />
            {listedMatches.map((place) => (
              <SuggestionRow
                glyph={place.ownerRecommended ? "star" : "map-marker-outline"}
                key={place.id}
                onPress={() => commit(place.name)}
                subtitle={place.addressText}
                title={place.name}
              />
            ))}
          </View>
        ) : null}

        {typed && (liveResults.length > 0 || looking) ? (
          <View style={{ gap: spacing.xxs }}>
            <GroupLabel text="Places" />
            {looking ? (
              <View
                style={{
                  alignItems: "center",
                  flexDirection: "row",
                  gap: spacing.xs,
                  paddingVertical: spacing.xs,
                }}
              >
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5 }}>
                  Looking around you
                </Text>
              </View>
            ) : null}
            {liveResults.map((place, index) => (
              <SuggestionRow
                // The same red teardrop this place will be on the map, so the
                // line you tapped and the pin you end up looking at are
                // recognisably the same thing.
                glyph="map-marker"
                key={`${place.eLoc ?? place.name}-${index}`}
                onPress={() => commit(place.name)}
                subtitle={[
                  place.distanceMeters == null ? null : formatMetres(place.distanceMeters),
                  place.address,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                tint={colors.danger}
                title={place.name}
              />
            ))}
          </View>
        ) : null}

        {nothingYet ? (
          <Text
            style={[type.body, { color: colors.muted, paddingVertical: spacing.sm, textAlign: "center" }]}
          >
            {settled.length < MIN_SUGGEST_LENGTH
              ? "Keep typing to see suggestions."
              : `Nothing matched “${typed}” yet. Press search to look anyway.`}
          </Text>
        ) : null}
      </View>
    </SheetShell>
  );
}

function GroupLabel({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Text
      style={{
        color: colors.kicker,
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        letterSpacing: 0.9,
        textTransform: "uppercase",
      }}
    >
      {text}
    </Text>
  );
}

/**
 * One tappable line in the sheet.
 *
 * <p>The glyph sits in an outlined disc rather than a filled one: a fill is
 * reserved for a refusal or a status in this app, and a suggestion is neither.
 */
function SuggestionRow({
  glyph,
  onForget,
  onPress,
  subtitle,
  tint,
  title,
}: {
  glyph: MaterialGlyph;
  onForget?: () => void;
  onPress: () => void;
  subtitle?: string | null;
  /** The glyph's colour, when it should match the pin this place gets on the map. */
  tint?: string;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: spacing.sm,
        paddingVertical: spacing.xs,
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderColor: colors.border,
          borderRadius: radii.pill,
          borderWidth: 1,
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        <MaterialCommunityIcons color={tint ?? colors.ink} name={glyph} size={17} />
      </View>
      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <MarqueeText style={[type.bodyStrong, { color: colors.ink }]}>{title}</MarqueeText>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onForget ? (
        <AnimatedPressable
          accessibilityLabel={`Remove ${title} from recent searches`}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onForget}
          tapLockMs={0}
        >
          <MaterialCommunityIcons color={colors.kicker} name="close" size={16} />
        </AnimatedPressable>
      ) : null}
    </AnimatedPressable>
  );
}
