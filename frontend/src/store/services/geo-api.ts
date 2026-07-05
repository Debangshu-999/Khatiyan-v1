import { api } from "@/store/api";

// One autocomplete candidate. Same-named places are disambiguated by the
// address line (locality, city, state and usually pincode).
export type GeoSuggestion = {
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  pincode: string | null;
  placeType: string | null;
  providerPlaceId: string | null;
};

// Structured address for a map point, used to prefill editable address forms.
export type ReverseGeocode = {
  formattedAddress: string | null;
  street: string | null;
  locality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number;
  longitude: number;
};

// Server proxies the geocoding vendor (key, cache and rate limits live there),
// so these are plain reads — no cache tags to invalidate.
export const geoApi = api.injectEndpoints({
  endpoints: (builder) => ({
    searchLocations: builder.query<GeoSuggestion[], { q: string; nearLat?: number; nearLng?: number }>({
      query: ({ q, nearLat, nearLng }) => ({
        url: "/api/v1/geo/search",
        params: nearLat != null && nearLng != null ? { q, nearLat, nearLng } : { q },
      }),
      keepUnusedDataFor: 300,
    }),
    reverseGeocode: builder.query<ReverseGeocode, { lat: number; lng: number }>({
      query: ({ lat, lng }) => ({ url: "/api/v1/geo/reverse", params: { lat, lng } }),
      keepUnusedDataFor: 3600,
    }),
  }),
});

export const {
  useLazySearchLocationsQuery,
  useLazyReverseGeocodeQuery,
  useSearchLocationsQuery,
} = geoApi;
