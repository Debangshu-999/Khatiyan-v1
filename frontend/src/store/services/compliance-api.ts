import { api } from "@/store/api";
import type { TenancySummary } from "@/store/services/tenancy-api";

export type AgreementStatus = "DRAFT" | "PENDING_ACCEPTANCE" | "ACCEPTED" | "CANCELLED";

/**
 * MAIN and MISC are both platform-authored with fixed wording — an owner decides
 * whether they appear, never what they say. CUSTOM is the owner's own prose, and
 * the reason nothing in the main run is locked: you drop the deposit clause and
 * write your own in its position.
 */
export type ClauseKind = "MAIN" | "MISC" | "CUSTOM";

/** The fourteen, in the order they are numbered. */
export const MAIN_CLAUSE_TYPES = [
  "PERIOD",
  "RENT",
  "RENT_DUE_DATE",
  "SECURITY_DEPOSIT",
  "DEPOSIT_PAYMENT",
  "USAGE_DAMAGES_REPAIRS",
  "NO_TENANCY",
  "POSSESSION",
  "ALTERATION",
  "INSPECTION",
  "CANCELLATION",
  "EARLY_EXIT",
  "OTHER_CHARGES",
  "FURNITURE_APPLIANCES",
] as const;

export type MainClauseType = (typeof MAIN_CLAUSE_TYPES)[number];

/** Short names for the clause picker. The deed itself carries its own headings. */
export const MAIN_CLAUSE_LABELS: Record<MainClauseType, string> = {
  ALTERATION: "Alteration",
  CANCELLATION: "Cancellation",
  DEPOSIT_PAYMENT: "Deposit payment",
  EARLY_EXIT: "Early exit",
  FURNITURE_APPLIANCES: "Furniture and appliances",
  INSPECTION: "Inspection",
  NO_TENANCY: "No tenancy",
  OTHER_CHARGES: "Other charges",
  PERIOD: "Period",
  POSSESSION: "Possession",
  RENT: "Rent",
  // The constant is still RENT_DUE_DATE; the clause is about a payment WINDOW,
  // because our cycles run on the tenancy's own anniversary with a grace period
  // rather than on a fixed calendar date.
  RENT_DUE_DATE: "Rent payment",
  SECURITY_DEPOSIT: "Security deposit",
  USAGE_DAMAGES_REPAIRS: "Usage, damages and repairs",
};

export type MiscClauseType =
  | "PROPERTY_CONDITION_ON_VACATING"
  | "PAINTING_AND_CLEANING_CHARGES"
  | "ELECTRICITY_AND_WATER_CHARGES"
  | "FURNITURE_NO_ALTERATIONS"
  | "FURNITURE_DAMAGE_LIABILITY"
  | "REFUNDABLE_DEPOSIT_CLEANING"
  | "SECURITY_ILLEGAL_ACTIVITY"
  | "PETS_NOT_PERMITTED"
  | "PETS_DAMAGE_LIABILITY"
  | "GST_REGISTRATION_PROHIBITED";

/**
 * How a run of clause text is set.
 *
 * <p>`PLACEHOLDER` is not an empty gap — it carries the NAME of a value that
 * onboarding will supply ("Rent Day", "Execution Date"), and renders underlined,
 * the way a printed form shows what goes on each line.
 */
export type SegmentStyle = "PLAIN" | "VALUE" | "PLACEHOLDER";

export type ClauseSegment = {
  text: string;
  style: SegmentStyle;
};

export type ClauseParagraph = {
  bullet: boolean;
  segments: ClauseSegment[];
};

export type AgreementClause = {
  kind: ClauseKind;
  mainType: MainClauseType | null;
  miscType: MiscClauseType | null;
  heading: string;
  body: ClauseParagraph[];
  /**
   * The clause's number WITHIN ITS SECTION, not its position in the document.
   * The main run numbers 1..n; the miscellaneous section starts again at 1.
   */
  displayOrder: number;
};

export type PartyBlock = {
  /** "BETWEEN" or "AND". */
  heading: string;
  /** "Landlord" or "Tenant". */
  role: string;
  body: ClauseParagraph[];
};

/**
 * Everything above clause 1.
 *
 * <p>The execution date inside `execution` is always a placeholder. A reader
 * renders the agreement's `acceptedAt` in its place once accepted — filling it
 * server-side would move the content hash at the instant of signing.
 */
