import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Compass } from "lucide-react-native";

import { Card } from "@/components/card";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
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
  useSuggestLocationsQuery,
  type LocationSuggestion,
  type PropertyDiscoveryCard,
} from "@/store/services/discovery-api";
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

  useEffect(() => {
    if (location.status === "ready" && location.searchHint && !searchText && !submittedSearch.text) {
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
    [appliedFilters, location.countryCode, manualSelection, page, searchedArea, searchedCity, searchedState],
  );

  const citiesQuery = useListLocationCitiesQuery();
  const areasQuery = useListLocationAreasQuery(selectedCity, { skip: !selectedCity });
  const suggestionsQuery = useSuggestLocationsQuery(debouncedSearchText, {
    skip: debouncedSearchText.trim().length < 2,
  });
  const propertiesQuery = useSearchDiscoveryPropertiesQuery(propertyQueryArgs, { skip: activeTab !== "properties" });
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
        setSelectedState("");
      }
    } else {
      // Search (or re-search) the auto-fetched device location.
      setManualSelection(false);
      setSelectedState("");
      setSelectedCity("");
      setSelectedArea("");
      setSearchText(autoHint);
      setSubmittedSearch({ text: autoHint });
    }
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

  function selectSuggestion(suggestion: LocationSuggestion) {
    setManualSelection(true);
    setSearchText(suggestion.label);
    setSelectedState(suggestion.state);
    setSelectedCity(suggestion.city);
    setSelectedArea(suggestion.area ?? "");
    setSelectedPropertyId(null);
    setPage(0);
    setSubmittedSearch({
      text: suggestion.area ?? suggestion.city,
    });
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
  const suggestions = suggestionsQuery.data ?? [];
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
              <Card>
                <ActivityIndicator color={colors.primary} />
                <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
                  Loading property profile
                </Text>
              </Card>
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
            <Card>
              <ActivityIndicator color={colors.primary} />
            </Card>
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
  const haystacks = [
    property.area,
    property.address,
    property.city,
    property.state,
    property.pincode,
    property.headline,
    property.description,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return tokens.every((token) => haystacks.some((value) => value.includes(token)));
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

