import { api } from "@/store/api";
import type { BathroomType, MealType, PgFor, PreferredTenantType, RoomType } from "@/store/services/property-api";
import type { NoticePeriod } from "@/store/services/property-api";

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
  /** Exit terms, shown before anyone commits rather than after move-in. */
  noticePeriod: NoticePeriod;
  rentGraceDays: number;
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
  /** Only present when the owner has verified it; null otherwise. */
  ownerEmail: string | null;
  /**
   * Everyone this listing says to call, owner first.
   *
   * <p>Supersedes the three owner fields above. The owner is absent when the
   * listing hides them, and a manager is present because the owner listed them.
   */
  contacts: PropertyContact[];
  /**
   * The same gallery as `imageUrls`, in the same order, with each photo's
   * caption. The flat list stays for callers with nowhere to show one.
   */
  images: PropertyImage[];
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
  subcategoryIds: string[];
  subcategoryNames: string[];
  description: string | null;
  phone: string | null;
  addressText: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  directionsUrl: string | null;
  photoUrl: string | null;
  ownerRecommended: boolean;
};

// Category -> subcategory taxonomy for nearby places. Curated subcategories are
// global; custom ones belong to a property. Categories carry their subcategories.
export type LocalPlaceSubcategory = {
  id: string;
  categoryId: string;
  name: string;
  custom: boolean;
  displayOrder: number;
};

export type LocalPlaceCategory = {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  subcategories: LocalPlaceSubcategory[];
};

// Smart-search result: direct = places in a matched subcategory; related =
// places in the same category as a match but a different subcategory.
export type NearbyPlacesResult = {
  direct: PropertyLocalPlace[];
  related: PropertyLocalPlace[];
};