export type AgreementPreamble = {
  title: string;
  execution: ClauseParagraph[];
  landlord: PartyBlock;
  tenant: PartyBlock;
  recitals: ClauseParagraph[];
};

/** A whole deed, for screens with no agreement row behind them. */
export type AgreementDeed = {
  preamble: AgreementPreamble;
  clauses: AgreementClause[];
};

export type CustomClauseSpec = {
  heading: string;
  body: string;
  /** 1-based, against the SURVIVING main run. Past the end lands at the end. */
  position: number;
};

/**
 * The owner's choices about a deed, as opposed to the deed itself.
 *
 * <p>`excludedMainClauses` names what is OFF rather than what is on, so a clause
 * added in a later release defaults to present rather than silently missing from
 * every property configured before it existed.
 */
export type AgreementTemplate = {
  excludedMainClauses: MainClauseType[];
  miscClauses: MiscClauseType[];
  customClauses: CustomClauseSpec[];
  /** Null means indefinite. */
  defaultValidityMonths: number | null;
  defaultEarlyExitRule: string;
};

export type PropertyAgreementSettings = {
  propertyId: string;
  template: AgreementTemplate;
  /** The deed those choices produce, with onboarding's values as placeholders. */
  preview: AgreementDeed;
  /** Main clauses the owner has dropped, and can put back. */
  availableMainClauses: MainClauseType[];
};

export type TenancyAgreement = {
  id: string;
  tenancyId: string;
  propertyId: string;
  status: AgreementStatus;
  preamble: AgreementPreamble | null;
  clauses: AgreementClause[];
  contentHash: string | null;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
};

/** Re-exported from the auth API, which owns the shape. */
import type { Gender } from "@/store/services/auth-api";
export type { Gender } from "@/store/services/auth-api";

/**
 * The tenant's particulars, collected at onboarding.
 *
 * <p>Only fields the account has BLANK are written back — the form renders
 * already-set ones read-only, because an owner filling this in is not editing the
 * tenant's profile. The email lands unverified.
 */
/**
 * The particulars the deed names the tenant by.
 *
 * <p>No email. A deed is fixed at signing but an account is not, so a tenant who
 * changes their address afterwards would leave the document asserting a contact
 * that no longer reaches them. The phone they authenticate with goes on the deed
 * instead, and that cannot drift the same way.
 */
export type TenantDetailsInput = {
  permanentAddress: string;
  permanentAddressPincode: string;
  dateOfBirth?: string | null;
  gender?: Gender | null;
};

export type OnboardWithAgreementPayload = {
  tenantPhone: string;
  tenantName?: string | null;
  propertyId: string;
  roomId: string;
  rentAmountPaise?: number | null;
  depositAmountPaise?: number | null;
  startDate: string;
  idCheck: {
    confirmed: boolean;
    documentType: string | null;
    lastFour: string;
  };
  /** The declaration wording as displayed; the server refuses a mismatch. */
  idCheckStatementText: string;
  device: {
    appVersion: string | null;
    brand: string | null;
    installId: string | null;
    model: string | null;
    osBuild: string | null;
    osVersion: string | null;
    platform: string | null;
  };
  tenant: TenantDetailsInput;
  /** Omit to use the property's stored template. */
  template?: AgreementTemplate | null;
  /**
   * This tenancy's agreement term. Omit to use the property default; send
   * `{ months: null }` for indefinite. The nesting is what distinguishes
   * "not specified" from "no fixed term".
   */
  term?: { months: number | null; earlyExitRule?: string | null };
};

export type OnboardWithAgreementResult = {
  tenantAccountCreated: boolean;
  tenancy: TenancySummary;
  agreement: TenancyAgreement;
};

/**
 * Whether a tenant can be onboarded here yet, and whose problem it is if not.
 *
 * <p>The gate is on the property OWNER, because the owner is the party the deed
 * names. `actorIsOwner` decides the wording: a manager cannot edit somebody
 * else's profile, so telling them to complete their own would send them to a
 * screen where everything is already filled in.
 */
export type OnboardingReadiness = {
  landlordReady: boolean;
  actorIsOwner: boolean;
  ownerName: string | null;
};

