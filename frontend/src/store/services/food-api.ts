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
  /** Record meal attendance is on (2026-11-01). */
  attendanceEnabled: boolean;
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
  dishType: FoodDishType;
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
  /** Guessed from the name when left out. */
  dishType?: FoodDishType;
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
 * A tenant's meal pass (2026-11-01). `token` and `code` are null until the meal
 * starts and once it has been scanned, when `attendedAt` says when.
 */
export type MealPass = {
  state: "UPCOMING" | "OPEN" | "RECORDED";
  propertyName: string;
  date: string;
  mealType: MealType;
  startTime: string;
  endTime: string;
  profileName: string | null;
  token: string | null;
  code: string | null;
  attendedAt: string | null;
};

/** The meal open for scanning now, for every owner and manager. */
export type MealAttendanceLive = {
  enabled: boolean;
  openMeal: { mealType: MealType; startTime: string; endTime: string; attended: number; expected: number } | null;
};

export type MealScanResult = {
  tenantName: string | null;
  roomNumber: string | null;
  profileName: string | null;
  profileCategory: string | null;
  mealType: MealType;
  attendedAt: string;
  /** This pass had been scanned before: nothing new was recorded. */
  alreadyRecorded: boolean;
  attended: number;
  expected: number;
};

/**
 * `recorded` means at least one scan. A meal nobody scanned was not recorded,
 * which is not the same as everybody skipping it.
 */
export type MealAttendanceDayMeal = {
  mealType: MealType;
  state: "UPCOMING" | "OPEN" | "DONE";
  recorded: boolean;
  attended: number;
  expected: number;
  skipped: number;
  /** When it is served, such as "1:00 PM to 3:00 PM". Today's meals only. */
  time: string | null;
};

export type MealAttendanceDay = { date: string; attendanceEnabled: boolean; meals: MealAttendanceDayMeal[] };

type MealAttendanceCell = { date: string; attended: number; expected: number };

export type MealAttendancePlan = {
  profileId: string;
  name: string;
  meals: { mealType: MealType; thisWeek: MealAttendanceCell[]; thisMonth: MealAttendanceCell[]; thisYear: MealAttendanceCell[] }[];
};

/** Recorded meals only. The columns are each duration's periods, so one with nothing recorded keeps its place. */
export type MealAttendanceAnalytics = {
  weekColumns: string[];
  monthColumns: string[];
  yearColumns: string[];
  plans: MealAttendancePlan[];
};

export type MealAttendanceHistory = {
  days: { date: string; meals: MealAttendanceDayMeal[] }[];
  hasMore: boolean;
};

export type MealAttendancePerson = {
  tenancyId: string;
  tenantName: string | null;
  tenantPhotoUrl: string | null;
  roomNumber: string | null;
  profileName: string | null;
  attendedAt: string | null;
};

export type MealRatingPrompt = {
  date: string;
  mealType: MealType;
  dishes: { itemId: string; name: string }[];
};

export type FoodDishType = "COMMON" | "DRINK" | "VEG" | "NON_VEG";

/** The graph's points in date order: a day each for a week, the Monday of each week for a month, the first of the month for a year. */
export type MealRatingTrend = { rating: number | null; points: { date: string; rating: number | null }[] };

/** Empty when nobody rated it then. `change` is against the same length of time before, when both exist. */
export type MealDishPeriod = { rating: number | null; change: number | null };

export type MealDishRating = {
  itemId: string;
  name: string;
  thisWeek: MealDishPeriod;
  /** The whole of last week, for when this week has no rating yet. */
  lastWeek: number | null;
  thisMonth: MealDishPeriod;
  thisYear: MealDishPeriod;
};

export type MealPlanAnalytics = {
  profileId: string;
  name: string;
  ratingThisWeek: number | null;
  ratingLastWeek: number | null;
  ratingThisMonth: number | null;
  ratingThisYear: number | null;
  /** Only periods someone rated: thisWeek by day, thisMonth by the week's Monday, thisYear by the first of the month. */
  meals: {
    mealType: MealType;
    thisWeek: { date: string; rating: number; people: number }[];
    thisMonth: { date: string; rating: number; people: number }[];
    thisYear: { date: string; rating: number; people: number }[];
  }[];
};

/** Averages only. Nothing here says who rated what, or what they wrote. */
export type MealRatingsSummary = {
  overall: {
    /** The last 30 days, the card's own figure on the Meals overview. */
    rating: number | null;
    changeThisWeek: number | null;
    thisWeek: MealRatingTrend;
    thisMonth: MealRatingTrend;
    thisYear: MealRatingTrend;
  };
  profileAnalytics: MealPlanAnalytics[];
  dishGroups: { type: FoodDishType; dishes: MealDishRating[] }[];
};

export type MealReviewReading = {
  id: string;
  name: string;
  /** Out of 5: the AI's own score for its review, or the tenants' average behind a generic line. */
  rating: number | null;
  /** One short paragraph: the AI's review with key words between double asterisks, or the rating's own line when nobody wrote about it. */
  line: string | null;
};

/** `stored` is false for a week with nothing written: no AI ran and the turn was not used. */
export type MealReviewAnalysis = {
  stored: boolean;
  generatedOn: string | null;
  expiresOn: string | null;
  reviewsRead: number;
  plans: MealReviewReading[];
  dishes: MealReviewReading[];
};

