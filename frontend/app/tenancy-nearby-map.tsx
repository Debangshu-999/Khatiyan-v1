import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Linking, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { MarqueeText } from "@/components/marquee-text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { foodIcon } from "@/features/food/food-ui";
import { loadMappls, type MapplsCameraRef } from "@/features/discovery/mappls-map";
import { NearbySearchSheet } from "@/features/discovery/nearby-search-sheet";
import {
  CHIP_GLYPHS,
  formatMetres,
  googleDirectionsUrl,
  type MaterialGlyph,
} from "@/features/discovery/nearby-places";
import { rememberSearch } from "@/features/discovery/recent-place-searches";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchCurrentLocation } from "@/store/slices/location-slice";
import {
  useGetMyLocalPlacesMapQuery,
  type LivePlace,
  type LocalPlacesMap,
  type PropertyLocalPlace,
} from "@/store/services/discovery-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The tenant's neighbourhood, on a map.
 *
 * <p>Two states, not one. Idle, the map keeps the top seven tenths and the
 * places management listed sit in a panel below it — that list is the reason
 * most tenants open this screen at all. Searching, the panel goes and the map
 * takes the whole screen, with the results floating over it as cards: a search
 * is about where things ARE, and a list beside a map you cannot see is the
 * wrong half of the answer.
 *
 * <p>Two kinds of pin. Places management listed are placed from coordinates we
 * store; live results are placed from Mappls' own code (`eLoc`), because a
 * standard key returns no coordinates at all — the fact this screen is built
 * around.
 */