/** What the onboarding review screen asks for when previewing the deed. */
export type AgreementPreviewQuery = {
  propertyId: string;
  roomId?: string | null;
  rentAmountPaise?: number | null;
  depositAmountPaise?: number | null;
  startDate?: string | null;
  validityMonths?: number | null;
  earlyExitRule?: string | null;
  template?: AgreementTemplate | null;
  /**
   * Who the deed will name as Tenant, as far as the form knows so far.
   *
   * <p>Omitted by the settings screen, which has no tenant. Sent by onboarding
   * so the preview shows the document about to be issued rather than a blank
   * form — every field resolves as it is answered and the rest stay
   * placeholders, so it is watchable while the form is still being filled in.
   */
  tenant?: {
    fullName?: string | null;
    phone?: string | null;
    permanentAddress?: string | null;
    permanentAddressPincode?: string | null;
    dateOfBirth?: string | null;
    gender?: Gender | null;
  } | null;
  /**
   * Render as the PROPERTY's template rather than one tenancy's deed.
   *
   * <p>Onboarding values become named placeholders, and the term comes from the
   * template's own defaults rather than from this query. The settings screen sets
   * it because it previews an unsaved draft and has no tenant, room or rent to
   * state — without it the preview fell through to the tenancy path and rendered
   * every agreement as indefinite.
   */
  templateOnly?: boolean;
};

/** One clause from the opt-in library, as the picker shows it. */
export type MiscClauseOption = {
  type: MiscClauseType;
  heading: string;
  body: string;
};

/** A versioned click-wrap wording, held by the server. */
export type LegalStatement = {
  key: string;
  version: number;
  text: string;
};

/** What the server says is about to be signed, and where the code went. */
export type AgreementSigningChallenge = {
  contentHash: string;
  sentTo: string;
  statementText: string;
  statementKey: string;
  statementVersion: number;
};

/**
 * Step two of signing.
 *
 * <p>`contentHash` and `statementText` are sent to be CHECKED, not stored: the
 * server compares both against its own copies and refuses either mismatch.
 */
export type AcceptAgreementBody = {
  otp: string;
  contentHash: string;
  statementText: string;
  device: {
    appVersion: string | null;
    brand: string | null;
    installId: string | null;
    model: string | null;
    osBuild: string | null;
    osVersion: string | null;
    platform: string | null;
  };
};

