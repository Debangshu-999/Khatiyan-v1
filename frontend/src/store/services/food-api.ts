import { api } from "@/store/api";
import type { MealType } from "@/store/services/property-api";

/**
 * Property food: what can be cooked, who eats what, and how much to make.
 *
 * <p>Two switches sit behind all of this and they are not the same one. The
 * PROPERTY decides whether it offers food and which meals — that is what a
 * listing advertises. This module decides whether Khatiyan manages that
 * operation. Turning management off never changes what the property advertises.
 */
export type FoodQuantityUnit = "PIECE" | "SERVING" | "GRAM" | "KILOGRAM" | "MILLILITRE" | "LITRE";

/** Short forms, for a row that already says what the item is. */
export const FOOD_UNIT_LABEL: Record<FoodQuantityUnit, string> = {
  GRAM: "grams",
  KILOGRAM: "Kg",
  LITRE: "litres",
  MILLILITRE: "ml",
  PIECE: "pcs",
  SERVING: "servings",
};

/** The word an owner picks from, where the short form would be cryptic. */
export const FOOD_UNIT_NAME: Record<FoodQuantityUnit, string> = {
  GRAM: "Grams",
  KILOGRAM: "Kilograms",
  LITRE: "Litres",
  MILLILITRE: "Millilitres",
  PIECE: "Pieces",
  SERVING: "Servings",
};

export type FoodModuleOverview = {
  propertyId: string;
  /** What the PROPERTY advertises. Not ours to change from here. */
  foodAvailableInProperty: boolean;
  /** Whether Khatiyan manages it. Ours. */
  moduleEnabled: boolean;
  availableMeals: MealType[];
  activeItems: number;
  activeProfiles: number;
  activeSubscriptions: number;
};