export default function TenancyNearbyMapScreen() {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const device = useAppSelector((state) => state.location);

  /**
   * The search the MAP is showing. Only ever set by choosing something.
   *
   * <p>Typing happens in the sheet, against its own copy of this query, so
   * every keystroke no longer moves pins and spends a vendor call on a word
   * that is half typed.
   */
  const [committed, setCommitted] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const mapQuery = useGetMyLocalPlacesMapQuery({ q: committed });
  const data = mapQuery.data;

  /**
   * The parts of the answer that do not depend on the search.
   *
   * <p>A new query is a new cache entry, so `data` is undefined until it
   * resolves — which blinked the home pin and the category bubbles off the
   * screen on every search. The property and the suggestions are the same
   * whatever was asked, so the last ones we saw stay.
   */
  const stable = useRef<{
    property: LocalPlacesMap["property"] | null;
    suggestedCategories: { label: string; query: string }[];
  }>({ property: null, suggestedCategories: [] });
  if (data) {
    stable.current = { property: data.property, suggestedCategories: data.suggestedCategories };
  }
  const property = data?.property ?? stable.current.property;
  const suggestedCategories = data?.suggestedCategories ?? stable.current.suggestedCategories;

  // Loaded once, on mount. Requiring the SDK initialises Mappls, so it must
  // never happen at module scope — see mappls-map.tsx.
  const [mappls] = useState(loadMappls);
  const cameraRef = useRef<MapplsCameraRef>(null);
  const [mapReady, setMapReady] = useState(false);
  /** Centred once, on the first anchor we get. Later ones must not yank it back. */
  const centred = useRef(false);
  /** Height of whatever is floating at the bottom, so the locate button clears it. */
  const [overlayHeight, setOverlayHeight] = useState(0);
  const stackRef = useRef<ScrollView>(null);
  /** Where each result card sits in the stack, so a tapped pin can scroll to its card. */
  const cardTops = useRef<Record<string, number>>({});

  const anchor = useMemo<[number, number] | null>(() => {
    const lat = property?.latitude;
    const lng = property?.longitude;
    return lat != null && lng != null ? [lng, lat] : null;
  }, [property?.latitude, property?.longitude]);

  const listed = useMemo(() => data?.listedPlaces ?? [], [data?.listedPlaces]);
  const live = useMemo(() => data?.liveResults ?? [], [data?.liveResults]);
  const searching = committed.trim().length > 0;

  /**
   * Centres on the property as soon as BOTH the map and the anchor exist.
   *
   * <p>The camera used to render only once the query had answered, so a cold
   * open mounted the map with no camera at all and it sat at the world view —
   * and a camera arriving afterwards did not reliably re-centre it. Leaving
   * the screen and coming back appeared to fix it only because the data was
   * cached by then, so the camera existed on the first render.
   */
  useEffect(() => {
    if (!mapReady || !anchor || centred.current) {
      return;
    }
    centred.current = true;
    cameraRef.current?.flyTo(anchor, 0);
  }, [anchor, mapReady]);

  /**
   * A searched place is what you want to be looking at.
   *
   * <p>Staying on the property was right for a category — the nearest chemist
   * is a street away — and plainly wrong for a named landmark, which can be
   * across the city and left the map sitting on home with its pin somewhere
   * off-screen. So the camera goes to the first result either way: for a
   * category that is the nearest one and barely a pan, and for a landmark it
   * is the thing that was asked for.
   *
   * <p>A single result is also selected, because a search with one answer IS
   * that answer — its card should be showing before anyone taps a pin.
   */
  const flownTo = useRef<string | null>(null);
  useEffect(() => {
    const target = committed.trim();
    if (!target) {
      flownTo.current = null;
      return;
    }
    if (!mapReady || flownTo.current === target) {
      return;
    }
    const first = live[0];
    if (!first) {
      return;
    }
    flownTo.current = target;
    if (first.latitude != null && first.longitude != null) {
      cameraRef.current?.flyTo([first.longitude, first.latitude], 700);
    } else if (first.eLoc) {
      cameraRef.current?.flyWithMapplsPin(first.eLoc, 700);
    }
    if (live.length === 1) {
      setSelected(`live-${first.eLoc ?? 0}`);
    }
  }, [committed, live, mapReady]);

  /** A pin tapped on the map scrolls its own card into view. */
  useEffect(() => {
    if (!searching || !selected) {
      return;
    }
    const top = cardTops.current[selected];
    if (top != null) {
      stackRef.current?.scrollTo({ animated: true, y: Math.max(0, top - spacing.xs) });
    }
  }, [searching, selected]);

  function commitSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    setSelected(null);
    cardTops.current = {};
    setCommitted(trimmed);
    void rememberSearch(trimmed);
  }

  function clearSearch() {
    setCommitted("");
    setSelected(null);
    cardTops.current = {};
    flownTo.current = null;
    if (anchor) {
      cameraRef.current?.flyTo(anchor, 700);
    }
  }

  function focus(place: PropertyLocalPlace | LivePlace, key: string) {
    setSelected(key);
    if (place.latitude != null && place.longitude != null) {
      cameraRef.current?.flyTo([place.longitude, place.latitude], 700);
      return;
    }
    const eLoc = "eLoc" in place ? place.eLoc : null;
    if (eLoc) {
      cameraRef.current?.flyWithMapplsPin(eLoc, 700);
    }
  }

  async function locateMe() {
    if (device.latitude != null && device.longitude != null) {
      cameraRef.current?.flyTo([device.longitude, device.latitude], 700);
      return;
    }
    const result = await dispatch(fetchCurrentLocation()).unwrap().catch(() => null);
    if (result?.latitude != null && result.longitude != null) {
      cameraRef.current?.flyTo([result.longitude, result.latitude], 700);
    }
  }

  // No dev build, no map. Said plainly rather than rendering an empty grey box:
  // the SDK does not exist in Expo Go, and the list below is still useful.
  if (!mappls) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <ScreenHeader
          eyebrow="Around you"
          italicTail="map."
          subtitle={property?.name ?? "Your neighbourhood"}
          title="Nearby"
        />
        <EmptyState
          description="The map needs the development build. The nearby list still works here."
          icon={foodIcon("map-outline")}
          title="Map unavailable in Expo Go"
        />
      </ScreenScrollView>
    );
  }

  const { Camera, MapView, PointAnnotation } = mappls;

  // What a tapped pin is, while nothing is being searched. During a search the
  // cards floating over the map already say it, for every result at once.
  const callout = ((): Callout | null => {
    if (!selected || searching) {
      return null;
    }
    const place = listed.find((item) => `listed-${item.id}` === selected);
    if (!place) {
      return null;
    }
    return {
      address: place.addressText,
      directionsUrl:
        place.directionsUrl
        ?? googleDirectionsUrl(place.name, place.addressText, place.latitude, place.longitude),
      distance: place.distanceKm == null ? null : `${place.distanceKm.toFixed(1)} km`,
      listed: true,
      name: place.name,
    };
  })();

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      {/* Searching, the map is the whole screen. Idle, seven parts map to three
          parts list — proportional rather than a pixel height, so it holds on a
          small phone and a tablet alike. */}
      <View style={{ flex: searching ? 1 : 7 }}>
        <MapView onDidFinishLoadingMap={() => setMapReady(true)} style={{ flex: 1 }}>
          {/* Always mounted, even before the anchor is known — a camera that
              appears later does not take hold. The effects above move it. */}
          <Camera centerCoordinate={anchor ?? undefined} ref={cameraRef} zoomLevel={14} />

          {anchor ? (
            <PointAnnotation coordinate={anchor} id="home" title={property?.name}>
              <MapMarker colour={colors.primary} glyph="home-map-marker" />
            </PointAnnotation>
          ) : null}

          {listed
            .filter((place) => place.latitude != null && place.longitude != null)
            .map((place) => {
              const key = `listed-${place.id}`;
              const on = selected === key;
              return (
                <PointAnnotation
                  coordinate={[place.longitude as number, place.latitude as number]}
                  id={key}
                  // Keyed by the selection too, so growing the pin actually
                  // redraws it — see markerKey.
                  key={markerKey(key, on)}
                  onSelected={() => setSelected(key)}
                  title={place.name}
                >
                  <MapMarker
                    colour={place.ownerRecommended ? colors.accent : colors.jade}
                    glyph={place.ownerRecommended ? "map-marker-star" : "map-marker"}
                    selected={on}
                  />
                </PointAnnotation>
              );
            })}

          {live.map((place, index) => {
            const key = `live-${place.eLoc ?? index}`;
            const on = selected === key;
            const byPoint = place.latitude != null && place.longitude != null;
            return (
              <PointAnnotation
                coordinate={byPoint ? [place.longitude as number, place.latitude as number] : undefined}
                id={key}
                key={markerKey(key, on)}
                mapplsPin={byPoint ? undefined : place.eLoc ?? undefined}
                onSelected={() => setSelected(key)}
                title={place.name}
              >
                <MapMarker colour={colors.danger} glyph="map-marker" selected={on} />
              </PointAnnotation>
            );
          })}
        </MapView>

        {/* Back to where I am. Lifted clear of whatever is floating at the
            bottom, measured rather than guessed — a stack of four result cards
            and a single callout are nowhere near the same height. */}
        <AnimatedPressable
          accessibilityLabel="Show my current location"
          accessibilityRole="button"
          onPress={() => void locateMe()}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: radii.pill,
            // Idle, the panel still overlaps the map's lower edge, so a button
            // sitting a margin off that edge is half under it. With nothing
            // floating the clearance is that overlap and no more: the measured
            // height is whatever was last on screen, and applying it to an
            // empty map leaves the button stranded mid-screen.
            bottom: spacing.md + (searching || callout ? overlayHeight : PANEL_LIFT),
            elevation: 4,
            height: 46,
            justifyContent: "center",
            position: "absolute",
            right: spacing.md,
            shadowColor: colors.shadow,
            shadowOffset: { height: 2, width: 0 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            width: 46,
          }}
        >
          <MaterialCommunityIcons color={colors.primary} name="crosshairs-gps" size={22} />
        </AnimatedPressable>

        {/* The results, over the map rather than beside it. One card per place,
            stacked, scrolling as a group — a search can return a dozen, and
            they all belong on top of the thing they are positions in. */}
        {searching ? (
          <View
            onLayout={(event) => setOverlayHeight(event.nativeEvent.layout.height)}
            pointerEvents="box-none"
            style={{ bottom: 0, left: 0, maxHeight: "52%", position: "absolute", right: 0 }}
          >
            <ScrollView
              contentContainerStyle={{
                gap: spacing.sm,
                paddingBottom: insets.bottom + spacing.md,
                paddingHorizontal: spacing.md,
                paddingTop: spacing.xs,
              }}
              ref={stackRef}
              showsVerticalScrollIndicator={false}
            >
              <ResultBanner
                fetching={mapQuery.isFetching}
                liveSearchAvailable={data?.liveSearchAvailable ?? true}
                onClear={clearSearch}
                query={committed}
                results={live.length}
              />

              {live.map((place, index) => {
                const key = `live-${place.eLoc ?? index}`;
                return (
                  <PlaceCard
                    address={place.address}
                    directionsUrl={googleDirectionsUrl(
                      place.name,
                      place.address,
                      place.latitude,
                      place.longitude,
                    )}
                    distance={place.distanceMeters == null ? null : formatMetres(place.distanceMeters)}
                    key={key}
                    name={place.name}
                    onLayout={(y) => {
                      cardTops.current[key] = y;
                    }}
                    onPress={() => focus(place, key)}
                    selected={selected === key}
                  />
                );
              })}

              {listed.map((place) => {
                const key = `listed-${place.id}`;
                return (
                  <PlaceCard
                    address={place.addressText}
                    directionsUrl={
                      place.directionsUrl
                      ?? googleDirectionsUrl(place.name, place.addressText, place.latitude, place.longitude)
                    }
                    distance={place.distanceKm == null ? null : `${place.distanceKm.toFixed(1)} km`}
                    key={key}
                    listed
                    name={place.name}
                    onLayout={(y) => {
                      cardTops.current[key] = y;
                    }}
                    onPress={() => focus(place, key)}
                    recommended={place.ownerRecommended}
                    selected={selected === key}
                  />
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {callout ? (
          <View
            onLayout={(event) =>
              setOverlayHeight(event.nativeEvent.layout.height + spacing.md + PANEL_LIFT)}
            style={{
              backgroundColor: colors.surface,
              // Floats over the map rather than sitting in the column: as a flex
              // sibling it took its height from the map every time a pin was
              // tapped, and the map jumped.
              borderRadius: radii.card,
              bottom: spacing.md + PANEL_LIFT,
              elevation: 6,
              gap: spacing.sm,
              left: spacing.md,
              padding: spacing.md,
              position: "absolute",
              right: spacing.md,
              shadowColor: colors.shadow,
              shadowOffset: { height: 3, width: 0 },
              shadowOpacity: 0.22,
              shadowRadius: 8,
            }}
          >
            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <MarqueeText style={[type.bodyStrong, { color: colors.ink }]}>{callout.name}</MarqueeText>
                {callout.address ? (
                  <Text numberOfLines={2} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>
                    {callout.address}
                  </Text>
                ) : null}
                <Text style={{ color: colors.kicker, fontFamily: fonts.sans, fontSize: 11.5 }}>
                  {[callout.distance, callout.listed ? "Listed by your property" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <AnimatedPressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setSelected(null)}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: radii.pill,
                  height: 28,
                  justifyContent: "center",
                  width: 28,
                }}
              >
                <MaterialCommunityIcons color={colors.ink} name="close" size={15} />
              </AnimatedPressable>
            </View>

            {callout.directionsUrl ? (
              <View style={{ flexDirection: "row" }}>
                <AnimatedPressable
                  accessibilityLabel={`Directions to ${callout.name}`}
                  accessibilityRole="button"
                  onPress={() => void Linking.openURL(callout.directionsUrl as string)}
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.primary,
                    borderRadius: radii.pill,
                    flexDirection: "row",
                    gap: spacing.xxs,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.xs,
                  }}
                >
                  <MaterialCommunityIcons color={colors.onPrimary} name="directions" size={16} />
                  <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 13 }}>
                    Directions
                  </Text>
                </AnimatedPressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* The controls float. `position: absolute` over the map, inside the safe
          area, the way every map app on the phone does it. */}
      <SafeAreaView
        edges={["top"]}
        pointerEvents="box-none"
        style={{ left: 0, position: "absolute", right: 0, top: 0 }}
      >
        <View style={{ gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
          {/* A button wearing a search box. Tapping it opens the sheet, where
              there is room for what you searched before and for suggestions —
              neither of which fits over a map without covering it. */}
          <AnimatedPressable
            accessibilityHint="Opens the search sheet"
            accessibilityLabel={committed ? `Searching for ${committed}. Change search` : "Search a place or a category"}
            accessibilityRole="search"
            onPress={() => setSearchOpen(true)}
            style={{
              alignItems: "center",
              backgroundColor: colors.surface,
              borderRadius: radii.pill,
              elevation: 4,
              flexDirection: "row",
              gap: spacing.xs,
              minHeight: 48,
              paddingHorizontal: spacing.md,
              shadowColor: colors.shadow,
              shadowOffset: { height: 2, width: 0 },
              shadowOpacity: 0.18,
              shadowRadius: 6,
            }}
          >
            <MaterialCommunityIcons color={colors.primary} name="magnify" size={21} />
            <Text
              numberOfLines={1}
              style={{
                color: committed ? colors.ink : colors.muted,
                flex: 1,
                fontFamily: committed ? fonts.sansMedium : fonts.sans,
                fontSize: 14,
              }}
            >
              {committed || "Search a place or a category"}
            </Text>
            {searching ? (
              <AnimatedPressable
                accessibilityLabel="Clear search"
                accessibilityRole="button"
                hitSlop={10}
                onPress={clearSearch}
                tapLockMs={0}
              >
                <MaterialCommunityIcons color={colors.kicker} name="close" size={19} />
              </AnimatedPressable>
            ) : null}
          </AnimatedPressable>

          {/* Bubbles under the bar, scrolling sideways. Suggestions only — any
              phrase can be searched, a kind of place or the name of one. */}
          <ScrollView
            contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.md }}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {suggestedCategories.map((chip) => {
              const on = committed.trim().toLowerCase() === chip.query.toLowerCase();
              return (
                <AnimatedPressable
                  accessibilityLabel={chip.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  key={chip.query}
                  onPress={() => (on ? clearSearch() : commitSearch(chip.query))}
                  style={{
                    alignItems: "center",
                    backgroundColor: on ? colors.primary : colors.surface,
                    borderRadius: radii.pill,
                    elevation: 3,
                    flexDirection: "row",
                    gap: spacing.xxs,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xs,
                    shadowColor: colors.shadow,
                    shadowOffset: { height: 2, width: 0 },
                    shadowOpacity: 0.15,
                    shadowRadius: 4,
                  }}
                >
                  <MaterialCommunityIcons
                    color={on ? colors.onPrimary : colors.primary}
                    name={CHIP_GLYPHS[chip.query] ?? "map-marker-outline"}
                    size={15}
                  />
                  <Text
                    style={{
                      color: on ? colors.onPrimary : colors.ink,
                      fontFamily: fonts.sansMedium,
                      fontSize: 12.5,
                    }}
                  >
                    {chip.label}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Idle, the panel below the map: the places management listed, which is
          what most tenants came for. It is not rendered at all during a search
          — the map takes the height and the results float over it. */}
      {searching ? null : (
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            // Rounded at the top corners, so the panel reads as a sheet lifted
            // over the map rather than a straight rule cutting the screen in two.
            borderTopLeftRadius: PANEL_LIFT,
            borderTopRightRadius: PANEL_LIFT,
            borderTopWidth: 1,
            flex: 3,
            // Lifted over the map's lower edge, which is what makes the curve
            // visible — flush against it the corners had nothing to round away
            // from.
            marginTop: -PANEL_LIFT,
            // The curve has to clip its own content, or a row's corner pokes
            // through it as the list scrolls.
            overflow: "hidden",
            // On the PANEL, not on the scroll content. Padding inside the
            // scroll only moves the first card down and still lets every card
            // slide up under the rounded edge; padding out here starts the
            // scrolling area lower, so cards disappear at a clean line below
            // the curve instead of through it.
            paddingTop: PANEL_LIFT,
          }}
        >
          <ScreenScrollView
            contentContainerStyle={{
              gap: spacing.sm,
              paddingBottom: spacing.lg,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
            }}
            refreshable={false}
            safeAreaEdges={["bottom"]}
          >
            {listed.map((place) => (
              <PlaceCard
                address={place.addressText}
                directionsUrl={
                  place.directionsUrl
                  ?? googleDirectionsUrl(place.name, place.addressText, place.latitude, place.longitude)
                }
                distance={place.distanceKm == null ? null : `${place.distanceKm.toFixed(1)} km`}
                flat
                key={place.id}
                listed
                name={place.name}
                onPress={() => focus(place, `listed-${place.id}`)}
                recommended={place.ownerRecommended}
                selected={selected === `listed-${place.id}`}
              />
            ))}

            {listed.length === 0 && !mapQuery.isFetching ? (
              <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
                Your property has not listed any places yet. Search above to find what is around you.
              </Text>
            ) : null}
          </ScreenScrollView>
        </View>
      )}

      {searchOpen ? (
        <NearbySearchSheet
          listedPlaces={listed}
          onClose={() => setSearchOpen(false)}
          onSubmit={commitSearch}
          suggestedCategories={suggestedCategories}
        />
      ) : null}
    </View>
  );
}

/** The card shown over the map when a listed pin is tapped. */
type Callout = {
  address: string | null;
  directionsUrl: string | null;
  distance: string | null;
  listed: boolean;
  name: string;
};

/**
 * One line above the result cards saying what the stack is.
 *
 * <p>Carries the only two bad outcomes as well: nothing found, and the vendor
 * refusing to look. Those are different sentences — a tenant told "nothing
 * found" when we never asked concludes their area is empty.
 */
function ResultBanner({
  fetching,
  liveSearchAvailable,
  onClear,
  query,
  results,
}: {
  fetching: boolean;
  liveSearchAvailable: boolean;
  onClear: () => void;
  query: string;
  results: number;
}) {
  const { colors, fonts } = useTheme();
  const message = (() => {
    if (fetching) {
      return `Looking for ${query.trim()}`;
    }
    if (!liveSearchAvailable) {
      return "Could not search the map just now";
    }
    if (results === 0) {
      return `Nothing found for ${query.trim()}`;
    }
    return `${results} ${results === 1 ? "result" : "results"} for ${query.trim()}`;
  })();

  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: colors.surface,
        borderRadius: radii.pill,
        elevation: 3,
        flexDirection: "row",
        gap: spacing.xs,
        maxWidth: "100%",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 0.16,
        shadowRadius: 5,
      }}
    >
      {fetching ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <MaterialCommunityIcons
          color={liveSearchAvailable ? colors.primary : colors.warning}
          name={liveSearchAvailable ? "map-search-outline" : "alert-outline"}
          size={16}
        />
      )}
      <Text
        numberOfLines={1}
        style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 12.5 }}
      >
        {message}
      </Text>
      <AnimatedPressable
        accessibilityLabel="Clear search"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onClear}
        tapLockMs={0}
      >
        <MaterialCommunityIcons color={colors.kicker} name="close" size={16} />
      </AnimatedPressable>
    </View>
  );
}