export const complianceApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPropertyAgreementSettings: builder.query<PropertyAgreementSettings, string>({
      query: (propertyId) => ({ url: `/api/v1/compliance/properties/${propertyId}/agreement-settings` }),
      providesTags: ["Compliance"],
    }),

    updatePropertyAgreementSettings: builder.mutation<
      PropertyAgreementSettings,
      { propertyId: string; template: AgreementTemplate }
    >({
      query: ({ propertyId, template }) => ({
        body: { template },
        method: "PUT",
        url: `/api/v1/compliance/properties/${propertyId}/agreement-settings`,
      }),
      invalidatesTags: ["Compliance"],
    }),

    /**
     * A POST that reads nothing, because the query no longer fits in a URL.
     *
     * <p>The preview depends on the room, the term and the clause selection for
     * this stay — a whole template. Encoding an exclusion set and a list of
     * custom clauses into query parameters would be a URL nobody could debug.
     */
    previewTenancyAgreement: builder.query<AgreementDeed, AgreementPreviewQuery>({
      query: (body) => ({
        body,
        method: "POST",
        url: `/api/v1/compliance/properties/${body.propertyId}/agreement-preview`,
      }),
      providesTags: ["Compliance"],
    }),

    /**
     * Whether onboarding can start at this property.
     *
     * <p>Read on arrival so the screen can block with an explanation, instead of
     * letting someone fill in a tenant's details and collect a refusal at submit.
     */
    getOnboardingReadiness: builder.query<OnboardingReadiness, string>({
      query: (propertyId) => ({
        url: `/api/v1/compliance/properties/${propertyId}/onboarding-readiness`,
      }),
      providesTags: ["Compliance", "Profile"],
    }),

    onboardTenantWithAgreement: builder.mutation<OnboardWithAgreementResult, OnboardWithAgreementPayload>({
      query: (body) => ({ body, method: "POST", url: "/api/v1/compliance/tenancies/onboard-with-agreement" }),
      invalidatesTags: ["Compliance", "Tenancy", "Notification"],
    }),

    getTenancyAgreement: builder.query<TenancyAgreement, string>({
      query: (tenancyId) => ({ url: `/api/v1/compliance/tenancies/${tenancyId}/agreement` }),
      providesTags: ["Compliance"],
    }),

    /**
     * Amends a pending deed by replacing its template.
     *
     * <p>Replaces the old custom-clauses-only edit: dropping a main clause and
     * writing your own wording in its place is ONE action, and a request that
     * could only append prose could not express it.
     */
    updateTenancyAgreementTemplate: builder.mutation<
      TenancyAgreement,
      { tenancyId: string; template: AgreementTemplate }
    >({
      query: ({ template, tenancyId }) => ({
        body: { template },
        method: "PUT",
        url: `/api/v1/compliance/tenancies/${tenancyId}/agreement/template`,
      }),
      invalidatesTags: ["Compliance"],
    }),

    getMyAgreement: builder.query<TenancyAgreement, void>({
      query: () => ({ url: "/api/v1/compliance/me/agreement" }),
      providesTags: ["Compliance"],
    }),

    /**
     * The opt-in clause library, with its full wording.
     *
     * <p>Served rather than bundled. The picker shows each clause's whole text —
     * that is the entire basis on which an owner ticks it — and a second copy in
     * TypeScript would drift from the one written into agreements, leaving no way
     * to tell which of the two a given owner had read.
     */
    listMiscClauses: builder.query<MiscClauseOption[], void>({
      query: () => "/api/v1/compliance/misc-clauses",
    }),

    /**
     * The wording for one click-wrap.
     *
     * <p>Fetched rather than kept in the bundle. The server refuses an
     * acceptance whose text does not match its own copy, so a build shipping
     * its own version of these words would simply stop working — which is the
     * point: what somebody agreed to cannot be decided by their app.
     */
    getLegalStatement: builder.query<LegalStatement, string>({
      query: (key) => `/api/v1/compliance/legal-statements/${key}`,
    }),

    /**
     * Step one of signing: sends the code and says what is about to be signed.
     *
     * <p>Returns the agreement's content hash, which step two sends back. The
     * server refuses a mismatch, so a signature cannot attach to a deed that
     * changed while it was being read.
     */
    startAgreementSigning: builder.mutation<AgreementSigningChallenge, void>({
      query: () => ({ method: "POST", url: "/api/v1/compliance/me/agreement/signing-code" }),
    }),

    acceptMyAgreement: builder.mutation<TenancyAgreement, AcceptAgreementBody>({
      query: (body) => ({ body, method: "POST", url: "/api/v1/compliance/me/agreement/accept" }),
      invalidatesTags: ["Compliance", "Tenancy", "BillingCycle", "Deposit", "Profile"],
    }),

    declineMyAgreement: builder.mutation<void, void>({
      query: () => ({ method: "POST", url: "/api/v1/compliance/me/agreement/decline" }),
      invalidatesTags: ["Compliance", "Tenancy", "Profile"],
    }),

    /**
     * Owner/manager withdraws a tenancy the tenant never accepted.
     *
     * <p>Invalidates Property as well as Tenancy: the pending stay was holding
     * a bed, and cancelling frees it. The owner dashboard is tagged "Tenancy",
     * so the action centre's unsigned-agreement count refreshes with the list.
     */
    cancelPendingTenancy: builder.mutation<void, { reason?: string; tenancyId: string }>({
      query: ({ reason, tenancyId }) => ({
        body: { reason },
        method: "POST",
        url: `/api/v1/compliance/tenancies/${tenancyId}/agreement/cancel`,
      }),
      invalidatesTags: ["Compliance", "Tenancy", "Property"],
    }),
  }),
  // Fast Refresh re-runs this whole module on every edit, so injectEndpoints
  // sees endpoints it already registered and logs an error for each one — two
  // dozen of them behind a red overlay, none of them real. Allowed in dev for
  // that reason; "throw" in production, where the module runs once and a second
  // registration really would be a duplicate name.
  overrideExisting: __DEV__ ? true : "throw",
});

export const {
  useAcceptMyAgreementMutation,
  useStartAgreementSigningMutation,
  useGetLegalStatementQuery,
  useCancelPendingTenancyMutation,
  useDeclineMyAgreementMutation,
  useGetMyAgreementQuery,
  useGetOnboardingReadinessQuery,
  useGetPropertyAgreementSettingsQuery,
  useGetTenancyAgreementQuery,
  useListMiscClausesQuery,
  useOnboardTenantWithAgreementMutation,
  usePreviewTenancyAgreementQuery,
  useUpdatePropertyAgreementSettingsMutation,
  useUpdateTenancyAgreementTemplateMutation,
} = complianceApi;
