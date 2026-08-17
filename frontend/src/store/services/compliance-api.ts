import { api } from "@/store/api";
import type { TenancySummary } from "@/store/services/tenancy-api";

export type AgreementStatus = "DRAFT" | "PENDING_ACCEPTANCE" | "ACCEPTED" | "CANCELLED";
export type ClauseKind = "SYSTEM" | "CUSTOM";

export type SystemClauseType =
  | "RENT"
  | "SECURITY_DEPOSIT"
  | "NOTICE_PERIOD"
  | "VALIDITY"
  // Legacy name for VALIDITY. Agreements signed before the rename are frozen and
  // keep it forever, so every reader must still accept it.
  | "LOCK_IN"
  | "GRACE_DAYS"
  | "LATE_FEE"
  | "CLEANING_FEE"
  | "ALLOWED_DEDUCTIONS"
  | "DAMAGE_CATALOG"
  | "EXIT_PREREQUISITES"
  // Derived from the property's exit policies, and only for an indefinite term.
  | "PREMATURE_EXIT";

export type AgreementClause = {
  kind: ClauseKind;
  systemType: SystemClauseType | null;
  heading: string;
  body: string;
  value: Record<string, unknown> | null;
  displayOrder: number;
};

export type PropertyAgreementSettings = {
  propertyId: string;
  defaultClauses: AgreementClause[];
};

export type TenancyAgreement = {
  id: string;
  tenancyId: string;
  propertyId: string;
  status: AgreementStatus;
  clauses: AgreementClause[];
  contentHash: string | null;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
};

export type CustomClauseInput = {
  heading: string;
  body: string;
};

export type OnboardWithAgreementPayload = {
  tenantPhone: string;
  tenantName?: string | null;
  propertyId: string;
  roomId: string;
  rentAmountPaise?: number | null;
  depositAmountPaise?: number | null;
  startDate: string;
  idCheckConfirmed: boolean;
  customClauses?: CustomClauseInput[] | null;
  /**
   * This tenancy's agreement term. Omit to use the property default; send
   * `{ months: null }` for indefinite. The nesting is what distinguishes
   * "not specified" from "no fixed term".
   */
  term?: { months: number | null };
  /**
   * Deduction categories for this tenancy — a narrowing of the property's set.
   * Omit to use the property default.
   */
  permittedDeductions?: string[];
};

export type OnboardWithAgreementResult = {
  tenantAccountCreated: boolean;
  tenancy: TenancySummary;
  agreement: TenancyAgreement;
};

// System rules derived from the property/tenancy (not stored on compliance
// settings). Used by the UI to group and label locked rules. Damage charges and
// the move-out checklist are property exit policies, also derived at assembly.
export const PROPERTY_DERIVED_CLAUSE_TYPES: SystemClauseType[] = [
  "RENT",
  "SECURITY_DEPOSIT",
  "NOTICE_PERIOD",
  "GRACE_DAYS",
  "LATE_FEE",
  "DAMAGE_CATALOG",
  "EXIT_PREREQUISITES",
  "PREMATURE_EXIT",
];

export const complianceApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPropertyAgreementSettings: builder.query<PropertyAgreementSettings, string>({
      query: (propertyId) => ({ url: `/api/v1/compliance/properties/${propertyId}/agreement-settings` }),
      providesTags: ["Compliance"],
    }),

    updatePropertyAgreementSettings: builder.mutation<
      PropertyAgreementSettings,
      { propertyId: string; defaultClauses: AgreementClause[] }
    >({
      query: ({ defaultClauses, propertyId }) => ({
        body: { defaultClauses },
        method: "PUT",
        url: `/api/v1/compliance/properties/${propertyId}/agreement-settings`,
      }),
      invalidatesTags: ["Compliance"],
    }),

    previewTenancyAgreement: builder.query<
      AgreementClause[],
      { propertyId: string; rentAmountPaise?: number | null; depositAmountPaise?: number | null }
    >({
      query: ({ depositAmountPaise, propertyId, rentAmountPaise }) => ({
        params: {
          ...(rentAmountPaise != null ? { rentAmountPaise } : {}),
          ...(depositAmountPaise != null ? { depositAmountPaise } : {}),
        },
        url: `/api/v1/compliance/properties/${propertyId}/agreement-preview`,
      }),
      providesTags: ["Compliance"],
    }),

    onboardTenantWithAgreement: builder.mutation<OnboardWithAgreementResult, OnboardWithAgreementPayload>({
      query: (body) => ({ body, method: "POST", url: "/api/v1/compliance/tenancies/onboard-with-agreement" }),
      invalidatesTags: ["Compliance", "Tenancy", "Notification"],
    }),

    getTenancyAgreement: builder.query<TenancyAgreement, string>({
      query: (tenancyId) => ({ url: `/api/v1/compliance/tenancies/${tenancyId}/agreement` }),
      providesTags: ["Compliance"],
    }),

    updateTenancyAgreementCustomClauses: builder.mutation<
      TenancyAgreement,
      { tenancyId: string; customClauses: CustomClauseInput[] }
    >({
      query: ({ customClauses, tenancyId }) => ({
        body: { customClauses },
        method: "PUT",
        url: `/api/v1/compliance/tenancies/${tenancyId}/agreement/custom-clauses`,
      }),
      invalidatesTags: ["Compliance"],
    }),

    getMyAgreement: builder.query<TenancyAgreement, void>({
      query: () => ({ url: "/api/v1/compliance/me/agreement" }),
      providesTags: ["Compliance"],
    }),

    acceptMyAgreement: builder.mutation<TenancyAgreement, void>({
      query: () => ({ method: "POST", url: "/api/v1/compliance/me/agreement/accept" }),
      invalidatesTags: ["Compliance", "Tenancy", "BillingCycle", "Deposit", "Profile"],
    }),

    declineMyAgreement: builder.mutation<void, void>({
      query: () => ({ method: "POST", url: "/api/v1/compliance/me/agreement/decline" }),
      invalidatesTags: ["Compliance", "Tenancy", "Profile"],
    }),
  }),
});

export const {
  useAcceptMyAgreementMutation,
  useDeclineMyAgreementMutation,
  useGetMyAgreementQuery,
  useGetPropertyAgreementSettingsQuery,
  useGetTenancyAgreementQuery,
  useOnboardTenantWithAgreementMutation,
  usePreviewTenancyAgreementQuery,
  useUpdatePropertyAgreementSettingsMutation,
  useUpdateTenancyAgreementCustomClausesMutation,
} = complianceApi;
