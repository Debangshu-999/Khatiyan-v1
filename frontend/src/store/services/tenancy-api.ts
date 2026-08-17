import { api } from "@/store/api";
import type { Page } from "@/store/pagination";
import type { NoticePeriod } from "@/store/services/property-api";

export type TenancyBillingType = "DAILY" | "MONTHLY";
export type TenancyStatus =
  | "PENDING_ACCEPTANCE"
  | "ACTIVE"
  | "ON_NOTICE"
  | "ON_PREMATURE_NOTICE"
  | "EXITED"
  | "EVICTED"
  | "CANCELLED";

/**
 * How a tenancy's status is named to a reader.
 *
 * <p>Both notice statuses collapse to "On notice". Whether a stay is leaving at
 * the end of its term or before it is an internal distinction that decides
 * which charges apply at move-out — it is not a state anybody needs read back
 * to them, and "On premature notice" invites the reader to work out what makes
 * theirs premature. Every flow that acts on the difference still keys off the
 * real status; only the label collapses.
 */
export function tenancyStatusLabel(status: TenancyStatus) {
  if (status === "ON_NOTICE" || status === "ON_PREMATURE_NOTICE") {
    return "On notice";
  }
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export type EarlyExitPenaltyType = "REMAINING_TERM" | "FIXED";

/** How a charge assessed at move-out is collected. Mirrors the server enum. */
export type ExitChargeInstrument = "DEPOSIT" | "ONE_OFF_BILL";

export type ExitCustomCharge = { reason: string; amountPaise: number };

/** How money collected at move-out actually arrived. Mirrors the server enum. */
export type ExitCollectionMethod = "CASH" | "UPI" | "CARD" | "CHEQUE" | "OTHER";

export type ExitCharge = {
  amountPaise: number;
  instrument: ExitChargeInstrument;
  reason: string | null;
  /** Only meaningful for a billed charge; ignored for a deposit deduction. */
  collectedVia: ExitCollectionMethod | null;
};

/**
 * Everything the end-tenancy screen decided, sent as one call.
 *
 * <p>Damage travels as item NAMES, not amounts — the server prices them from
 * the property's own schedule, so a stale client cannot invent a charge.
 */
export type EndTenancyPayload = {
  tenancyId: string;
  /**
   * The early-exit charge, possibly split: part taken from the deposit and the
   * rest billed, for when one charge outgrows the deposit.
   */
  earlyExitCharges: ExitCharge[];
  /** Null for stays with no deposit account (daily stays). */
  depositPayable: boolean | null;
  damages: {
    itemNames: string[];
    customCharges: ExitCustomCharge[];
    instrument: ExitChargeInstrument;
    collectedVia: ExitCollectionMethod | null;
  } | null;
  /** Advisory: recorded as the actor's assessment, never a gate. */
  checklistConfirmed: string[];
  /**
   * Photo of the money collected at move-out. One for the whole exit — every
   * billed charge lands on a single bill and a single payment. Null when
   * nothing is billed.
   */
  proofImageUrl: string | null;
};

export type TenancySummary = {
  id: string;
  referenceCode: string;
  userId: string;
  tenantName: string | null;
  tenantPhone: string | null;
  tenantPhoneVerified: boolean;
  tenantProfileCompleted: boolean;
  propertyId: string;
  roomId: string;
  createdByUserId: string;
  billingType: TenancyBillingType;
  rentAmountPaise: number | null;
  depositAmountPaise: number | null;
  dailyRatePaise: number | null;
  startDate: string;
  plannedEndDate: string | null;
  endDate: string | null;
  status: TenancyStatus;
  createdAt: string;
  billingStarted: boolean;
  tosAccepted: boolean;
  // Agreement-backed tenancies carry stamped lock-in terms and exit premature-only.
  /** True when the agreement runs for a fixed term rather than indefinitely. */
  fixedTerm: boolean;
  /** The day a fixed term — and the tenancy — ends. Null when indefinite. */
  agreementEndDate: string | null;
  /** What leaving early costs, in the owner's words. Applied by a person. */
  earlyExitRule: string | null;
  // Null on tenancies onboarded before the declaration was required.
  idCheckConfirmed?: boolean | null;
  idCheckedAt?: string | null;
};

export type TenantPropertySummary = {
  id: string;
  referenceCode: string;
  ownerId: string;
  name: string;
  address: string;
  city: string;
  state: string | null;
  pincode: string;
};

export type TenantRoomSummary = {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: string | null;
  capacity: number;
  occupiedCount: number;
  availableVacancies: number;
  baseRentPaise: number;
  roomType: string;
  conditioning: string;
  status: string;
  active: boolean;
};

export type TenantActiveTenancy = {
  tenancy: TenancySummary;
  property: TenantPropertySummary;
  room: TenantRoomSummary;
};

/**
 * How long a lapsed exit request stays re-raisable on its original notice
 * anchor. Mirrors TenancyExitRequest.RE_RAISE_WINDOW_DAYS on the server.
 *
 * Once this passes, a rejected or expired request is finally dead — the tenant
 * can still leave, but through a fresh request in the next payment window.
 */
export const RE_RAISE_WINDOW_DAYS = 3;

export type TenancyExitRequestType = "NORMAL_NOTICE" | "PREMATURE";
export type TenancyExitRequestStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXECUTED"
  /** Nobody reviewed it within 5 days. Inert — nothing about the tenancy changed. */
  | "EXPIRED"
  /** Tenant asked to undo an approved exit; still on notice until the owner decides. */
  | "WITHDRAWAL_REQUESTED";

export type TenancyExitRequest = {
  id: string;
  /** Short code shown to both sides. Display this, never the id. */
  referenceCode: string;
  tenancyId: string;
  tenantUserId: string;
  tenantName: string | null;
  propertyId: string;
  roomId: string;
  type: TenancyExitRequestType;
  status: TenancyExitRequestStatus;
  requestedCheckoutDate: string;
  approvedCheckoutDate: string | null;
  tenantReason: string | null;
  adminNotes: string | null;
  finalBillingAmountPaise: number | null;
  depositPayable: boolean | null;
  depositSettlementAmountPaise: number | null;
  decidedByUserId: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  executedAt: string | null;
  /** The date the notice counts from; inherited from the request this re-raises. */
  noticeAnchorDate: string;
  /** The expired/rejected request this one re-raises — walk it to build the chain. */
  supersededRequestId: string | null;
  withdrawalRequestedAt: string | null;
  withdrawalReason: string | null;
  withdrawalDecidedAt: string | null;
  withdrawalDecidedByUserId: string | null;
  withdrawalDecidedByName: string | null;
  withdrawalAdminNotes: string | null;
  /** Server-computed: whether the tenant may still ask to undo this approval. */
  withdrawalWindowOpen: boolean;
  /**
   * When this stops being interactive and drops into history. Null means an
   * open-ended wait (a withdrawal the owner has not answered).
   *
   * Distinct from status: an approved exit stays APPROVED after this passes,
   * because that is what the execution scheduler looks for.
   */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** The dates a tenant may choose to leave on. */
export type ExitCheckoutWindow = {
  noticePeriod: NoticePeriod;
  noticeAnchorDate: string;
  /** The soonest they can leave having served the full notice — no consequence. */
  earliestCheckoutDate: string;
  latestCheckoutDate: string;
  /** Tomorrow. Choosing before `earliestCheckoutDate` is early, not forbidden. */
  earliestPossibleDate: string;
  /** True when the notice-served date is a single date rather than a range. */
  fixed: boolean;
  /** True when this window belongs to a re-raise of a lapsed request. */
  reRaise: boolean;
};

export type CreateExitRequestPayload = {
  /** Null takes the earliest, which for whole-month notice is the only option. */
  chosenCheckoutDate: string | null;
  reason: string | null;
};

export type TenancyRoomChangeRequestStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXECUTED"
  /** Nobody reviewed it within 5 days. No re-raise carve-out here — just ask again. */
  | "EXPIRED";

export type TenancyRoomChangeRequest = {
  id: string;
  /** Short code shown to both sides. Display this, never the id. */
  referenceCode: string;
  tenancyId: string;
  tenantUserId: string;
  tenantName: string | null;
  propertyId: string;
  currentRoomId: string;
  targetRoomId: string;
  billingCycleId: string;
  status: TenancyRoomChangeRequestStatus;
  effectiveTransferDate: string;
  tenantReason: string | null;
  adminNotes: string | null;
  requestedRoomRentAmountPaise: number;
  executedRentAmountPaise: number | null;
  decidedByUserId: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  executedAt: string | null;
  /** When this stops being interactive. Room changes expire once decided. */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateRoomChangeRequestPayload = {
  reason: string | null;
  targetRoomId: string;
};

export type CreatePrematureExitRequestPayload = {
  reason: string | null;
  requestedCheckoutDate: string;
};


/**
 * Approving fixes the tenant's requested date, so no date is sent.
 *
 * <p>The server refuses any other value: changing the date here moved someone's
 * last day without their agreement, and accepted dates already in the past. A
 * different date means rejecting the request so the tenant can raise a new one.
 */
export type ApproveExitRequestPayload = {
  adminNotes?: string | null;
};

export type TenantLookup = {
  exists: boolean;
  fullName: string | null;
  activeTenant: boolean;
  canOnboard: boolean;
  message: string;
};

export type OnboardTenantPayload = {
  tenantPhone: string;
  tenantName?: string | null;
  propertyId: string;
  roomId: string;
  billingType?: TenancyBillingType;
  rentAmountPaise?: number | null;
  depositAmountPaise?: number | null;
  startDate: string;
  plannedEndDate?: string | null;
  // The owner declaring they checked the tenant's ID proof and photograph.
  // The server rejects onboarding without it.
  idCheckConfirmed: boolean;
};

export type TenancyOnboardingResult = {
  tenantAccountCreated: boolean;
  tenancy: TenancySummary;
};

export const tenancyApi = api.injectEndpoints({
  endpoints: (builder) => ({
    lookupTenant: builder.query<TenantLookup, { phone: string; propertyId?: string }>({
      // propertyId lets the answer account for the property being onboarded
      // into — notably that this person already manages it, which the phone
      // alone cannot reveal.
      query: ({ phone, propertyId }) => ({
        url: "/api/v1/tenancies/tenant-lookup",
        params: { phone, ...(propertyId ? { propertyId } : {}) },
      }),
    }),

    onboardTenant: builder.mutation<TenancyOnboardingResult, OnboardTenantPayload>({
      query: (body) => ({ body, method: "POST", url: "/api/v1/tenancies" }),
      invalidatesTags: ["Tenancy", "Notification"],
    }),

    getMyActiveTenancy: builder.query<TenantActiveTenancy, void>({
      query: () => "/api/v1/tenancies/me/active",
      providesTags: ["Tenancy"],
    }),

    listMyTenancies: builder.query<TenancySummary[], void>({
      query: () => "/api/v1/tenancies/me",
      providesTags: ["Tenancy"],
    }),

    listActivePropertyTenancies: builder.query<Page<TenancySummary>, { page?: number; propertyId: string; query?: string; size?: number }>({
      query: ({ page = 0, propertyId, query, size = 10 }) => ({
        params: { page, size, ...(query?.trim() ? { query: query.trim() } : {}) },
        url: `/api/v1/tenancies/properties/${propertyId}/active`,
      }),
      providesTags: ["Tenancy"],
    }),

    listPastPropertyTenancies: builder.query<Page<TenancySummary>, { page?: number; propertyId: string; query?: string; size?: number }>({
      query: ({ page = 0, propertyId, query, size = 10 }) => ({
        params: { page, size, ...(query?.trim() ? { query: query.trim() } : {}) },
        url: `/api/v1/tenancies/properties/${propertyId}/past`,
      }),
      providesTags: ["Tenancy"],
    }),
    listPropertyTenancies: builder.query<TenancySummary[], { includePast?: boolean; propertyId: string }>({
      query: ({ includePast = false, propertyId }) => ({
        params: { includePast, propertyId },
        url: "/api/v1/tenancies",
      }),
      providesTags: ["Tenancy"],
    }),

    listMyActivePropertyRooms: builder.query<TenantRoomSummary[], void>({
      query: () => "/api/v1/tenancies/me/property-rooms",
      providesTags: ["Tenancy"],
    }),

    listMyExitRequests: builder.query<TenancyExitRequest[], void>({
      query: () => "/api/v1/tenancies/me/exit-requests",
      providesTags: ["Tenancy"],
    }),

    listMyRoomChangeRequests: builder.query<TenancyRoomChangeRequest[], void>({
      query: () => "/api/v1/tenancies/me/room-change-requests",
      providesTags: ["Tenancy"],
    }),

    createRoomChangeRequest: builder.mutation<TenancyRoomChangeRequest, CreateRoomChangeRequestPayload>({
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/v1/tenancies/me/room-change-requests",
      }),
      invalidatesTags: ["Tenancy", "Notification"],
    }),

    /**
     * The dates this tenant may leave on. Fetch before showing the exit form:
     * whole-month notice yields one fixed date, sub-month a range to pick from.
     */
    getExitCheckoutWindow: builder.query<ExitCheckoutWindow, void>({
      query: () => "/api/v1/tenancies/me/exit-requests/checkout-window",
      providesTags: ["Tenancy"],
    }),

    /**
     * The single exit route. Replaced the normal/premature split, which made the
     * tenant pick a flow based on state they could not see.
     */
    createExitRequest: builder.mutation<TenancyExitRequest, CreateExitRequestPayload>({
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/v1/tenancies/me/exit-requests",
      }),
      invalidatesTags: ["Tenancy", "Notification"],
    }),

    /**
     * Tenant asks to undo an APPROVED exit. Different from cancel, which is
     * unilateral and only works before a decision. This needs the owner's yes.
     */
    withdrawApprovedExitRequest: builder.mutation<
      TenancyExitRequest,
      { requestId: string; reason: string | null }
    >({
      query: ({ reason, requestId }) => ({
        body: { reason },
        method: "POST",
        url: `/api/v1/tenancies/me/exit-requests/${requestId}/withdraw`,
      }),
      invalidatesTags: ["Tenancy", "Notification"],
    }),

    // ----- Owner / manager request review -----

    listPropertyExitRequests: builder.query<TenancyExitRequest[], string>({
      query: (propertyId) => `/api/v1/tenancies/properties/${propertyId}/exit-requests`,
      providesTags: ["Tenancy"],
    }),

    listPropertyRoomChangeRequests: builder.query<TenancyRoomChangeRequest[], string>({
      query: (propertyId) => `/api/v1/tenancies/properties/${propertyId}/room-change-requests`,
      providesTags: ["Tenancy"],
    }),

    approveExitRequest: builder.mutation<TenancyExitRequest, { requestId: string; payload: ApproveExitRequestPayload }>({
      query: ({ payload, requestId }) => ({
        body: payload,
        method: "POST",
        url: `/api/v1/tenancies/exit-requests/${requestId}/approve`,
      }),
      invalidatesTags: ["Tenancy", "Notification"],
    }),

    rejectExitRequest: builder.mutation<TenancyExitRequest, { requestId: string; adminNotes: string | null }>({
      query: ({ adminNotes, requestId }) => ({
        body: { adminNotes },
        method: "POST",
        url: `/api/v1/tenancies/exit-requests/${requestId}/reject`,
      }),
      invalidatesTags: ["Tenancy", "Notification"],
    }),

    /**
     * Owner decides on a pending withdrawal. Approving voids the exit and the
     * tenancy returns to ACTIVE — which is why this invalidates Property and
     * Billing too: a bed stops being an upcoming vacancy and cycles resume.
     */
    decideExitWithdrawal: builder.mutation<
      TenancyExitRequest,
      { requestId: string; approved: boolean; adminNotes: string | null }
    >({
      query: ({ adminNotes, approved, requestId }) => ({
        body: { adminNotes, approved },
        method: "POST",
        url: `/api/v1/tenancies/exit-requests/${requestId}/withdrawal-decision`,
      }),
      invalidatesTags: ["Tenancy", "Notification", "Property", "BillingCycle"],
    }),

    approveRoomChangeRequest: builder.mutation<TenancyRoomChangeRequest, { requestId: string; adminNotes: string | null }>({
      query: ({ adminNotes, requestId }) => ({
        body: { adminNotes },
        method: "POST",
        url: `/api/v1/tenancies/room-change-requests/${requestId}/approve`,
      }),
      invalidatesTags: ["Tenancy", "Notification"],
    }),

    rejectRoomChangeRequest: builder.mutation<TenancyRoomChangeRequest, { requestId: string; adminNotes: string | null }>({
      query: ({ adminNotes, requestId }) => ({
        body: { adminNotes },
        method: "POST",
        url: `/api/v1/tenancies/room-change-requests/${requestId}/reject`,
      }),
      invalidatesTags: ["Tenancy", "Notification"],
    }),
    endTenancy: builder.mutation<void, EndTenancyPayload>({
      query: ({ tenancyId, ...body }) => ({
        body,
        method: "POST",
        url: `/api/v1/tenancies/${tenancyId}/end`,
      }),
      // Ending a stay can deduct a deposit, raise a one-off bill and record it
      // paid, all in one call — so every money view is stale afterwards.
      invalidatesTags: ["Tenancy", "Notification", "BillingCycle", "Deposit", "Expense"],
    }),
  }),
});

export const {
  useApproveExitRequestMutation,
  useApproveRoomChangeRequestMutation,
  useEndTenancyMutation,
  useCreateExitRequestMutation,
  useDecideExitWithdrawalMutation,
  useGetExitCheckoutWindowQuery,
  useWithdrawApprovedExitRequestMutation,
  useCreateRoomChangeRequestMutation,
  useGetMyActiveTenancyQuery,
  useLazyLookupTenantQuery,
  useListMyActivePropertyRoomsQuery,
  useListMyExitRequestsQuery,
  useListMyRoomChangeRequestsQuery,
  useListMyTenanciesQuery,
  useListPropertyExitRequestsQuery,
  useListPropertyRoomChangeRequestsQuery,
  useListActivePropertyTenanciesQuery,
  useListPastPropertyTenanciesQuery,
  useListPropertyTenanciesQuery,
  useOnboardTenantMutation,
  useRejectExitRequestMutation,
  useRejectRoomChangeRequestMutation,
} = tenancyApi;