/**
 * How far the idle panel sits OVER the map's lower edge.
 *
 * <p>One number for three things that have to agree: the panel's top corners,
 * how far it is lifted, and how much clearance anything floating above it
 * needs. They were written out separately, and the locate button ended up
 * half-buried under the panel because only two of the three knew about it.
 */
const PANEL_LIFT = 18;

/**
 * A React key that changes when the pin's SIZE does.
 *
 * <p>An annotation draws its children once, into a bitmap the map then owns.
 * Re-rendering the same annotation with bigger icons inside it leaves that
 * bitmap exactly as it was, so the pin never grows. Changing the key remounts
 * the annotation, which is what makes the native side draw it again.
 *
 * <p>The `id` stays put, because the map identifies the marker by that.
 */
function markerKey(id: string, selected: boolean): string {
  return `${id}-${selected ? "on" : "off"}`;
}

/**
 * How much bigger a chosen pin is than the rest.
 *
 * <p>Enough to find at a glance among a dozen of them, not so much that the
 * map looks like it has two kinds of place on it.
 */
const SELECTED_PIN_SCALE = 1.28;

/**
 * A teardrop pin, drawn as the glyph itself.
 *
 * <p>It used to be a white icon inside a coloured disc, which read as a badge
 * rather than a marker and gave no sense of which point on the map it belonged
 * to. A filled marker has a tip, and the tip is the location.
 *
 * <p>The chosen one grows. Pressing a card used to answer only in the card —
 * a border on the thing already under your finger — which said nothing about
 * WHICH of the pins scattered over the map it was.
 */
