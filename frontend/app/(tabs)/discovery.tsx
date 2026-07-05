import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Compass, Search } from "lucide-react-native";

import { Card } from "@/components/card";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonList, SkeletonScreen } from "@/components/skeleton";
import { DiscoveryButton } from "@/features/discovery/components/discovery-button";
import { DiscoveryEmptyState } from "@/features/discovery/components/discovery-empty-state";
import { DiscoverySearchCard } from "@/features/discovery/components/discovery-search-card";
import { DiscoveryTabs, type DiscoveryTab, type DiscoveryTabItem } from "@/features/discovery/components/discovery-tabs";
import { LocalPlaceCard } from "@/features/discovery/components/local-place-card";
import { LocalPlaceSearchCard } from "@/features/discovery/components/local-place-search-card";
import {
  countActivePropertyFilters,
  emptyPropertyFilters,
  PropertyFilterModal,
  type PropertyFilterState,
} from "@/features/discovery/components/property-filter-modal";
import { PropertyListingCard } from "@/features/discovery/components/property-listing-card";
import { PropertyProfile } from "@/features/discovery/components/property-profile";
import { useDebouncedValue } from "@/features/discovery/use-debounced-value";
import { useAppSelector } from "@/store/hooks";
import {
  useGetDiscoveryPropertyQuery,
  useListLocationAreasQuery,
  useListLocationCitiesQuery,
  useListMyLocalPlacesQuery,
  useSearchDiscoveryPropertiesQuery,
  type PropertyDiscoveryCard,
} from "@/store/services/discovery-api";
import { useLazyReverseGeocodeQuery, useSearchLocationsQuery, type GeoSuggestion } from "@/store/services/geo-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type SubmittedSearch = {
  text: string;
};

const defaultSearch: SubmittedSearch = {
  text: "",
};