export type FoodItem = {
  id: string;
  propertyId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imagePublicId: string | null;
  quantityUnit: FoodQuantityUnit;
  /**
   * The meals this dish is served at, at least one.
   *
   * <p>What the weekly menu's picker filters on, so chicken curry stops being
   * offered for breakfast. A set rather than one meal: roti is dinner and
   * breakfast, and splitting it into two items would make the forecast cook it
   * as two separate things.
   */
  mealTags: MealType[];
  /** False once retired: off the menus, still listed, and recoverable. */
  active: boolean;
  /** True once removed from the owner's list. The listing never returns these. */
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FoodProfile = {
  id: string;
  propertyId: string;
  name: string;
  description: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type FoodProfileSubscriberSummary = {
  profile: FoodProfile;
  subscriberCount: number;
};

export type FoodMenuEntry = {
  id: string;
  propertyId: string;
  profileId: string;
  itemId: string;
  itemName: string;
  itemImageUrl: string | null;
  quantityUnit: FoodQuantityUnit;
  dayOfWeek: DayOfWeek;
  mealType: MealType;
  baseQuantityPerSubscriber: number;
  repeatQuantity: number;
  expectedRepeatPercentage: number;
  fixedBufferQuantity: number;
  batchSize: number | null;
  displayOrder: number;
  /**
   * Whether the property still serves this meal.
   *
   * <p>False is a stale row. Creating an entry checks the meal is offered, but
   * nothing revisits existing ones when an owner later drops dinner — so the
   * entry stays while the forecast refuses that meal. The editor has to show
   * it, or the flag helps nobody.
   */
  mealStillServed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type FoodProfileMenu = {
  profile: FoodProfile;
  entries: FoodMenuEntry[];
};

export type FoodSubscriber = {
  subscriptionId: string;
  tenancyId: string;
  tenantUserId: string;
  tenantName: string;
  tenantPhone: string;
  roomNumber: string | null;
  profileId: string;
  profileName: string;
  startedAt: string;
};

export type FoodSubscription = {
  id: string;
  propertyId: string;
  tenancyId: string;
  tenantUserId: string;
  profileId: string;
  profileName: string;
  startedAt: string;
};

export type TenantFoodAvailability = {
  propertyId: string;
  foodAvailableInProperty: boolean;
  moduleEnabled: boolean;
  availableMeals: MealType[];
};

/**
 * What to cook, for one meal on one day.
 *
 * <p>{@code totalSubscribers} is mouths being FED, not subscribers on the
 * books: a profile with subscribers and nothing on its menu for this meal is
 * left out entirely. So this number always agrees with the quantities beside
 * it.
 */
export type CookingForecast = {
  propertyId: string;
  date: string;
  mealType: MealType;
  totalSubscribers: number;
  profiles: ProfileForecast[];
  consolidatedItems: ConsolidatedItemForecast[];
  /**
   * Items taken off this DATE by the owner.
   *
   * <p>Left out of every quantity above but still returned, because a dish
   * that vanished without trace is one nobody can put back.
   */
  unavailableItems: SkippedItem[];
};

export type SkippedItem = {
  itemId: string;
  itemName: string;
  quantityUnit: FoodQuantityUnit;
};

export type ProfileForecast = {
  profileId: string;
  profileName: string;
  subscriberCount: number;
  items: ItemForecast[];
};

export type ItemForecast = {
  itemId: string;
  itemName: string;
  quantityUnit: FoodQuantityUnit;
  targetQuantity: number;
};

export type ConsolidatedItemForecast = ItemForecast & {
  /** The same total, split by the profile that asked for it — for plating. */
  profileBreakdown: ProfileQuantity[];
};

export type ProfileQuantity = {
  profileId: string;
  profileName: string;
  targetQuantity: number;
};

export type SaveFoodItemBody = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  imagePublicId?: string | null;
  quantityUnit: FoodQuantityUnit;
  /** At least one. An untagged item matches no meal and can never be served. */
  mealTags: MealType[];
};

export type SaveFoodProfileBody = {
  name: string;
  description?: string | null;
  displayOrder?: number | null;
};

export type SaveFoodMenuEntryBody = {
  itemId: string;
  dayOfWeek: DayOfWeek;
  mealType: MealType;
  /** Per subscriber, and the only required quantity. At most 3 decimals. */
  baseQuantityPerSubscriber: number;
  /** The second helping, priced by how many people take one. */
  repeatQuantity?: number | null;
  expectedRepeatPercentage?: number | null;
  /** The standing extra: the staff plate, the spill. */
  fixedBufferQuantity?: number | null;
  /** You cannot cook two thirds of a pot of rice. */
  batchSize?: number | null;
  displayOrder?: number | null;
};

const base = (propertyId: string) => `/api/v1/properties/${propertyId}/food`;

export const foodApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // ---- owner and manager ------------------------------------------------
    getFoodOverview: builder.query<FoodModuleOverview, string>({
      providesTags: ["Food"],
      query: (propertyId) => ({ url: base(propertyId) }),
    }),

    setFoodModuleEnabled: builder.mutation<FoodModuleOverview, { propertyId: string; enabled: boolean }>({
      invalidatesTags: ["Food"],
      query: ({ propertyId, enabled }) => ({
        body: { enabled },
        method: "PATCH",
        url: `${base(propertyId)}/status`,
      }),
    }),

    listFoodItems: builder.query<FoodItem[], string>({
      providesTags: ["Food"],
      query: (propertyId) => ({ url: `${base(propertyId)}/items` }),
    }),

    createFoodItem: builder.mutation<FoodItem, { propertyId: string; body: SaveFoodItemBody }>({
      invalidatesTags: ["Food"],
      query: ({ propertyId, body }) => ({ body, method: "POST", url: `${base(propertyId)}/items` }),
    }),

    updateFoodItem: builder.mutation<
      FoodItem,
      { propertyId: string; itemId: string; body: SaveFoodItemBody }
    >({
      invalidatesTags: ["Food"],
      query: ({ propertyId, itemId, body }) => ({
        body,
        method: "PATCH",
        url: `${base(propertyId)}/items/${itemId}`,
      }),
    }),

    /**
     * Retires an item.
     *
     * <p>Refused while the item is on an active menu — the owner is told what
     * to clear first, rather than a forecast quietly losing an ingredient.
     */
    deactivateFoodItem: builder.mutation<void, { propertyId: string; itemId: string }>({
      invalidatesTags: ["Food"],
      query: ({ propertyId, itemId }) => ({
        method: "DELETE",
        url: `${base(propertyId)}/items/${itemId}`,
      }),
    }),

    /**
     * Puts a retired item back in service.
     *
     * <p>Refused when another item has taken its name meanwhile, since
     * retiring an item frees its name for reuse.
     */
    reactivateFoodItem: builder.mutation<FoodItem, { propertyId: string; itemId: string }>({
      invalidatesTags: ["Food"],
      query: ({ propertyId, itemId }) => ({
        method: "POST",
        url: `${base(propertyId)}/items/${itemId}/reactivate`,
      }),
    }),

    /**
     * Removes a retired item from the list for good.
     *
     * <p>A soft delete on the server: the row stays so the menu history that
     * references it survives, but nothing in the app shows it again.
     */
    deleteFoodItem: builder.mutation<void, { propertyId: string; itemId: string }>({
      invalidatesTags: ["Food"],
      query: ({ propertyId, itemId }) => ({
        method: "DELETE",
        url: `${base(propertyId)}/items/${itemId}/remove`,
      }),
    }),

    listFoodProfiles: builder.query<FoodProfile[], string>({
      providesTags: ["Food"],
      query: (propertyId) => ({ url: `${base(propertyId)}/profiles` }),
    }),

    /** Profiles with how many people are on each. Drives the profiles screen. */
    listFoodProfileSubscriberCounts: builder.query<FoodProfileSubscriberSummary[], string>({
      providesTags: ["Food"],
      query: (propertyId) => ({ url: `${base(propertyId)}/profiles/subscriber-counts` }),
    }),

    createFoodProfile: builder.mutation<FoodProfile, { propertyId: string; body: SaveFoodProfileBody }>({
      invalidatesTags: ["Food"],
      query: ({ propertyId, body }) => ({ body, method: "POST", url: `${base(propertyId)}/profiles` }),
    }),

    updateFoodProfile: builder.mutation<
      FoodProfile,
      { propertyId: string; profileId: string; body: SaveFoodProfileBody }
    >({
      invalidatesTags: ["Food"],
      query: ({ propertyId, profileId, body }) => ({
        body,
        method: "PATCH",
        url: `${base(propertyId)}/profiles/${profileId}`,
      }),
    }),

    /** Refused while anybody is still subscribed to it. */
    deactivateFoodProfile: builder.mutation<void, { propertyId: string; profileId: string }>({
      invalidatesTags: ["Food"],
      query: ({ propertyId, profileId }) => ({
        method: "DELETE",
        url: `${base(propertyId)}/profiles/${profileId}`,
      }),
    }),

    listFoodSubscribers: builder.query<FoodSubscriber[], string>({
      providesTags: ["Food"],
      query: (propertyId) => ({ url: `${base(propertyId)}/subscribers` }),
    }),

    getFoodProfileMenu: builder.query<FoodProfileMenu, { propertyId: string; profileId: string }>({
      providesTags: ["Food"],
      query: ({ propertyId, profileId }) => ({
        url: `${base(propertyId)}/profiles/${profileId}/menu`,
      }),
    }),

    createFoodMenuEntry: builder.mutation<
      FoodMenuEntry,
      { propertyId: string; profileId: string; body: SaveFoodMenuEntryBody }
    >({
      invalidatesTags: ["Food"],
      query: ({ propertyId, profileId, body }) => ({
        body,
        method: "POST",
        url: `${base(propertyId)}/profiles/${profileId}/menu`,
      }),
    }),

    updateFoodMenuEntry: builder.mutation<
      FoodMenuEntry,
      { propertyId: string; entryId: string; body: SaveFoodMenuEntryBody }
    >({
      invalidatesTags: ["Food"],
      query: ({ propertyId, entryId, body }) => ({
        body,
        method: "PATCH",
        url: `${base(propertyId)}/menu/${entryId}`,
      }),
    }),

    deactivateFoodMenuEntry: builder.mutation<void, { propertyId: string; entryId: string }>({
      invalidatesTags: ["Food"],
      query: ({ propertyId, entryId }) => ({
        method: "DELETE",
        url: `${base(propertyId)}/menu/${entryId}`,
      }),
    }),

    /**
     * Takes one item off ONE date's cooking.
     *
     * <p>The weekly menu is untouched — next week's same weekday still serves
     * it. Invalidates "Food" so the forecast refetches with the item moved into
     * `unavailableItems`.
     */
    markFoodItemUnavailable: builder.mutation<
      void,
      { propertyId: string; itemId: string; date: string; mealType: MealType }
    >({
      invalidatesTags: ["Food"],
      query: ({ propertyId, ...body }) => ({
        body,
        method: "POST",
        url: `${base(propertyId)}/forecast/unavailable`,
      }),
    }),

    /** Puts it back on that date. */
    markFoodItemAvailable: builder.mutation<
      void,
      { propertyId: string; itemId: string; date: string; mealType: MealType }
    >({
      invalidatesTags: ["Food"],
      query: ({ propertyId, ...params }) => ({
        method: "DELETE",
        params,
        url: `${base(propertyId)}/forecast/unavailable`,
      }),
    }),

    /**
     * How much to cook for one meal on one day.
     *
     * <p>Not tagged "Food": it is derived from menus and subscriptions, and
     * re-deriving it on every unrelated edit would refetch a heavy read while
     * an owner is typing a quantity.
     */
    getCookingForecast: builder.query<
      CookingForecast,
      { propertyId: string; date: string; mealType: MealType }
    >({
      query: ({ propertyId, date, mealType }) => ({
        params: { date, mealType },
        url: `${base(propertyId)}/forecast`,
      }),
    }),

    // ---- the tenant's own side --------------------------------------------
    getMyFoodAvailability: builder.query<TenantFoodAvailability, void>({
      providesTags: ["Food"],
      query: () => ({ url: "/api/v1/food/me" }),
    }),

    listMyFoodProfiles: builder.query<FoodProfile[], void>({
      providesTags: ["Food"],
      query: () => ({ url: "/api/v1/food/me/profiles" }),
    }),

    getMyFoodProfileMenu: builder.query<FoodProfileMenu, string>({
      providesTags: ["Food"],
      query: (profileId) => ({ url: `/api/v1/food/me/profiles/${profileId}/menu` }),
    }),

    /** Null when they are on no profile: the endpoint answers 204, not 404. */
    getMyFoodSubscription: builder.query<FoodSubscription | null, void>({
      providesTags: ["Food"],
      query: () => ({ url: "/api/v1/food/me/subscription" }),
    }),

    /**
     * Joins a profile, or moves to a different one.
     *
     * <p>One subscription at a time: switching ends the previous one rather
     * than adding a second. Choosing the profile they are already on changes
     * nothing and is not an error.
     */
    subscribeToFoodProfile: builder.mutation<FoodSubscription, { profileId: string }>({
      invalidatesTags: ["Food"],
      query: (body) => ({ body, method: "PUT", url: "/api/v1/food/me/subscription" }),
    }),

    /** Always available, even when the owner has switched management off. */
    unsubscribeFromFood: builder.mutation<void, void>({
      invalidatesTags: ["Food"],
      query: () => ({ method: "DELETE", url: "/api/v1/food/me/subscription" }),
    }),
  }),
});

export const {
  useCreateFoodItemMutation,
  useCreateFoodMenuEntryMutation,
  useCreateFoodProfileMutation,
  useDeactivateFoodItemMutation,
  useDeleteFoodItemMutation,
  useDeactivateFoodMenuEntryMutation,
  useDeactivateFoodProfileMutation,
  useGetCookingForecastQuery,
  useGetFoodOverviewQuery,
  useGetFoodProfileMenuQuery,
  useGetMyFoodAvailabilityQuery,
  useGetMyFoodProfileMenuQuery,
  useGetMyFoodSubscriptionQuery,
  useListFoodItemsQuery,
  useMarkFoodItemAvailableMutation,
  useMarkFoodItemUnavailableMutation,
  useReactivateFoodItemMutation,
  useListFoodProfileSubscriberCountsQuery,
  useListFoodProfilesQuery,
  useListFoodSubscribersQuery,
  useListMyFoodProfilesQuery,
  useSetFoodModuleEnabledMutation,
  useSubscribeToFoodProfileMutation,
  useUnsubscribeFromFoodMutation,
  useUpdateFoodItemMutation,
  useUpdateFoodMenuEntryMutation,
  useUpdateFoodProfileMutation,
} = foodApi;