function MapMarker({
  colour,
  glyph,
  selected,
}: {
  colour: string;
  glyph: MaterialGlyph;
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const scale = selected ? SELECTED_PIN_SCALE : 1;
  return (
    <View
      style={{
        alignItems: "center",
        height: 40 * scale,
        justifyContent: "center",
        width: 34 * scale,
      }}
    >
      {/* A white copy a size larger, behind, so the pin keeps its edge over
          dark map features like water and motorways. */}
      <MaterialCommunityIcons
        color={colors.surface}
        name={glyph}
        size={38 * scale}
        style={{ position: "absolute" }}
      />
      <MaterialCommunityIcons color={colour} name={glyph} size={32 * scale} />
    </View>
  );
}

/**
 * One place, as a card.
 *
 * <p>The same card in both places on this screen: floating over the map during
 * a search, and flat inside the panel when nothing is searched. `flat` is the
 * difference — a shadow inside a panel is noise, and no shadow over a map
 * leaves the card looking painted onto the streets.
 */
function PlaceCard({
  address,
  directionsUrl,
  distance,
  flat,
  listed,
  name,
  onLayout,
  onPress,
  recommended,
  selected,
}: {
  address: string | null;
  directionsUrl: string | null;
  distance: string | null;
  flat?: boolean;
  listed?: boolean;
  name: string;
  onLayout?: (y: number) => void;
  onPress: () => void;
  recommended?: boolean;
  selected: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={name}
      accessibilityState={{ selected }}
      onLayout={(event) => onLayout?.(event.nativeEvent.layout.y)}
      onPress={onPress}
      style={{
        backgroundColor: flat ? undefined : colors.surface,
        // Selection is a thick blue underline. Not a fill — a pale blue block
        // is not a background this app uses — and not a ring either: a border
        // that thickened on all four sides redrew the card's whole outline, so
        // the eye read "a different card" rather than "this one".
        borderBottomColor: selected ? colors.primary : colors.border,
        borderBottomWidth: selected ? 3 : 1,
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        elevation: flat ? 0 : 4,
        gap: spacing.sm,
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: flat ? 0 : 0.18,
        shadowRadius: 6,
      }}
    >
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xxs }}>
            {recommended ? (
              <MaterialCommunityIcons color={colors.accent} name="star" size={14} />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <MarqueeText style={[type.bodyStrong, { color: colors.ink }]}>{name}</MarqueeText>
            </View>
          </View>
          {address ? (
            <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>
              {address}
            </Text>
          ) : null}
          <Text style={{ color: colors.kicker, fontFamily: fonts.sans, fontSize: 11.5 }}>
            {[distance, listed ? "Listed by your property" : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>

      {/* A labelled button, not a bare glyph. The icon-only circle beside the
          name read as decoration, and nobody pressed it. Filled rather than
          outlined, because it is the one thing on the card worth doing. */}
      {directionsUrl ? (
        <AnimatedPressable
          accessibilityLabel={`Directions to ${name}`}
          accessibilityRole="button"
          onPress={() => void Linking.openURL(directionsUrl)}
          style={{
            alignItems: "center",
            alignSelf: "flex-start",
            backgroundColor: colors.primary,
            borderRadius: radii.pill,
            flexDirection: "row",
            gap: spacing.xxs,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xxs + 3,
          }}
        >
          <MaterialCommunityIcons color={colors.onPrimary} name="directions" size={15} />
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 12 }}>
            Directions
          </Text>
        </AnimatedPressable>
      ) : null}
    </AnimatedPressable>
  );
}
