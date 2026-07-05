import { api } from "@/store/api";
import type { BathroomType, MealType, PgFor, PreferredTenantType, RoomType } from "@/store/services/property-api";

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
  area: string;
  city: string;
  state: string | null;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  directionsUrl: string | null;
  type: string;
  pgFor: PgFor;
  preferredFor: PreferredTenantType;
  foodIncluded: boolean;
  includedMeals: MealType[];
  electricityIncluded: boolean;
  bathroomType: BathroomType;
  availableSharingTypes: RoomType[];
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
  pgFor?: PgFor | null;
  minRentPaise?: number | null;
  maxRentPaise?: number | null;
  preferredFor?: PreferredTenantType | null;
  foodIncluded?: boolean | null;
  mealTypes?: MealType[];
  electricityIncluded?: boolean | null;
  bathroomType?: BathroomType | null;
  sharingTypes?: RoomType[];
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

// Create/update body for admin-curated nearby places. PATCH is a full replace
// on the backend, so edits must carry existing values for fields the form
// doesn't surface (directionsUrl, photoUrl) or they get wiped.
export type LocalPlacePayload = {
  name: string;
  tags: string[];
  description?: string | null;
  phone?: string | null;
  addressText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  directionsUrl?: string | null;
  photoUrl?: string | null;
  ownerRecommended: boolean;
};

function cleanParams(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

export type OwnerDiscoveryProfile = {
  id: string;
  propertyId: string;
  headline: string | null;
  description: string | null;
  profileImageUrl: string | null;
  publicVisible: boolean;
  showOwnerContact: boolean;
  showManagerContact: boolean;
  publishedAt: string | null;
  active: boolean;
};

// PATCH is a full replace for headline/description/profileImageUrl on the
// backend — edits must carry the stored profileImageUrl or it gets wiped.
// The contact flags are null-safe (only applied when present).
export type UpdateOwnerDiscoveryProfilePayload = {
  headline: string;
  description: string;
  profileImageUrl?: string | null;
  showOwnerContact?: boolean | null;
  showManagerContact?: boolean | null;
};

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
          pgFor: params.pgFor,
          minRentPaise: params.minRentPaise,
          maxRentPaise: params.maxRentPaise,
          preferredFor: params.preferredFor,
          foodIncluded: params.foodIncluded,
          mealTypes: params.mealTypes?.join(","),
          electricityIncluded: params.electricityIncluded,
          bathroomType: params.bathroomType,
          sharingTypes: params.sharingTypes?.join(","),
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
    getOwnerDiscoveryProfile: builder.query<OwnerDiscoveryProfile, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/discovery-profile`,
      providesTags: ["Discovery"],
    }),
    publishOwnerDiscoveryProfile: builder.mutation<OwnerDiscoveryProfile, string>({
      query: (propertyId) => ({
        method: "POST",
        url: `/api/v1/properties/${propertyId}/discovery-profile/publish`,
      }),
      invalidatesTags: ["Discovery"],
    }),
    unpublishOwnerDiscoveryProfile: builder.mutation<OwnerDiscoveryProfile, string>({
      query: (propertyId) => ({
        method: "POST",
        url: `/api/v1/properties/${propertyId}/discovery-profile/unpublish`,
      }),
      invalidatesTags: ["Discovery"],
    }),
    updateOwnerDiscoveryProfile: builder.mutation<
      OwnerDiscoveryProfile,
      { propertyId: string; payload: UpdateOwnerDiscoveryProfilePayload }
    >({
      query: ({ propertyId, payload }) => ({
        body: payload,
        method: "PATCH",
        url: `/api/v1/properties/${propertyId}/discovery-profile`,
      }),
      invalidatesTags: ["Discovery"],
    }),

    // Admin-side nearby places (owner/manager curation for one property).
    listManagedLocalPlaces: builder.query<PropertyLocalPlace[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/local-places`,
      providesTags: ["Discovery"],
    }),
    createLocalPlace: builder.mutation<PropertyLocalPlace, { propertyId: string; payload: LocalPlacePayload }>({
      query: ({ propertyId, payload }) => ({
        body: payload,
        method: "POST",
        url: `/api/v1/properties/${propertyId}/local-places`,
      }),
      invalidatesTags: ["Discovery"],
    }),
    updateLocalPlace: builder.mutation<PropertyLocalPlace, { propertyId: string; placeId: string; payload: LocalPlacePayload }>({
      query: ({ propertyId, placeId, payload }) => ({
        body: payload,
        method: "PATCH",
        url: `/api/v1/properties/${propertyId}/local-places/${placeId}`,
      }),
      invalidatesTags: ["Discovery"],
    }),
    deleteLocalPlace: builder.mutation<void, { propertyId: string; placeId: string }>({
      query: ({ propertyId, placeId }) => ({
        method: "DELETE",
        url: `/api/v1/properties/${propertyId}/local-places/${placeId}`,
      }),
      invalidatesTags: ["Discovery"],
    }),
  }),
});

export const {
  useCreateLocalPlaceMutation,
  useDeleteLocalPlaceMutation,
  useGetDiscoveryPropertyQuery,
  useGetOwnerDiscoveryProfileQuery,
  useListLocationAreasQuery,
  useListLocationCitiesQuery,
  useListLocalPlaceTagsQuery,
  useListManagedLocalPlacesQuery,
  useListMyLocalPlacesQuery,
  usePublishOwnerDiscoveryProfileMutation,
  useSearchDiscoveryPropertiesQuery,
  useSuggestLocationsQuery,
  useUnpublishOwnerDiscoveryProfileMutation,
  useUpdateLocalPlaceMutation,
  useUpdateOwnerDiscoveryProfileMutation,
} = discoveryApi;
