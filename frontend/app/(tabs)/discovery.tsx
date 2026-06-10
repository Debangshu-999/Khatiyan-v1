import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Text, View } from "react-native";
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
} from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type SubmittedSearch = {
  text: string;
  latitude: number | null;
  longitude: number | null;
};

const defaultSearch: SubmittedSearch = {
  latitude: null,
  longitude: null,
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
  const [submittedSearch, setSubmittedSearch] = useState<SubmittedSearch>(defaultSearch);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const debouncedServiceSearch = useDebouncedValue(serviceSearch, 300);
  const debouncedSearchText = useDebouncedValue(searchText, 300);
  const snackbarOpacity = useRef(new Animated.Value(0)).current;

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
        latitude: location.latitude,
        longitude: location.longitude,
        text: location.searchHint,
      });
    }
  }, [location, searchText, submittedSearch.text]);

  useEffect(() => {
    if (!snackbarMessage) {
      return;
    }

    snackbarOpacity.setValue(0);
    Animated.timing(snackbarOpacity, {
      duration: 160,
      toValue: 1,
      useNativeDriver: true,
    }).start();

    const timeoutId = setTimeout(() => {
      Animated.timing(snackbarOpacity, {
        duration: 160,
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setSnackbarMessage(null);
        }
      });
    }, 2800);

    return () => clearTimeout(timeoutId);
  }, [snackbarMessage, snackbarOpacity]);

  const propertyQueryArgs = useMemo(
    () => ({
      state: selectedState,
      city: selectedCity,
      countryCode: selectedCity || selectedState ? null : location.countryCode,
      latitude: submittedSearch.latitude,
      locality: selectedArea || submittedSearch.text,
      longitude: submittedSearch.longitude,
      page,
      radiusKm: selectedCity || selectedState ? null : submittedSearch.latitude && submittedSearch.longitude ? 15 : null,
      size: 10,
    }),
    [location.countryCode, page, selectedArea, selectedCity, selectedState, submittedSearch],
  );

  const citiesQuery = useListLocationCitiesQuery();
  const areasQuery = useListLocationAreasQuery(selectedCity, { skip: !selectedCity });
  const suggestionsQuery = useSuggestLocationsQuery(debouncedSearchText, {
    skip: debouncedSearchText.trim().length < 2,
  });
  const propertiesQuery = useSearchDiscoveryPropertiesQuery(propertyQueryArgs, { skip: activeTab !== "properties" });
  const detailQuery = useGetDiscoveryPropertyQuery(
    {
      latitude: submittedSearch.latitude,
      longitude: submittedSearch.longitude,
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
    const selectedCityOption = cities.find((city) => city.city === selectedCity);
    const selectedAreaOption = areas.find((area) => area.area === selectedArea);
    const effectiveText = selectedArea || selectedCity || searchText.trim();
    const effectiveLatitude = selectedAreaOption?.latitude ?? selectedCityOption?.latitude ?? location.latitude;
    const effectiveLongitude = selectedAreaOption?.longitude ?? selectedCityOption?.longitude ?? location.longitude;

    setSelectedPropertyId(null);
    setPage(0);
    setSubmittedSearch({
      latitude: effectiveLatitude,
      longitude: effectiveLongitude,
      text: effectiveText,
    });
    if (!selectedCity && !selectedArea && searchText.trim()) {
      setSelectedState("");
    }
  }

  function clearFilters() {
    setSearchText("");
    setSelectedState("");
    setSelectedCity("");
    setSelectedArea("");
    setSelectedPropertyId(null);
    setPage(0);
    setSubmittedSearch(defaultSearch);
  }

  function selectSuggestion(suggestion: LocationSuggestion) {
    setSearchText(suggestion.label);
    setSelectedState(suggestion.state);
    setSelectedCity(suggestion.city);
    setSelectedArea(suggestion.area ?? "");
    setSelectedPropertyId(null);
    setPage(0);
    setSubmittedSearch({
      latitude: suggestion.latitude ?? location.latitude,
      longitude: suggestion.longitude ?? location.longitude,
      text: suggestion.area ?? suggestion.city,
    });
  }

  const propertyPage = propertiesQuery.data;
  const properties = propertyPage?.items ?? [];
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
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
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
      </ScreenScrollView>
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
            onAreaSelect={(area) => {
              setSelectedArea(area?.area ?? "");
              setSelectedCity(area?.city ?? selectedCity);
              setSelectedState(area?.state ?? selectedState);
              setSearchText(area ? `${area.area}, ${area.city}` : selectedCity);
              setPage(0);
              setSubmittedSearch({
                latitude: area?.latitude ?? location.latitude,
                longitude: area?.longitude ?? location.longitude,
                text: area?.area ?? selectedCity,
              });
            }}
            onCitySelect={(city) => {
              setSelectedCity(city?.city ?? "");
              setSelectedState(city?.state ?? "");
              setSelectedArea("");
              setSearchText(city?.city ?? "");
              setPage(0);
              setSubmittedSearch({
                latitude: city?.latitude ?? location.latitude,
                longitude: city?.longitude ?? location.longitude,
                text: city?.city ?? "",
              });
            }}
            onClearFilters={clearFilters}
            onSearch={handleSearch}
            onSearchTextChange={setSearchText}
            onSuggestionSelect={selectSuggestion}
            searchText={searchText}
            selectedArea={selectedArea}
            selectedCity={selectedCity}
            suggestions={suggestions}
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
                    ? `${propertyPage.totalElements} listing${propertyPage.totalElements === 1 ? "" : "s"} found${submittedSearch.text ? ` for "${submittedSearch.text}"` : ""}`
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

          {!propertiesQuery.isFetching && !propertiesQuery.isError && properties.length === 0 ? (
            <DiscoveryEmptyState
              title="No properties found"
              description="Try a different area or use current location. Listed properties appear here after owners publish discovery profiles."
            />
          ) : null}

          {properties.map((property) => (
            <PropertyListingCard
              key={property.propertyId}
              onView={() => setSelectedPropertyId(property.propertyId)}
              property={property}
            />
          ))}

          {propertyPage && (propertyPage.hasPrevious || propertyPage.hasNext) ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <DiscoveryButton
                disabled={!propertyPage.hasPrevious}
                label="Previous"
                muted
                onPress={() => setPage((currentPage) => Math.max(currentPage - 1, 0))}
                style={{ flex: 1 }}
              />
              <DiscoveryButton
                disabled={!propertyPage.hasNext}
                label="Next"
                onPress={() => setPage((currentPage) => currentPage + 1)}
                style={{ flex: 1 }}
              />
            </View>
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

      {snackbarMessage ? <DiscoverySnackbar message={snackbarMessage} opacity={snackbarOpacity} /> : null}
    </ScreenScrollView>
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

function DiscoverySnackbar({ message, opacity }: { message: string; opacity: Animated.Value }) {
  const { colors } = useTheme();

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{
        alignSelf: "center",
        backgroundColor: colors.ink,
        borderRadius: 999,
        bottom: spacing.lg,
        maxWidth: "92%",
        opacity,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        position: "absolute",
        transform: [
          {
            translateY: opacity.interpolate({
              inputRange: [0, 1],
              outputRange: [8, 0],
            }),
          },
        ],
      }}
    >
      <Text style={{ color: colors.background, fontSize: 13, fontWeight: "800" }} selectable>
        {message}
      </Text>
    </Animated.View>
  );
}
