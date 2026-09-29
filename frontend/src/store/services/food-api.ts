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

/** A profile's diet, picked from a fixed list (2026-09-28). */
export type FoodProfileCategory = "VEG" | "NON_VEG" | "JAIN" | "PESCATARIAN" | "EGGETARIAN" | "OTHER";

export type FoodProfile = {
  id: string;
  propertyId: string;
  name: string;
  description: string | null;
  displayOrder: number;
  category: FoodProfileCategory;
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
  /** A mixed week (2026-09-29): this row is one of several profiles they eat. */
  hybrid: boolean;
  /** The weekdays they eat this profile, Monday first. Empty unless hybrid. */
  days: DayOfWeek[];
};

/** One day of a plan's week. */
export type FoodPlanDay = {
  day: DayOfWeek;
  profileId: string;
  profileName: string | null;
  profileCategory: FoodProfileCategory | null;
};

/**
 * One version of a tenant's plan (2026-09-29). A normal plan carries its one
 * profile at the top. A hybrid plan leaves those null, and `days` names each
 * day's profile, Monday first.
 */
export type FoodPlanVersion = {
  id: string;
  effectiveFrom: string;
  /** The first day it no longer applies. Null while it runs on. */
  effectiveUntil: string | null;
  hybrid: boolean;
  profileId: string | null;
  profileName: string | null;
  profileCategory: FoodProfileCategory | null;
  days: FoodPlanDay[];
  startedAt: string;
};

/**
 * The tenant's plan as it stands. Every change starts tomorrow, so `today`
 * and `fromTomorrow` can differ, and a stop shows as `endsTonight`.
 */
export type FoodPlan = {
  today: FoodPlanVersion | null;
  fromTomorrow: FoodPlanVersion | null;
  endsTonight: boolean;
};

/** A normal plan (one profile) or a hybrid week, never both. */
export type ChooseFoodPlanBody = { profileId: string } | { days: Record<DayOfWeek, string> };

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
  category: FoodProfileCategory;
};

/** Where a meal stands right now. */
export type MealStatus = "UPCOMING" | "SERVING" | "DONE";

/** Times are "HH:mm:ss", local to the property (IST). */
export type MealTiming = {
  mealType: MealType;
  startTime: string;
  endTime: string;
  /** False while the meal is still on the default time. */
  saved: boolean;
};

export type MealSlot = {
  mealType: MealType;
  startTime: string;
  endTime: string;
  /** Minutes later than planned, 0 when on time. */
  delayMinutes: number;
  status: MealStatus;
};

/**
 * A property's meal day (2026-09-28): the timetable, today's meals, and the one
 * that is next. `nextMeal` is null once the day's last meal is over, until
 * midnight. The server decides it, owner and tenant alike.
 */
export type MealSchedule = {
  date: string;
  timings: MealTiming[];
  today: MealSlot[];
  nextMeal: MealSlot | null;
  delayCutoffMinutes: number;
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
     * it.
     *
     * <p>Invalidates "FoodForecast", NOT "Food". It said "Food" and the
     * forecast is deliberately not tagged with it, so nothing refetched: the
     * call succeeded, the toast said so, and the screen went on showing the
     * dish as if nothing had happened.
     */
    markFoodItemUnavailable: builder.mutation<
      void,
      { propertyId: string; itemId: string; date: string; mealType: MealType }
    >({
      invalidatesTags: ["FoodForecast"],
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
      invalidatesTags: ["FoodForecast"],
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
     * an owner is typing a quantity. It has its own tag instead, so the two
     * actions that DO change one date's cooking can refresh it without
     * dragging the whole catalogue along.
     */
    getCookingForecast: builder.query<
      CookingForecast,
      { propertyId: string; date: string; mealType: MealType }
    >({
      providesTags: ["FoodForecast"],
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
    /**
     * Dishes the property took off one meal on one date. Property-wide: the
     * screen shows only those on the tenant's own plan.
     */
    getMyFoodSkips: builder.query<SkippedItem[], { date: string; mealType: MealType }>({
      providesTags: ["Food"],
      query: ({ date, mealType }) => ({ params: { date, mealType }, url: "/api/v1/food/me/skips" }),
    }),

    getMealSchedule: builder.query<MealSchedule, string>({
      providesTags: ["Food"],
      query: (propertyId) => ({ url: `/api/v1/properties/${propertyId}/food/meal-schedule` }),
    }),

    /** Meals left out keep their current time. Times are "HH:mm". */
    saveMealTimings: builder.mutation<
      MealSchedule,
      { propertyId: string; timings: { mealType: MealType; startTime: string; endTime: string }[] }
    >({
      invalidatesTags: ["Food"],
      query: ({ propertyId, timings }) => ({
        body: { timings },
        method: "PUT",
        url: `/api/v1/properties/${propertyId}/food/meal-timings`,
      }),
    }),

    /** Pushes one of today's meals later. The end moves by the same amount. */
    delayMeal: builder.mutation<MealSchedule, { propertyId: string; mealType: MealType; newStartTime: string }>({
      invalidatesTags: ["Food", "Notification"],
      query: ({ propertyId, mealType, newStartTime }) => ({
        body: { mealType, newStartTime },
        method: "POST",
        url: `/api/v1/properties/${propertyId}/food/meal-delays`,
      }),
    }),

    /** The tenant's own property's meal day. Null when there is no food there. */
    getMyMealSchedule: builder.query<MealSchedule | null, void>({
      providesTags: ["Food"],
      query: () => ({ url: "/api/v1/food/me/meal-schedule" }),
    }),

    /** Null when there is no plan today and none coming. */
    getMyFoodSubscription: builder.query<FoodPlan | null, void>({
      providesTags: ["Food"],
      query: () => ({ url: "/api/v1/food/me/subscription" }),
    }),

    /**
     * Chooses a plan, one profile or a hybrid week (2026-09-29). It always
     * starts tomorrow. A second choice the same day replaces tomorrow's, and
     * choosing today's plan again cancels the change.
     */
    subscribeToFoodProfile: builder.mutation<FoodPlan, ChooseFoodPlanBody>({
      invalidatesTags: ["Food"],
      query: (body) => ({ body, method: "PUT", url: "/api/v1/food/me/subscription" }),
    }),

    /**
     * Stops the plan: it ends tonight, and the owner's counts drop after
     * midnight. Returns the plan so the screen can say so. Always available,
     * even when the owner has switched management off.
     */
    unsubscribeFromFood: builder.mutation<FoodPlan, void>({
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
  useDelayMealMutation,
  useGetCookingForecastQuery,
  useGetFoodOverviewQuery,
  useGetFoodProfileMenuQuery,
  useGetMealScheduleQuery,
  useGetMyMealScheduleQuery,
  useGetMyFoodAvailabilityQuery,
  useGetMyFoodProfileMenuQuery,
  useGetMyFoodSkipsQuery,
  useGetMyFoodSubscriptionQuery,
  useListFoodItemsQuery,
  useMarkFoodItemAvailableMutation,
  useMarkFoodItemUnavailableMutation,
  useReactivateFoodItemMutation,
  useSaveMealTimingsMutation,
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