export default function DiscoveryScreen() {
  const { colors, fonts, type } = useTheme();
  const user = useAppSelector((state) => state.auth.user);
  const location = useAppSelector((state) => state.location);
  const isActiveTenant = Boolean(user?.activeTenant);
  const [activeTab, setActiveTab] = useState<DiscoveryTab>(isActiveTenant ? "locations" : "properties");
  const [serviceSearch, setServiceSearch] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  // Coordinates of the manually picked location (city/area/suggestion). These
  // drive geo-ranking for manual searches; without them a pick would only be
  // text-matched and ranked by the device's position (or not at all when the
  // device location is unknown). City-granular per the location catalog.
  const [selectedCoords, setSelectedCoords] = useState<{ latitude: number | null; longitude: number | null }>({
    latitude: null,
    longitude: null,
  });
  // Whether the active search came from a manual pick (city/area/suggestion or a
  // typed search) rather than the auto-fetched device location. This decides
  // which location source drives the query so both paths behave identically.
  const [manualSelection, setManualSelection] = useState(false);
  const [submittedSearch, setSubmittedSearch] = useState<SubmittedSearch>(defaultSearch);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<PropertyFilterState>(emptyPropertyFilters);
  const [appliedFilters, setAppliedFilters] = useState<PropertyFilterState>(emptyPropertyFilters);
  const [page, setPage] = useState(0);
  const debouncedServiceSearch = useDebouncedValue(serviceSearch, 300);
  const debouncedSearchText = useDebouncedValue(searchText, 300);

  const tabs = useMemo<DiscoveryTabItem[]>(
    () =>
      isActiveTenant
        ? [
            { label: "Nearby Locations", value: "locations" },
            { label: "Properties", value: "properties" },
          ]
        : [
            { label: "Properties", value: "properties" },
            { label: "Nearby Locations", value: "locations" },
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

  // The area (locality) the active search is scoped to. For manual searches it
  // is the picked area or typed text; for auto searches it is the geocoded
  // locality. Used both for the query and to split exact vs nearby results.
  const searchedArea = (
    manualSelection ? selectedArea || submittedSearch.text : location.locality ?? location.searchHint ?? ""
  ).trim();
  // The state the search is scoped to — drives the "nearby" (same-state)
  // fallback. Manual searches use the picked state; auto searches use the
  // geocoded region. Always known for both paths so the fallback is identical.
  const searchedState = (manualSelection ? selectedState : location.state ?? "").trim();
  const searchedCity = (manualSelection ? selectedCity : location.city ?? "").trim();

  const propertyQueryArgs = useMemo(
    () => ({
      state: searchedState,
      city: searchedCity,
      // Only auto searches carry a country code; a foreign code tells the
      // backend the device is outside India so no Indian listings are shown.
      countryCode: manualSelection ? null : location.countryCode,
      locality: searchedArea,
      page,
      // Coordinates rank results by proximity and light up the distance chips.
      // A manual pick ranks around the searched location; an auto search around
      // the device.
      latitude: manualSelection ? selectedCoords.latitude : location.latitude ?? null,
      longitude: manualSelection ? selectedCoords.longitude : location.longitude ?? null,
      radiusKm: null,
      pgFor: appliedFilters.pgFor,
      minRentPaise: appliedFilters.minRentPaise,
      maxRentPaise: appliedFilters.maxRentPaise,
      preferredFor: appliedFilters.preferredFor,
      foodIncluded: appliedFilters.foodIncluded,
      mealTypes: appliedFilters.mealTypes,
      electricityIncluded: appliedFilters.electricityIncluded,
      bathroomType: appliedFilters.bathroomType,
      sharingTypes: appliedFilters.sharingTypes,
      size: 50,
    }),
    [appliedFilters, location.countryCode, location.latitude, location.longitude, manualSelection, page, searchedArea, searchedCity, searchedState, selectedCoords.latitude, selectedCoords.longitude],
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
  const localPlacesQuery = useListMyLocalPlacesQuery(
    {
      latitude: location.latitude,
      longitude: location.longitude,
    },
    { skip: activeTab !== "locations" || !isActiveTenant },
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
      const effectiveText = selectedArea || selectedCity || typed;
      setSubmittedSearch({ text: effectiveText });
      if (!selectedCity && !selectedArea && typed) {
        // Free-typed text with no picked option — no known coordinates, so the
        // search falls back to pure text matching.
        setSelectedState("");
        setSelectedCoords({ latitude: null, longitude: null });
      }
    } else {
      // Search (or re-search) the auto-fetched device location.
      setManualSelection(false);
      setSelectedState("");
      setSelectedCity("");
      setSelectedArea("");
      setSelectedCoords({ latitude: null, longitude: null });
      setSearchText(autoHint);
      setSubmittedSearch({ text: autoHint });
    }
  }

  // Clearing the search box clears the whole location scope in one action —
  // text, picked city/area/state and coordinates — so the pills don't linger
  // after the address is emptied. Falls back to the auto device-location search.
  function clearSearch() {
    setManualSelection(false);
    setSearchText("");
    setSelectedState("");
    setSelectedCity("");
    setSelectedArea("");
    setSelectedCoords({ latitude: null, longitude: null });
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

    if (suggestion.latitude == null || suggestion.longitude == null) {
      // No coordinates — plain text search of the label.
      setSelectedState("");
      setSelectedCity("");
      setSelectedArea(label);
      setSelectedCoords({ latitude: null, longitude: null });
      return;
    }

    // Coordinates rank by distance immediately; resolve the address details
    // (locality/city/state) so the search is region-scoped — otherwise every
    // listing in the country would rank in, just farther down.
    setSelectedCoords({ latitude: suggestion.latitude, longitude: suggestion.longitude });
    try {
      const address = await reverseGeocode({ lat: suggestion.latitude, lng: suggestion.longitude }, true).unwrap();
      setSelectedState(address.state ?? "");
      setSelectedCity(address.city ?? "");
      setSelectedArea(address.locality ?? "");
    } catch {
      // Reverse lookup failed — fall back to the formatted address text so the
      // backend can still infer the region from it; coordinates still rank.
      setSelectedState("");
      setSelectedCity("");
      setSelectedArea(suggestion.address ?? label);
    }
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
  const nearbyCityLabel = searchedCity || (manualSelection ? selectedState : location.state ?? "").trim();
  const activeFilterCount = countActivePropertyFilters(appliedFilters);
  const localPlaces = localPlacesQuery.data ?? [];
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
  const normalizedServiceSearch = debouncedServiceSearch.trim().toLowerCase();
  const filteredLocalPlaces = useMemo(() => {
    if (!normalizedServiceSearch) {
      return localPlaces;
    }

    return localPlaces.filter((place) =>
      (place.tags ?? []).some((tag) => tag.toLowerCase().includes(normalizedServiceSearch)),
    );
  }, [localPlaces, normalizedServiceSearch]);
  const serviceSearchFiltering = serviceSearch !== debouncedServiceSearch;

  if (selectedPropertyId) {
    return (
      <LinearGradient colors={[colors.primarySoft, colors.background, colors.background]} style={{ flex: 1 }}>
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ gap: spacing.lg, paddingBottom: 96, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {detailQuery.isFetching ? (
              <SkeletonScreen tiles={0} rows={2} />
            ) : null}

            {detailQuery.data ? (
              <PropertyProfile property={detailQuery.data} onBack={() => setSelectedPropertyId(null)} />
            ) : null}

            {detailQuery.isError ? (
              <DiscoveryEmptyState
                title="Could not load property"
                description="The property profile could not be loaded. Go back and try again."
              />
            ) : null}

            {!detailQuery.isFetching && !detailQuery.data ? (
              <DiscoveryButton label="Back to listings" muted onPress={() => setSelectedPropertyId(null)} />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        title="Find"
        italicTail="nearby."
        subtitle="Properties and local services around your selected location."
        trailing={<DiscoveryHeaderIcon />}
      />

      <DiscoveryTabs activeTab={activeTab} tabs={tabs} onChange={setActiveTab} />

      {activeTab === "properties" ? (
        <>
          <DiscoverySearchCard
            areaOptions={areas}
            cityOptions={cities}
            loadingSuggestions={suggestionsQuery.isFetching}
            activeFilterCount={activeFilterCount}
            onAreaSelect={(area) => {
              setManualSelection(true);
              setSelectedArea(area?.area ?? "");
              setSelectedCity(area?.city ?? selectedCity);
              setSelectedState(area?.state ?? selectedState);
              setSelectedCoords({ latitude: area?.latitude ?? null, longitude: area?.longitude ?? null });
              setSearchText(area ? `${area.area}, ${area.city}` : selectedCity);
              setPage(0);
              setSubmittedSearch({
                text: area?.area ?? selectedCity,
              });
            }}
            onCitySelect={(city) => {
              setManualSelection(true);
              setSelectedCity(city?.city ?? "");
              setSelectedState(city?.state ?? "");
              setSelectedArea("");
              setSelectedCoords({ latitude: city?.latitude ?? null, longitude: city?.longitude ?? null });
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
            onSearchTextChange={setSearchText}
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
            <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  Results
                </Text>
                <Text
                  style={{
                    color: colors.ink,
                    fontFamily: fonts.display,
                    fontSize: 20,
                    fontWeight: "500",
                    letterSpacing: -0.3,
                  }}
                  selectable
                >
                  Property listings
                </Text>
                <Text style={[type.body, { color: colors.muted, fontSize: 13 }]} selectable>
                  {propertyPage
                    ? exactProperties.length === 0
                      ? `No listings found${areaLabel ? ` for "${areaLabel}"` : ""}`
                      : `${exactProperties.length} listing${exactProperties.length === 1 ? "" : "s"} found${areaLabel ? ` for "${areaLabel}"` : ""}`
                    : "Loading property listings"}
                </Text>
              </View>
              {propertiesQuery.isFetching ? <ActivityIndicator color={colors.primary} /> : null}
            </View>
          </Card>

          {propertiesQuery.isError ? (
            <DiscoveryEmptyState
              title="Could not load properties"
              description="Check the backend connection and try searching again."
            />
          ) : null}

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
              <Text style={[type.caption, { color: colors.muted, fontWeight: "700", marginTop: spacing.xs }]} selectable>
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
            <EmptySearchPrompt />
          )}
        </>
      ) : (
        <>
          <LocalPlaceSearchCard
            disabled={!isActiveTenant}
            filtering={serviceSearchFiltering}
            onClearSearch={() => setServiceSearch("")}
            onSearchChange={setServiceSearch}
            searchValue={serviceSearch}
          />

          {!isActiveTenant ? (
            <DiscoveryEmptyState
              title="No nearby locations yet"
              description="Important locations appear here after you become an active tenant of a property."
            />
          ) : null}

          {isActiveTenant && localPlacesQuery.isFetching ? (
            <SkeletonList />
          ) : null}

          {isActiveTenant && localPlacesQuery.isError ? (
            <DiscoveryEmptyState
              title="Could not load local places"
              description="Your active tenancy is required for local discovery. Refresh after your profile syncs."
            />
          ) : null}

          {isActiveTenant && !localPlacesQuery.isFetching && !localPlacesQuery.isError && localPlaces.length === 0 ? (
            <DiscoveryEmptyState title="No local places yet" description="No data available." />
          ) : null}

          {isActiveTenant &&
          !localPlacesQuery.isFetching &&
          !localPlacesQuery.isError &&
          localPlaces.length > 0 &&
          filteredLocalPlaces.length === 0 ? (
            <DiscoveryEmptyState title="No services available" description="Try a different search term." />
          ) : null}

          {isActiveTenant ? filteredLocalPlaces.map((place) => <LocalPlaceCard key={place.id} place={place} />) : null}
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
function EmptySearchPrompt() {
  const { colors, fonts, type } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    bobLoop.start();
    return () => {
      pulseLoop.stop();
      bobLoop.stop();
    };
  }, [pulse, bob]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.4, 0] });
  const iconTranslateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

  return (
    <View style={{ alignItems: "center", gap: spacing.lg, justifyContent: "center", paddingVertical: spacing.xxl }}>
      <View style={{ alignItems: "center", height: 150, justifyContent: "center", width: 150 }}>
        <Animated.View
          style={{
            borderColor: colors.primary,
            borderRadius: 999,
            borderWidth: 2,
            height: 128,
            opacity: ringOpacity,
            position: "absolute",
            transform: [{ scale: ringScale }],
            width: 128,
          }}
        />
        <Animated.View
          style={{
            alignItems: "center",
            backgroundColor: colors.primarySoft,
            borderColor: colors.primary,
            borderRadius: 999,
            borderWidth: 1,
            height: 104,
            justifyContent: "center",
            transform: [{ translateY: iconTranslateY }],
            width: 104,
          }}
        >
          <Search color={colors.primary} size={44} strokeWidth={2.4} />
        </Animated.View>
      </View>
      <View style={{ alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.lg }}>
        <Text
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 23,
            fontWeight: "600",
            letterSpacing: -0.3,
            textAlign: "center",
          }}
          selectable
        >
          Search a place to see listings
        </Text>
        <Text style={[type.body, { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }]} selectable>
          Enter a city, area or place above to find properties nearby.
        </Text>
      </View>
    </View>
  );
}

function DiscoveryHeaderIcon() {
  const { colors } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.primarySoft,
        borderColor: colors.primary,
        borderRadius: 14,
        borderWidth: 1,
        height: 46,
        justifyContent: "center",
        width: 46,
      }}
    >
      <Compass color={colors.primary} size={21} strokeWidth={2.3} />
    </View>
  );
}

