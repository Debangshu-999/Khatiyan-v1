import { api } from "@/store/api";

// RoomType is the app's name for what the backend calls SharingType.
import type { PropertyDiscoveryCard } from "./discovery-api";
import type { MealType, PgFor, PreferredTenantType, RoomType } from "./property-api";

/**
 * What the app understood from a sentence.
 *
 * <p>Only READY means the filters can be run. Every other value carries a
 * reason to show, and each one still returns the filters it did understand —
 * failing to place a location is no reason to throw away the rest.
 */
export type InterpretStatus = "READY" | "LOCATION_NOT_FOUND" | "LOCATION_NEEDED" | "OUTSIDE_INDIA";

export type SearchAnchor = "PLACE" | "DEVICE" | "NONE";

export type BathroomType = "ATTACHED" | "COMMON";

/**
 * Typed filters for the ordinary discovery search.
 *
 * The sentence never reaches the search endpoint — only this does, which is
 * what makes a misreading a visible wrong filter rather than an opaque query.
 */
export type SmartSearchArgs = {
  state: string | null;
  city: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  pgFor: PgFor | null;
  minRentPaise: number | null;
  maxRentPaise: number | null;
  preferredFor: PreferredTenantType | null;
  foodIncluded: boolean | null;
  mealTypes: MealType[];
  electricityIncluded: boolean | null;
  bathroomType: BathroomType | null;
  sharingTypes: RoomType[];
};

export type ResolvedLocation = {
  displayName: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type InterpretSearchResult = {
  intentVersion: string;
  status: InterpretStatus;
  anchor: SearchAnchor;
  resolvedLocation: ResolvedLocation | null;
  searchArgs: SmartSearchArgs;
  /** Phrases the model could not turn into a filter, kept word for word. */
  unresolvedRequirements: string[];
  /** Things the sentence asked for that cannot both hold. Reported, not repaired. */
  conflicts: string[];
  confidence: number | null;
};

/**
 * One listing, with its own account of why it is in the list.
 *
 * <p>The property is the ordinary discovery card, unchanged — the same shape
 * the manual search renders, so there is one card component and not two.
 */
export type SmartSearchListing = {
  property: PropertyDiscoveryCard;
  /** Requirements this listing meets, already worded by the server. */
  matchedTags: string[];
  /** Requirements it does not. Never empty for a related listing. */
  missedTags: string[];
  requirementCount: number;
  nearestName: string | null;
  nearestKm: number | null;
  /**
   * The meter, decided by the server. For a landmark it follows the distance
   * scale: within 3 km strong, 3 to 5 km moderate, 5 to 15 km weak.
   */
  strength: "STRONG" | "MODERATE" | "WEAK" | null;
  /** The AI line for this card. Null past the first page, or if none was written. */
  reason: string | null;
};

/**
 * A sentence, answered in one call.
 *
 * <p>`searchArgs` still comes back and still matters: it is what fills the
 * ordinary filter controls, so everything the sentence did stays visible and
 * changeable where somebody would have set it by hand.
 */
export type SmartSearchResult = {
  intentVersion: string;
  status: InterpretStatus;
  resolvedLocation: ResolvedLocation | null;
  /** The kind of place the search was measured against, named for a reader. */
  landmark: string | null;
  searchArgs: SmartSearchArgs;
  /** Every requirement applied, in plain words, for the chips. */
  requirements: string[];
  unresolvedRequirements: string[];
  conflicts: string[];
  matching: SmartSearchListing[];
  related: SmartSearchListing[];
};

export type AiCapabilities = { smartSearch: boolean };

export const intelligenceApi = api.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * What this deployment offers.
     *
     * A 404 means the module is not deployed, which reads the same as
     * everything being off — so the control is hidden rather than shown
     * failing. `transformErrorResponse` keeps that out of the error channel:
     * an absent feature is not a problem to report to the user.
     */
    getAiCapabilities: builder.query<AiCapabilities, void>({
      query: () => "/api/v1/ai/capabilities",
      transformErrorResponse: () => ({ smartSearch: false }),
    }),

    /**
     * Reads the sentence and answers it — filters, listings, reasons.
     *
     * <p>One call rather than interpret-then-search: the reason lines cannot
     * be written before the results exist, and a landmark cannot be resolved
     * without first placing the region.
     */
    smartSearch: builder.mutation<
      SmartSearchResult,
      { query: string; device?: { latitude: number; longitude: number } | null }
    >({
      query: ({ device, query }) => ({
        body: { device: device ?? null, query },
        method: "POST",
        url: "/api/v1/ai/discovery/search",
      }),
    }),

    /**
     * Example sentences for the empty AI box, written from listings nearby.
     *
     * <p>No model call and nothing spent from the allowance. `round` is never
     * sent — it is only part of the cache key, so bumping it asks for a fresh
     * set, which is how each opening of the box gets new ones.
     */
    getSmartSearchSuggestions: builder.query<
      { suggestions: string[] },
      { state: string | null; latitude: number | null; longitude: number | null; round: number }
    >({
      keepUnusedDataFor: 0,
      query: ({ latitude, longitude, state }) => ({
        params: {
          latitude: latitude ?? undefined,
          longitude: longitude ?? undefined,
          state: state || undefined,
        },
        url: "/api/v1/ai/discovery/suggestions",
      }),
    }),

    interpretSearch: builder.mutation<
      InterpretSearchResult,
      { query: string; device?: { latitude: number; longitude: number } | null }
    >({
      query: ({ device, query }) => ({
        body: { device: device ?? null, query },
        method: "POST",
        url: "/api/v1/ai/discovery/interpret",
      }),
    }),
  }),
  // Every api slice here does this: a Metro hot reload re-runs the module and
  // re-injects, which throws in dev unless overriding is allowed. Production
  // still refuses, where a duplicate endpoint is a real mistake.
  overrideExisting: __DEV__ ? true : "throw",
});

export const {
  useGetAiCapabilitiesQuery,
  useGetSmartSearchSuggestionsQuery,
  useInterpretSearchMutation,
  useSmartSearchMutation,
} = intelligenceApi;