export type MealReviewAnalysisStatus = { current: MealReviewAnalysis | null; owner: boolean; canGenerate: boolean };

export type MealAttendanceMeal = {
  date: string;
  mealType: MealType;
  state: "UPCOMING" | "OPEN" | "DONE";
  recorded: boolean;
  expected: number;
  attended: MealAttendancePerson[];
  /** Not yet scanned while the meal is open, skipped after it. Empty for a meal not recorded. */
  notAttended: MealAttendancePerson[];
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

    /** The tenant's pass for the meal on now or their next one today. Null when they have none. */
    getMyMealPass: builder.query<MealPass | null, void>({
      providesTags: ["MealAttendance"],
      query: () => ({ url: "/api/v1/food/me/meal-pass" }),
    }),

    setMealAttendanceEnabled: builder.mutation<void, { propertyId: string; enabled: boolean }>({
      invalidatesTags: ["Food", "MealAttendance"],
      // The switch shows the cached value, so without this it snaps back until the
      // server answers and then moves again (user, 2026-11-01). A refusal undoes it.
      async onQueryStarted({ propertyId, enabled }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          foodApi.util.updateQueryData("getFoodOverview", propertyId, (overview) => {
            overview.attendanceEnabled = enabled;
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      query: ({ propertyId, enabled }) => ({
        body: { enabled },
        method: "PATCH",
        url: `/api/v1/properties/${propertyId}/food/attendance/status`,
      }),
    }),

    /** Open to every manager of the property, whatever they were granted. */
    getMealAttendanceLive: builder.query<MealAttendanceLive, string>({
      providesTags: ["MealAttendance"],
      query: (propertyId) => ({ url: `/api/v1/properties/${propertyId}/food/attendance/live` }),
    }),

    scanMealPass: builder.mutation<MealScanResult, { propertyId: string; token?: string; code?: string }>({
      invalidatesTags: ["MealAttendance"],
      query: ({ propertyId, token, code }) => ({
        body: { code, token },
        method: "POST",
        url: `/api/v1/properties/${propertyId}/food/attendance/scan`,
      }),
    }),

    /** The one meal on offer for this tenant to rate. Null when there is none. */
    getMyMealRating: builder.query<MealRatingPrompt | null, void>({
      providesTags: ["MealRatings"],
      query: () => ({ url: "/api/v1/food/me/meal-rating" }),
    }),

    submitMealRating: builder.mutation<void, { date: string; mealType: MealType; ratings: { itemId: string; rating: number; review?: string }[] }>({
      invalidatesTags: ["MealRatings"],
      query: (body) => ({ body, method: "POST", url: "/api/v1/food/me/meal-rating" }),
    }),

    getMealRatingsSummary: builder.query<MealRatingsSummary, string>({
      providesTags: ["MealRatings"],
      query: (propertyId) => ({ url: `/api/v1/properties/${propertyId}/food/ratings` }),
    }),

    getMealReviewAnalysis: builder.query<MealReviewAnalysisStatus, string>({
      providesTags: ["MealRatings"],
      query: (propertyId) => ({ url: `/api/v1/properties/${propertyId}/food/ratings/analysis` }),
    }),

    generateMealReviewAnalysis: builder.mutation<MealReviewAnalysis, string>({
      invalidatesTags: ["MealRatings"],
      query: (propertyId) => ({ method: "POST", url: `/api/v1/properties/${propertyId}/food/ratings/analysis` }),
    }),

    getMealAttendanceDay: builder.query<MealAttendanceDay, { propertyId: string; date: string }>({
      providesTags: ["MealAttendance"],
      query: ({ propertyId, date }) => ({
        params: { date },
        url: `/api/v1/properties/${propertyId}/food/attendance/day`,
      }),
    }),

    getMealAttendanceAnalytics: builder.query<MealAttendanceAnalytics, string>({
      providesTags: ["MealAttendance"],
      query: (propertyId) => ({ url: `/api/v1/properties/${propertyId}/food/attendance/analytics` }),
    }),

    getMealAttendanceHistory: builder.query<MealAttendanceHistory, { propertyId: string; page: number }>({
      providesTags: ["MealAttendance"],
      query: ({ propertyId, page }) => ({
        params: { page, size: 14 },
        url: `/api/v1/properties/${propertyId}/food/attendance/history`,
      }),
    }),

    getMealAttendanceMeal: builder.query<MealAttendanceMeal, { propertyId: string; date: string; mealType: MealType }>({
      providesTags: ["MealAttendance"],
      query: ({ propertyId, date, mealType }) => ({
        params: { date, mealType },
        url: `/api/v1/properties/${propertyId}/food/attendance/meal`,
      }),
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
  useGetMealAttendanceAnalyticsQuery,
  useGetMealAttendanceDayQuery,
  useGetMealAttendanceHistoryQuery,
  useGetMealAttendanceLiveQuery,
  useGetMealAttendanceMealQuery,
  useGenerateMealReviewAnalysisMutation,
  useGetMealRatingsSummaryQuery,
  useGetMealReviewAnalysisQuery,
  useGetMyMealRatingQuery,
  useSubmitMealRatingMutation,
  useGetMealScheduleQuery,
  useGetMyMealPassQuery,
  useGetMyMealScheduleQuery,
  useScanMealPassMutation,
  useSetMealAttendanceEnabledMutation,
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
