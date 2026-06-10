import { api } from "@/store/api";

export type PageResponse<T> = {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type PropertyDiscoveryCard = {
  propertyId: string;
  name: string;
  headline: string | null;
  description: string | null;
  address: string;
  city: string;
  state: string | null;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  directionsUrl: string | null;
  type: string;
  facilities: string[];
  customFacilities: string[];
  standardDepositPaise: number;
  startingRoomRentPaise: number | null;
  dailyRentingAvailable: boolean;
  dailyGuestAcRatePaise: number | null;
  dailyGuestNonAcRatePaise: number | null;
  profileImageUrl: string | null;
  imageUrls?: string[] | null;
};

export type PropertyDiscoveryDetail = PropertyDiscoveryCard & {
  ownerId: string;
  ownerName: string | null;
  ownerPhone: string | null;
  showOwnerContact: boolean;
  showManagerContact: boolean;
};

export type PropertyDiscoverySearch = {
  state?: string;
  city?: string;
  countryCode?: string | null;
  locality?: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
  page?: number;
  size?: number;
};

export type LocationSuggestion = {
  label: string;
  city: string;
  state: string;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type LocationCity = {
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
};

export type LocationArea = {
  city: string;
  state: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
};

export type PropertyLocalPlace = {
  id: string;
  propertyId: string;
  name: string;
  tags: string[];
  description: string | null;
  phone: string | null;
  addressText: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  directionsUrl: string | null;
  photoUrl: string | null;
  ownerRecommended: boolean;
};

export type LocalPlaceSearch = {
  latitude?: number | null;
  longitude?: number | null;
};

function cleanParams(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

export const discoveryApi = api.injectEndpoints({
  endpoints: (builder) => ({
    searchDiscoveryProperties: builder.query<PageResponse<PropertyDiscoveryCard>, PropertyDiscoverySearch>({
      query: (params) => ({
        url: "/api/v1/discovery/properties",
        params: cleanParams({
          state: params.state?.trim(),
          city: params.city?.trim(),
          countryCode: params.countryCode?.trim(),
          locality: params.locality?.trim(),
          latitude: params.latitude,
          longitude: params.longitude,
          radiusKm: params.radiusKm,
          page: params.page ?? 0,
          size: params.size ?? 10,
        }),
      }),
      providesTags: ["Discovery"],
    }),
    getDiscoveryProperty: builder.query<PropertyDiscoveryDetail, { propertyId: string; latitude?: number | null; longitude?: number | null }>({
      query: ({ propertyId, latitude, longitude }) => ({
        url: `/api/v1/discovery/properties/${propertyId}`,
        params: cleanParams({ latitude, longitude }),
      }),
      providesTags: ["Discovery"],
    }),
    listMyLocalPlaces: builder.query<PropertyLocalPlace[], LocalPlaceSearch>({
      query: (params) => ({
        url: "/api/v1/discovery/me/local-places",
        params: cleanParams({
          latitude: params.latitude,
          longitude: params.longitude,
        }),
      }),
      providesTags: ["Discovery"],
    }),
    listLocalPlaceTags: builder.query<string[], void>({
      query: () => "/api/v1/discovery/local-place-tags",
      providesTags: ["Discovery"],
    }),
    suggestLocations: builder.query<LocationSuggestion[], string>({
      query: (queryText) => ({
        url: "/api/v1/discovery/locations/suggest",
        params: cleanParams({ q: queryText.trim() }),
      }),
      providesTags: ["Discovery"],
    }),
    listLocationCities: builder.query<LocationCity[], void>({
      query: () => "/api/v1/discovery/locations/cities",
      providesTags: ["Discovery"],
    }),
    listLocationAreas: builder.query<LocationArea[], string>({
      query: (city) => ({
        url: "/api/v1/discovery/locations/areas",
        params: cleanParams({ city }),
      }),
      providesTags: ["Discovery"],
    }),
  }),
});

export const {
  useGetDiscoveryPropertyQuery,
  useListLocationAreasQuery,
  useListLocationCitiesQuery,
  useListLocalPlaceTagsQuery,
  useListMyLocalPlacesQuery,
  useSearchDiscoveryPropertiesQuery,
  useSuggestLocationsQuery,
} = discoveryApi;