export type NearbyPlacesSearchArgs = {
  q?: string;
  latitude?: number | null;
  longitude?: number | null;
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
  subcategoryIds: string[];
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

/** One image in a property's discovery gallery. `cover` is the listing thumbnail. */
export type PropertyImage = {
  id: string;
  url: string;
  publicId: string | null;
  sortOrder: number;
  /** What the photo is of, or null when the owner did not say. */
  caption: string | null;
  cover: boolean;
};

/** An image already uploaded to storage, ready to attach to a property. */
export type NewPropertyImage = {
  url: string;
  publicId: string | null;
};

/**
 * Someone a listing offers as a way to reach the property.
 *
 * <p>The owner is always present and always first, and `owner: true` is how the
 * client knows not to offer a remove control for them.
 */
export type PropertyContact = {
  userId: string;
  name: string | null;
  phone: string | null;
  /** Only when they have verified it; null otherwise. */
  email: string | null;
  owner: boolean;
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
    searchMyLocalPlaces: builder.query<NearbyPlacesResult, NearbyPlacesSearchArgs>({
      query: ({ q, latitude, longitude }) => ({
        url: "/api/v1/discovery/me/local-places/search",
        params: cleanParams({ q: q?.trim(), latitude, longitude }),
      }),
      providesTags: ["Discovery"],
    }),
    listMyLocalPlaceTaxonomy: builder.query<LocalPlaceCategory[], void>({
      query: () => "/api/v1/discovery/me/local-places/taxonomy",
      providesTags: ["Discovery"],
    }),
    searchManagedLocalPlaces: builder.query<NearbyPlacesResult, NearbyPlacesSearchArgs & { propertyId: string }>({
      query: ({ propertyId, q, latitude, longitude }) => ({
        url: `/api/v1/properties/${propertyId}/local-places/search`,
        params: cleanParams({ q: q?.trim(), latitude, longitude }),
      }),
      providesTags: ["Discovery"],
    }),
    listLocalPlaceTaxonomy: builder.query<LocalPlaceCategory[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/local-places/taxonomy`,
      providesTags: ["Discovery"],
    }),
    createLocalPlaceSubcategory: builder.mutation<
      LocalPlaceSubcategory,
      { propertyId: string; categoryId: string; name: string }
    >({
      query: ({ propertyId, categoryId, name }) => ({
        body: { categoryId, name },
        method: "POST",
        url: `/api/v1/properties/${propertyId}/local-places/subcategories`,
      }),
      invalidatesTags: ["Discovery"],
    }),
    createLocalPlaceCategory: builder.mutation<LocalPlaceCategory, { propertyId: string; name: string }>({
      query: ({ propertyId, name }) => ({
        body: { name },
        method: "POST",
        url: `/api/v1/properties/${propertyId}/local-places/categories`,
      }),
      invalidatesTags: ["Discovery"],
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

    // The listing gallery. Every mutation returns the whole ordered list because
    // removing or promoting an image renumbers the rest.
    listPropertyImages: builder.query<PropertyImage[], string>({
      query: (propertyId) => ({ url: `/api/v1/properties/${propertyId}/images` }),
      providesTags: ["Discovery"],
    }),
    addPropertyImages: builder.mutation<PropertyImage[], { propertyId: string; images: NewPropertyImage[] }>({
      query: ({ propertyId, images }) => ({
        body: { images },
        method: "POST",
        url: `/api/v1/properties/${propertyId}/images`,
      }),
      invalidatesTags: ["Discovery"],
    }),
    removePropertyImage: builder.mutation<PropertyImage[], { propertyId: string; imageId: string }>({
      query: ({ propertyId, imageId }) => ({
        method: "DELETE",
        url: `/api/v1/properties/${propertyId}/images/${imageId}`,
      }),
      invalidatesTags: ["Discovery"],
    }),
    listPropertyContacts: builder.query<PropertyContact[], string>({
      query: (propertyId) => ({ url: `/api/v1/properties/${propertyId}/contacts` }),
      providesTags: ["Discovery"],
    }),

    // Every mutation returns the whole list: the owner is not a stored row, so a
    // response carrying one manager would leave the client to reassemble an
    // order it does not own.
    addPropertyContactManager: builder.mutation<PropertyContact[], { managerUserId: string; propertyId: string }>({
      query: ({ managerUserId, propertyId }) => ({
        method: "POST",
        url: `/api/v1/properties/${propertyId}/contacts/managers/${managerUserId}`,
      }),
      invalidatesTags: ["Discovery"],
    }),

    removePropertyContactManager: builder.mutation<PropertyContact[], { managerUserId: string; propertyId: string }>({
      query: ({ managerUserId, propertyId }) => ({
        method: "DELETE",
        url: `/api/v1/properties/${propertyId}/contacts/managers/${managerUserId}`,
      }),
      invalidatesTags: ["Discovery"],
    }),

    updatePropertyImageCaption: builder.mutation<
      PropertyImage[],
      { caption: string | null; imageId: string; propertyId: string }
    >({
      query: ({ caption, imageId, propertyId }) => ({
        body: { caption },
        method: "PATCH",
        url: `/api/v1/properties/${propertyId}/images/${imageId}/caption`,
      }),
      invalidatesTags: ["Discovery"],
    }),

    makePropertyImageCover: builder.mutation<PropertyImage[], { propertyId: string; imageId: string }>({
      query: ({ propertyId, imageId }) => ({
        method: "POST",
        url: `/api/v1/properties/${propertyId}/images/${imageId}/cover`,
      }),
      invalidatesTags: ["Discovery"],
    }),
  }),
});

export const {
  useUpdatePropertyImageCaptionMutation,
  useRemovePropertyContactManagerMutation,
  useAddPropertyContactManagerMutation,
  useListPropertyContactsQuery,
  useAddPropertyImagesMutation,
  useCreateLocalPlaceCategoryMutation,
  useCreateLocalPlaceMutation,
  useCreateLocalPlaceSubcategoryMutation,
  useDeleteLocalPlaceMutation,
  useGetDiscoveryPropertyQuery,
  useGetOwnerDiscoveryProfileQuery,
  useListLocationAreasQuery,
  useListLocationCitiesQuery,
  useListLocalPlaceTaxonomyQuery,
  useListManagedLocalPlacesQuery,
  useListPropertyImagesQuery,
  useMakePropertyImageCoverMutation,
  useRemovePropertyImageMutation,
  useListMyLocalPlacesQuery,
  useListMyLocalPlaceTaxonomyQuery,
  usePublishOwnerDiscoveryProfileMutation,
  useSearchManagedLocalPlacesQuery,
  useSearchMyLocalPlacesQuery,
  useSearchDiscoveryPropertiesQuery,
  useSuggestLocationsQuery,
  useUnpublishOwnerDiscoveryProfileMutation,
  useUpdateLocalPlaceMutation,
  useUpdateOwnerDiscoveryProfileMutation,
} = discoveryApi;
