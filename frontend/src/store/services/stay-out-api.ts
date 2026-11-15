import { api } from "@/store/api";
import type { MealType } from "@/store/services/property-api";

/**
 * One of the tenant's stay outs. UPCOMING before the leaving day, AWAY from it
 * to the return day, DONE after. Once the leaving day has passed only the
 * return can change, and it can no longer be cancelled.
 */
export type StayOut = {
  id: string;
  leaveDate: string;
  /** Null = gone before the leaving day's first meal. */
  lastMealHere: MealType | null;
  returnDate: string;
  /** Null = back after the return day's last meal. */
  firstMealBack: MealType | null;
  /** The tenant's own words. */
  reason: string | null;
  state: "UPCOMING" | "AWAY" | "DONE";
  canChangeLeaving: boolean;
  canCancel: boolean;
};

/** The tenant's stay outs, and what the declare sheet needs. */
export type StayOutList = {
  /** A current monthly stay at a PG or hostel. */
  available: boolean;
  /** The meals the property serves, in the order of the day. Empty where it serves none. */
  meals: MealType[];
  /** Come back by this day. Null when the stay has no end yet. */
  checkoutDate: string | null;
  stayOuts: StayOut[];
};

export type SaveStayOutBody = {
  leaveDate: string;
  lastMealHere: MealType | null;
  returnDate: string;
  firstMealBack: MealType | null;
  /** The tenant's own words. */
  reason: string | null;
};

export type StayOutBoardEntry = {
  id: string;
  tenancyId: string;
  /** TEN-... */
  tenancyReferenceCode: string | null;
  tenantName: string | null;
  roomNumber: string | null;
  leaveDate: string;
  lastMealHere: MealType | null;
  returnDate: string;
  firstMealBack: MealType | null;
  /** The tenant's own words. */
  reason: string | null;
};

/** Who is away tonight, back today, leaving in the next 30 days, and back in the last 30. */
export type StayOutBoard = {
  awayTonight: StayOutBoardEntry[];
  backToday: StayOutBoardEntry[];
  upcoming: StayOutBoardEntry[];
  /** Ended in the last 30 days, newest first (user, 2026-11-14: the Past filter). */
  past: StayOutBoardEntry[];
};

export const stayOutApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMyStayOuts: builder.query<StayOutList, void>({
      providesTags: ["StayOut"],
      query: () => "/api/v1/tenancies/me/stay-outs",
    }),
    declareStayOut: builder.mutation<StayOut, SaveStayOutBody>({
      invalidatesTags: ["StayOut"],
      query: (body) => ({ body, method: "POST", url: "/api/v1/tenancies/me/stay-outs" }),
    }),
    changeStayOut: builder.mutation<StayOut, { id: string; body: SaveStayOutBody }>({
      invalidatesTags: ["StayOut"],
      query: ({ body, id }) => ({ body, method: "PUT", url: `/api/v1/tenancies/me/stay-outs/${id}` }),
    }),
    cancelStayOut: builder.mutation<void, string>({
      invalidatesTags: ["StayOut"],
      query: (id) => ({ method: "POST", url: `/api/v1/tenancies/me/stay-outs/${id}/cancel` }),
    }),
    getStayOutBoard: builder.query<StayOutBoard, string>({
      providesTags: ["StayOut"],
      query: (propertyId) => `/api/v1/properties/${propertyId}/stay-outs`,
    }),
  }),
});

export const {
  useCancelStayOutMutation,
  useChangeStayOutMutation,
  useDeclareStayOutMutation,
  useGetMyStayOutsQuery,
  useGetStayOutBoardQuery,
} = stayOutApi;
