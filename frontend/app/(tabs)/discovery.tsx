import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, Easing, Image, RefreshControl, ScrollView, Text, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Building2, MapPin } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { HeaderNote } from "@/components/header-note";
import { TabSwitcher } from "@/components/tab-switcher";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { DiscoveryButton } from "@/features/discovery/components/discovery-button";
import { DiscoveryEmptyState } from "@/features/discovery/components/discovery-empty-state";
import { DiscoverySearchCard } from "@/features/discovery/components/discovery-search-card";
import { DiscoveryTabs, type DiscoveryTab, type DiscoveryTabItem } from "@/features/discovery/components/discovery-tabs";
import { NearbyPlacesView } from "@/features/discovery/components/nearby-places-view";
import {
  countActivePropertyFilters,
  emptyPropertyFilters,
  PropertyFilterModal,
  type PropertyFilterState,
} from "@/features/discovery/components/property-filter-modal";
import { PropertyListingCard } from "@/features/discovery/components/property-listing-card";
import { PropertyProfile } from "@/features/discovery/components/property-profile";
import { PropertyProfileSkeleton } from "@/features/discovery/components/property-profile-skeleton";
import { useDebouncedValue } from "@/features/discovery/use-debounced-value";
import { useAppSelector } from "@/store/hooks";
import {
  useGetDiscoveryPropertyQuery,
  useListLocationAreasQuery,
  useListLocationCitiesQuery,
  useSearchDiscoveryPropertiesQuery,
  type PropertyDiscoveryCard,
} from "@/store/services/discovery-api";
import { useLazyReverseGeocodeQuery, useSearchLocationsQuery, type GeoSuggestion } from "@/store/services/geo-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { SkeletonList } from "@/components/skeleton";

type SubmittedSearch = {
  text: string;
};

const defaultSearch: SubmittedSearch = {
  text: "",
};

/**
 * A region a search is scoped to.
 *
 * <p>`area` is what gets matched against a listing's locality and what splits
 * exact results from nearby ones. `city` and `state` widen the fallback.
 */
type LocationScope = {
  area: string;
  city: string;
  state: string;
};

const DISCOVERY_HERO = require("../../assets/discovery-hero.png");
const EMPTY_SEARCH_ILLUSTRATION = require("../../assets/discovery-empty-search.png");
const NO_LOCATION_ILLUSTRATION = require("../../assets/workspace/No-Location_512x512.png");

