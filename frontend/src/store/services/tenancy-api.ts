import { api } from "@/store/api";
import type { Page } from "@/store/pagination";

export type TenancyBillingType = "DAILY" | "MONTHLY";
export type TenancyStatus = "ACTIVE" | "ON_NOTICE" | "ON_PREMATURE_NOTICE" | "EXITED" | "EVICTED";

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

export type TenancyExitRequestType = "NORMAL_NOTICE" | "PREMATURE";
export type TenancyExitRequestStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXECUTED";

export type TenancyExitRequest = {
  id: string;
  tenancyId: string;
  tenantUserId: string;
  propertyId: string;
  roomId: string;
  type: TenancyExitRequestType;
  status: TenancyExitRequestStatus;
  requestedCheckoutDate: string;
  approvedCheckoutDate: string | null;
  tenantReason: string;
  adminNotes: string | null;
  finalBillingAmountPaise: number | null;
  depositPayable: boolean | null;
  depositSettlementAmountPaise: number | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TenancyRoomChangeRequestStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXECUTED";

export type TenancyRoomChangeRequest = {
  id: string;
  tenancyId: string;
  tenantUserId: string;
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
  decidedAt: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateRoomChangeRequestPayload = {
  reason: string | null;
  targetRoomId: string;
};

export type CreateNormalExitRequestPayload = {
  reason: string | null;
};

export type CreatePrematureExitRequestPayload = {
  reason: string | null;
  requestedCheckoutDate: string;
};

export type ApproveExitRequestPayload = {
  approvedCheckoutDate?: string | null;
  finalBillingAmountPaise?: number | null;
  depositPayable?: boolean | null;
  depositSettlementAmountPaise?: number | null;
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
};

export type TenancyOnboardingResult = {
  tenantAccountCreated: boolean;
  tenancy: TenancySummary;
};

export const tenancyApi = api.injectEndpoints({
  endpoints: (builder) => ({
    lookupTenant: builder.query<TenantLookup, string>({
      query: (phone) => ({ url: "/api/v1/tenancies/tenant-lookup", params: { phone } }),
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

    createNormalExitRequest: builder.mutation<TenancyExitRequest, CreateNormalExitRequestPayload>({
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/v1/tenancies/me/exit-requests/normal",
      }),
      invalidatesTags: ["Tenancy", "Notification"],
    }),

    createPrematureExitRequest: builder.mutation<TenancyExitRequest, CreatePrematureExitRequestPayload>({
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/v1/tenancies/me/exit-requests/premature",
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
    endTenancy: builder.mutation<void, string>({
      query: (tenancyId) => ({
        method: "POST",
        url: `/api/v1/tenancies/${tenancyId}/end`,
      }),
      invalidatesTags: ["Tenancy", "Notification", "BillingCycle", "Deposit"],
    }),
  }),
});

export const {
  useApproveExitRequestMutation,
  useApproveRoomChangeRequestMutation,
  useEndTenancyMutation,
  useCreateNormalExitRequestMutation,
  useCreatePrematureExitRequestMutation,
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