export default function DiscoveryScreen() {
  const { colors, fonts, type } = useTheme();
  const user = useAppSelector((state) => state.auth.user);
  const location = useAppSelector((state) => state.location);
  const isActiveTenant = Boolean(user?.activeTenant);
  const [activeTab, setActiveTab] = useState<DiscoveryTab>(isActiveTenant ? "locations" : "properties");
  const [searchText, setSearchText] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedArea, setSelectedArea] = useState("");

  /**
   * Where a text search is scoped, kept apart from the City and Area pickers.
   *
   * <p>These used to be the same three values, and the two controls wrote into
   * each other: picking a place from the search box reverse-geocoded it and
   * dropped the result into the pickers, so typing "Gachibowli" filled Area with
   * "Ward 106 Serilingampally" — the administrative ward the geocoder returns,
   * which no listing is filed under — and searched THAT while the heading still
   * said Gachibowli. Zero results for a place with listings in it.
   *
   * <p>Two scopes now, and only one is live at a time: using either control
   * clears the other. {@code area} is the label the person actually chose, never
   * a ward name inferred from coordinates. City and state come from the geocoder
   * and are used only to scope the query and label the "elsewhere in…" section,
   * never to fill a picker.
   */
  const [textScope, setTextScope] = useState<LocationScope | null>(null);
  // Whether the active search came from a manual pick (city/area/suggestion or a
  // typed search) rather than the auto-fetched device location. This decides
  // which location source drives the query so both paths behave identically.
  const [manualSelection, setManualSelection] = useState(false);
  const [submittedSearch, setSubmittedSearch] = useState<SubmittedSearch>(defaultSearch);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [detailRefreshing, setDetailRefreshing] = useState(false);

  // The property profile is a state on this tab, not a route, so the device
  // back button knew nothing about it and popped the tab instead — landing on
  // home with the profile silently discarded. Close the profile first; only
  // let the press through when the list is what is showing.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (selectedPropertyId) {
          setSelectedPropertyId(null);
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [selectedPropertyId]),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<PropertyFilterState>(emptyPropertyFilters);
  const [appliedFilters, setAppliedFilters] = useState<PropertyFilterState>(emptyPropertyFilters);
  const [page, setPage] = useState(0);
  const debouncedSearchText = useDebouncedValue(searchText, 300);

  const tabs = useMemo<DiscoveryTabItem[]>(
    () =>
      isActiveTenant
        ? [
            { icon: MapPin, label: "Nearby Locations", value: "locations" },
            { icon: Building2, label: "Properties", value: "properties" },
          ]
        : [
            { icon: Building2, label: "Properties", value: "properties" },
            { icon: MapPin, label: "Nearby Locations", value: "locations" },
          ],
    [isActiveTenant],
  );

  useEffect(() => {
    setActiveTab(isActiveTenant ? "locations" : "properties");
  }, [isActiveTenant]);

  // Prefill the search with the device-location hint ONCE, when it first becomes
  // available. Guarding with a ref means clearing the search (which empties both
  // searchText and submittedSearch) doesn't instantly re-fill the box — the X
  // stays cleared.
  const didAutofillHintRef = useRef(false);
  useEffect(() => {
    if (!didAutofillHintRef.current && location.status === "ready" && location.searchHint && !searchText && !submittedSearch.text) {
      didAutofillHintRef.current = true;
      setSearchText(location.searchHint);
      setSubmittedSearch({
        text: location.searchHint,
      });
    }
  }, [location, searchText, submittedSearch.text]);

  /**
   * The one scope a manual search runs against.
   *
   * <p>The pickers win when they hold anything, but they can only hold something
   * if they were the last control used — every entry point clears the other
   * scope. Reading both and merging them is what produced searches nobody asked
   * for, with an area from one control and a city from the other.
   */
  const pickerScope: LocationScope | null =
    selectedCity || selectedArea ? { area: selectedArea, city: selectedCity, state: selectedState } : null;
  const manualScope = pickerScope ?? textScope;

  // The area (locality) the active search is scoped to. For manual searches it
  // is whichever scope is live; for auto searches it is the geocoded locality.
  // Used both for the query and to split exact vs nearby results.
  const searchedArea = (
    manualSelection ? manualScope?.area ?? "" : location.locality ?? location.searchHint ?? ""
  ).trim();
  // The state the search is scoped to — drives the "nearby" (same-state)
  // fallback. Manual searches use the live scope's state; auto searches use the
  // geocoded region. Always known for both paths so the fallback is identical.
  const searchedState = (manualSelection ? manualScope?.state ?? "" : location.state ?? "").trim();
  const searchedCity = (manualSelection ? manualScope?.city ?? "" : location.city ?? "").trim();

  const propertyQueryArgs = useMemo(
    () => ({
      state: searchedState,
      city: searchedCity,
      // Only auto searches carry a country code; a foreign code tells the
      // backend the device is outside India so no Indian listings are shown.
      countryCode: manualSelection ? null : location.countryCode,
      locality: searchedArea,
      page,
      // Always the user's actual current location, so "X km away" is accurate
      // no matter which region they browse. Manual city/area/place selection only
      // scopes which results appear — it never moves the distance reference point.
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      radiusKm: null,
      pgFor: appliedFilters.pgFor,
      minRentPaise: appliedFilters.minRentPaise,
      maxRentPaise: appliedFilters.maxRentPaise,
      preferredFor: appliedFilters.preferredFor,
      foodIncluded: appliedFilters.mealTypes.length > 0 ? true : null,
      mealTypes: appliedFilters.mealTypes,
      electricityIncluded: appliedFilters.electricityIncluded,
      bathroomType: appliedFilters.bathroomType,
      sharingTypes: appliedFilters.sharingTypes,
      size: 50,
    }),
    [appliedFilters, location.countryCode, location.latitude, location.longitude, manualSelection, page, searchedArea, searchedCity, searchedState],
  );

  const citiesQuery = useListLocationCitiesQuery();
  const areasQuery = useListLocationAreasQuery(selectedCity, { skip: !selectedCity });
  // Live geocoder autocomplete — any place, not just the catalog. Biased toward
  // the device location when it is known so nearby matches rank first.
  const suggestionsQuery = useSearchLocationsQuery(
    {
      q: debouncedSearchText.trim(),
      nearLat: location.latitude ?? undefined,
      nearLng: location.longitude ?? undefined,
    },
    { skip: debouncedSearchText.trim().length < 2 },
  );
  const [reverseGeocode] = useLazyReverseGeocodeQuery();
  // Nothing is searched until the user picks/types a location or the device
  // location auto-fills once on load. A cleared search box has no active search,
  // so we skip the query and show a prompt rather than an unscoped listing.
  const hasActiveSearch = manualSelection || submittedSearch.text.trim().length > 0;
  const propertiesQuery = useSearchDiscoveryPropertiesQuery(propertyQueryArgs, {
    skip: activeTab !== "properties" || !hasActiveSearch,
  });
  const detailQuery = useGetDiscoveryPropertyQuery(
    {
      propertyId: selectedPropertyId ?? "",
    },
    { skip: !selectedPropertyId },
  );
  function handleSearch() {
    setSelectedPropertyId(null);
    setPage(0);

    const typed = searchText.trim();
    const autoHint = (location.searchHint ?? "").trim();
    const hasManualPick = Boolean(selectedCity || selectedArea);
    // Only a real pick or typed text that differs from the auto-filled hint
    // counts as a manual search. Otherwise we search the device location so the
    // same-city "nearby" fallback still applies when the area has no matches.
    const isManual = hasManualPick || (typed.length > 0 && typed !== autoHint);

    if (isManual) {
      setManualSelection(true);
      if (hasManualPick) {
        setSubmittedSearch({ text: selectedArea || selectedCity });
      } else if (typed) {
        // Typed and submitted without choosing a suggestion. The text IS the
        // scope — matched as a locality, with no city or state to widen to,
        // because nothing has told us which region this belongs to.
        setSelectedState("");
        setTextScope({ area: typed, city: "", state: "" });
        setSubmittedSearch({ text: typed });
      }
    } else {
      // Search (or re-search) the auto-fetched device location.
      setManualSelection(false);
      setSelectedState("");
      setSelectedCity("");
      setSelectedArea("");
      setTextScope(null);
      setSearchText(autoHint);
      setSubmittedSearch({ text: autoHint });
    }
  }

  // Clearing the search box clears the whole location scope in one action — text
  // and picked city/area/state — so the pills don't linger after the address is
  // emptied. Falls back to the auto device-location search.
  function clearSearch() {
    setManualSelection(false);
    setSearchText("");
    setSelectedState("");
    setSelectedCity("");
    setSelectedArea("");
    setTextScope(null);
    setSubmittedSearch(defaultSearch);
    setSelectedPropertyId(null);
    setPage(0);
  }

  function applyPropertyFilters(filters: PropertyFilterState) {
    setAppliedFilters(filters);
    setDraftFilters(filters);
    setFiltersOpen(false);
    setPage(0);
  }

  function resetPropertyFilters() {
    setDraftFilters(emptyPropertyFilters);
    setAppliedFilters(emptyPropertyFilters);
    setPage(0);
  }

  async function selectSuggestion(suggestion: GeoSuggestion) {
    const label = suggestion.name ?? suggestion.address ?? "";
    setManualSelection(true);
    setSearchText(label);
    setSelectedPropertyId(null);
    setPage(0);
    setSubmittedSearch({ text: label });

    // The pickers are the other scope, and only one may be live. Cleared here
    // rather than merged, so a city left over from an earlier pick cannot
    // silently narrow a search the person made by typing.
    clearPickers();

    if (suggestion.latitude == null || suggestion.longitude == null) {
      // No coordinates — plain text search of the label.
      setTextScope({ area: label, city: "", state: "" });
      return;
    }

    // Resolve the picked place's city and state so the same-region fallback has
    // something to widen to. The distance reference stays the device location,
    // so the picked coordinates are only used here to look up the region.
    try {
      const address = await reverseGeocode({ lat: suggestion.latitude, lng: suggestion.longitude }, true).unwrap();
      // The LABEL is the area, not `address.locality`. The geocoder answers with
      // the administrative unit containing the point — "Ward 106 Serilingampally"
      // for Gachibowli — and no owner files a listing under a ward number, so
      // matching on it returned nothing for places that plainly have listings.
      setTextScope({ area: label, city: address.city ?? "", state: address.state ?? "" });
    } catch {
      // Reverse lookup failed — the label alone still matches as a locality,
      // just with no region to fall back to.
      setTextScope({ area: label, city: "", state: "" });
    }
  }

  /** Empties the City and Area pickers, so the text scope is the only live one. */
  function clearPickers() {
    setSelectedState("");
    setSelectedCity("");
    setSelectedArea("");
  }

  const propertyPage = propertiesQuery.data;
  const properties = propertyPage?.items ?? [];
  // Split the single result list into "exact" (matches the searched area) and
  // "nearby" (same state, different area). The backend already scopes the list
  // to the state and gates out foreign locations, so this is purely labelling.
  const { exactProperties, nearbyProperties } = useMemo(
    () => splitPropertiesByArea(properties, searchedArea),
    [properties, searchedArea],
  );
  const areaLabel = submittedSearch.text.trim();
  // The live scope's state, not the picker's — on a text search the picker is
  // empty and this would have read "elsewhere in " with nothing after it.
  const nearbyCityLabel = searchedCity || searchedState || (location.state ?? "").trim();
  const activeFilterCount = countActivePropertyFilters(appliedFilters);
  const noPropertiesFound = Boolean(
    hasActiveSearch &&
      propertyPage &&
      !propertiesQuery.isFetching &&
      !propertiesQuery.isError &&
      exactProperties.length === 0 &&
      nearbyProperties.length === 0,
  );
  const cities = citiesQuery.data ?? [];
  const areas = areasQuery.data ?? [];
  // The geocoder can return the same place more than once; dedupe so it renders
  // once and React never sees colliding keys.
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const unique: GeoSuggestion[] = [];
    for (const item of suggestionsQuery.data ?? []) {
      const key = item.providerPlaceId ?? `${item.name}|${item.address}|${item.latitude}|${item.longitude}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }, [suggestionsQuery.data]);

  async function refreshDetail() {
    setDetailRefreshing(true);
    try {
      await detailQuery.refetch().unwrap();
    } catch {
      // The error state on screen already says the load failed; a refresh that
      // fails the same way has nothing to add.
    } finally {
      setDetailRefreshing(false);
    }
  }
  if (selectedPropertyId) {
    // formSurface, the lighter ground this screen had before the app-wide
    // shade. A profile is mostly one large photograph and a stack of white
    // cards; the deeper grey put a heavy band either side of the image and made
    // the page compete with the picture it exists to show.
    return (
      <View style={{ backgroundColor: colors.surfaceRaised, flex: 1 }}>
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
          {/* A plain ScrollView, so it has to bring its own RefreshControl —
              ScreenScrollView supplies one everywhere else, which is why the
              gesture worked on every screen except this one. Its own state
              rather than the query's isFetching: that is also true while the
              detail loads on first open, and the spinner would appear over a
              screen nobody pulled. */}
          <ScrollView
            // spacing.sm to match the app's header gap. A plain ScrollView does
            // not inherit ScreenScrollView's preset, so this branch kept the
            // old lg while every other screen moved — and it is the branch that
            // lost its back button, which is what the lg used to sit under.
            contentContainerStyle={{ gap: spacing.lg, paddingBottom: 96, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                colors={[colors.primary]}
                onRefresh={() => void refreshDetail()}
                progressBackgroundColor={colors.surface}
                refreshing={detailRefreshing}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {/* isLoading, not isFetching: isFetching is also true during a pull
                refresh, so the skeleton replaced the profile someone was looking
                at and the refresh read as the screen reloading from scratch.
                isLoading is only the first fetch, when there is nothing to keep
                on screen anyway. */}
            {detailQuery.isLoading ? <PropertyProfileSkeleton /> : null}

            {detailQuery.data ? (
              <PropertyProfile property={detailQuery.data} />
            ) : null}

            {detailQuery.isError ? (
              <DiscoveryEmptyState
                title="Could not load property"
                description="The property profile could not be loaded. Go back and try again."
              />
            ) : null}

            {!detailQuery.isLoading && !detailQuery.data && !detailQuery.isError ? (
              <DiscoveryButton label="Back to listings" muted onPress={() => setSelectedPropertyId(null)} />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <DiscoveryHeader />

      <TabSwitcher active={activeTab} onChange={setActiveTab} options={tabs} />

      {activeTab === "properties" ? (
        <>
          <DiscoverySearchCard
            areaOptions={areas}
            cityOptions={cities}
            loadingSuggestions={suggestionsQuery.isFetching}
            activeFilterCount={activeFilterCount}
            // A picker still writes its choice into the search box — that
            // direction reads as the box showing where you are searching. Only
            // the reverse was wrong. Each one drops the text scope so the two
            // never both hold a region.
            onAreaSelect={(area) => {
              setManualSelection(true);
              setTextScope(null);
              setSelectedArea(area?.area ?? "");
              setSelectedCity(area?.city ?? selectedCity);
              setSelectedState(area?.state ?? selectedState);
              setSearchText(area ? `${area.area}, ${area.city}` : selectedCity);
              setPage(0);
              setSubmittedSearch({
                text: area?.area ?? selectedCity,
              });
            }}
            onCitySelect={(city) => {
              setManualSelection(true);
              setTextScope(null);
              setSelectedCity(city?.city ?? "");
              setSelectedState(city?.state ?? "");
              setSelectedArea("");
              setSearchText(city?.city ?? "");
              setPage(0);
              setSubmittedSearch({
                text: city?.city ?? "",
              });
            }}
            onOpenFilters={() => {
              setDraftFilters(appliedFilters);
              setFiltersOpen(true);
            }}
            onClearSearch={clearSearch}
            onSearch={handleSearch}
            // Editing the box by hand hands the scope back to the text path.
            // A picker writes its choice in here, so without this, typing over
            // "Hyderabad" and pressing Search still searched Hyderabad — the
            // picker short-circuits the typed text, and the edit did nothing.
            // Only fires on real typing, never when a picker sets the value.
            onSearchTextChange={(text) => {
              setSearchText(text);
              clearPickers();
            }}
            onSuggestionSelect={selectSuggestion}
            searchText={searchText}
            selectedArea={selectedArea}
            selectedCity={selectedCity}
            suggestions={suggestions}
          />

          <PropertyFilterModal
            filters={draftFilters}
            onApply={applyPropertyFilters}
            onClose={() => setFiltersOpen(false)}
            onReset={resetPropertyFilters}
            onUpdate={setDraftFilters}
            visible={filtersOpen}
          />

          {hasActiveSearch ? (
            <>
          <Card>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text
                  style={{
                    color: colors.ink,
                    fontFamily: fonts.display,
                    fontSize: 20,
                    letterSpacing: -0.3,
                  }}
                >
                  Property listings
                </Text>
                {!noPropertiesFound ? (
                  <Text style={[type.body, { color: colors.muted, fontSize: 13 }]}>
                    {propertyPage
                      ? `${exactProperties.length} listing${exactProperties.length === 1 ? "" : "s"} found${areaLabel ? ` for "${areaLabel}"` : ""}`
                      : "Loading property listings"}
                  </Text>
                ) : null}
              </View>
            </View>

            {noPropertiesFound ? (
              <View
                style={{
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingBottom: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingTop: spacing.sm,
                }}
              >
                <Image
                  accessibilityIgnoresInvertColors
                  resizeMode="contain"
                  source={EMPTY_SEARCH_ILLUSTRATION}
                  style={{ height: 144, width: 144 }}
                />
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
                <Text style={[type.body, { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }]}>
                  {areaLabel ? `No listings found for "${areaLabel}".` : "No listings were found for this location."}
                </Text>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={clearSearch}
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
                  <MapPin color={colors.primary} size={19} strokeWidth={2.3} />
                  <Text style={{ color: colors.primary, fontFamily: fonts.displaySoft, fontSize: 15 }}>
                    Try a different location
                  </Text>
                </AnimatedPressable>
              </View>
            ) : null}
          </Card>

          {propertiesQuery.isError ? (
            <DiscoveryEmptyState
              title="Could not load properties"
              description="Check the backend connection and try searching again."
            />
          ) : null}


          {/* Listing-shaped, not a spinner in the heading row. A search that
              takes a moment reserved no height at all, so the results shoved
              the page down the instant they arrived. isLoading, not isFetching:
              a re-search keeps the listings already on screen. */}
          {propertiesQuery.isLoading ? <SkeletonList rows={3} /> : null}

          {exactProperties.map((property) => (
            <PropertyListingCard
              filters={appliedFilters}
              key={property.propertyId}
              onView={() => setSelectedPropertyId(property.propertyId)}
              property={property}
            />
          ))}

          {/* Same-city listings outside the searched area, shown under a light
              inline label rather than a heavy section header. */}
          {nearbyProperties.length > 0 ? (
            <>
              <Text style={[type.caption, { color: colors.muted, fontWeight: "700", marginTop: spacing.xs }]}>
                {nearbyProperties.length} listing{nearbyProperties.length === 1 ? "" : "s"}
                {nearbyCityLabel ? ` elsewhere in ${nearbyCityLabel}` : " nearby"}
              </Text>
              {nearbyProperties.map((property) => (
                <PropertyListingCard
                  filters={appliedFilters}
                  key={property.propertyId}
                  onView={() => setSelectedPropertyId(property.propertyId)}
                  property={property}
                />
              ))}
            </>
          ) : null}
            </>
          ) : (
            <Card>
              <EmptySearchPrompt />
            </Card>
          )}
        </>
      ) : (
        <>
          {isActiveTenant ? (
            <NearbyPlacesView mode="tenant" />
          ) : (
            /* An owner standing on this tab never reaches NearbyPlacesView —
               the places list belongs to the property somebody is STAYING in —
               so this is the only empty state they ever see here. The same card
               and bobbing illustration the property tab shows before a search:
               both are "there is nothing to look at yet", not "your search
               found nothing", and that is the treatment for it. */
            <Card>
              <EmptySearchPrompt
                artwork={NO_LOCATION_ILLUSTRATION}
                description="Important locations appear here after you become an active tenant of a property."
                title="No nearby locations yet"
              />
            </Card>
          )}
        </>
      )}

    </ScreenScrollView>
  );
}

// Partitions the backend result list into properties that match the searched
// area ("exact") and the same-state remainder ("nearby"). Mirrors the backend's
// token-AND locality match so the two sections line up with the server split.
function splitPropertiesByArea(properties: PropertyDiscoveryCard[], area: string) {
  const tokens = area.toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (tokens.length === 0) {
    return { exactProperties: properties, nearbyProperties: [] as PropertyDiscoveryCard[] };
  }

  const exactProperties: PropertyDiscoveryCard[] = [];
  const nearbyProperties: PropertyDiscoveryCard[] = [];
  for (const property of properties) {
    if (matchesAreaTokens(property, tokens)) {
      exactProperties.push(property);
    } else {
      nearbyProperties.push(property);
    }
  }

  return { exactProperties, nearbyProperties };
}

function matchesAreaTokens(property: PropertyDiscoveryCard, tokens: string[]) {
  // Location fields match fuzzily (mirrors the backend's typo tolerance so the
  // exact/nearby sections split the same way); prose and pincode stay exact.
  const fuzzyHaystacks = [property.area, property.city, property.state]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  const exactHaystacks = [property.address, property.pincode, property.headline, property.description]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return tokens.every(
    (token) =>
      fuzzyHaystacks.some((value) => fuzzyFieldMatch(value, token)) ||
      exactHaystacks.some((value) => value.includes(token)),
  );
}

// True when the field contains the token, or any single word of the field is
// within a small edit distance of it — thresholds identical to the backend.
function fuzzyFieldMatch(normalizedField: string, token: string) {
  if (normalizedField.includes(token)) {
    return true;
  }
  const allowed = token.length >= 6 ? 2 : token.length >= 4 ? 1 : 0;
  if (allowed === 0) {
    return false;
  }
  return normalizedField.split(/[,\s]+/).some((word) => word.length > 0 && editDistanceAtMost(word, token, allowed));
}

function editDistanceAtMost(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) {
    return false;
  }
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) {
      return false;
    }
    previous = current;
  }
  return previous[b.length] <= max;
}


// Shown on the properties tab when nothing is searched (initial no-location
// state, or after the search box is cleared). A magnifying glass sits inside a
// soft badge with a looping "sonar ping" ring, over a large centred prompt.
function DiscoveryHeader() {
  const { colors, type } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 390;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.62}
        numberOfLines={1}
        style={[type.brand, { color: colors.ink, fontSize: 30, lineHeight: 36, transform: [{ translateY: 9 }] }]}
      >
        Find
        <Text style={[type.brandItalic, { color: colors.accent, fontSize: 30, lineHeight: 36 }]}>
          {" "}nearby.
        </Text>
      </Text>

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <HeaderNote>Properties and local services around your selected location.</HeaderNote>
        </View>
        <View style={{ height: compact ? 76 : 94, width: compact ? 112 : 148 }}>
          <Image
            accessibilityIgnoresInvertColors
            accessible={false}
            resizeMode="contain"
            source={DISCOVERY_HERO}
            style={{ height: "100%", width: "100%" }}
          />
        </View>
      </View>
    </View>
  );
}
function EmptySearchPrompt({
  artwork = EMPTY_SEARCH_ILLUSTRATION,
  description = "Enter a city, area or place above to find properties nearby.",
  title = "Search a place to see listings",
}: {
  /** Defaults to the search illustration; the nearby tab passes its own. */
  artwork?: ImageSourcePropType;
  description?: string;
  title?: string;
}) {
  const { colors, fonts, type } = useTheme();
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    bobLoop.start();
    return () => {
      bobLoop.stop();
    };
  }, [bob]);

  const iconTranslateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

  return (
    <View style={{ alignItems: "center", gap: spacing.lg, justifyContent: "center", paddingVertical: spacing.xxl }}>
      <Animated.Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={artwork}
        style={{ height: 138, transform: [{ translateY: iconTranslateY }], width: 138 }}
      />
      <View style={{ alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.lg }}>
        <Text
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 23,
            letterSpacing: -0.3,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
        <Text style={[type.body, { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}
