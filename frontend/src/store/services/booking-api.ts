import { api, ifMatch } from "@/store/api";
import type { Page } from "@/store/pagination";
import type { Gender } from "@/store/services/auth-api";
import type { ManualPaymentMethod } from "@/store/services/billing-api";
import type {
  OnboardWithAgreementPayload,
  OnboardWithAgreementResult,
  TenantDetailsInput,
} from "@/store/services/compliance-api";
import type { PayeeDetails } from "@/store/services/payment-intent-api";
import type { PgFor, RoomAmenity, RoomConditioning, RoomType } from "@/store/services/property-api";

/**
 * Post-visit bookings: a visitor asks for a bed, both sides agree a rent, a
 * token the app only records confirms it, and the property onboards them when
 * they arrive.
 *
 * <p>Every "can" is decided by the server. A screen shows a button for each
 * entry in `allowedActions`, `allowedTokenActions` and `allowedMoveInActions`
 * and works no rule out for itself, so it never offers what would be refused.
 *
 * <p>A step that changes a booking the screen has loaded sends the `version`
 * it loaded. One built on an older version is refused, and the screen
 * refreshes.
 */

export type BookingStatus =
  | "AWAITING_HANDLER"
  | "AWAITING_TENANT"
  | "AWAITING_TOKEN"
  | "TOKEN_RECEIVED"
  | "CONFIRMED"
  | "CANCELLED"
  | "EXPIRED"
  /** The stay created from it has started. */
  | "MOVED_IN";

export type BookingParty = "TENANT" | "MANAGEMENT";

export type BookingAction = "ACCEPT" | "CONFIRM" | "COUNTER" | "CANCEL";

export type BookingTokenAction =
  /** Tenant: "I've paid". Never cash, which the property records itself. */
  | "CLAIM_PAID"
  | "MARK_RECEIVED"
  | "MARK_NOT_RECEIVED"
  /** Owner only. */
  | "WAIVE"
  /** Property, for a guest who did not arrive (2026-10-28): the token is owed back, "Refundable". */
  | "REFUND_TOKEN"
  /** Property, for a guest who did not arrive: the token is "Kept". */
  | "KEEP_TOKEN";

export type BookingMoveInAction =
  /** Tenant: move the date to a later day, once, before the day itself. */
  | "PUSH_DATE"
  /** Property: the tenant has arrived, onboard them. Anyone who may onboard. */
  | "CONVERT"
  | "CLOSE_DID_NOT_ARRIVE"
  | "OFFER_ANOTHER_BED"
  /** Property: the booked bed is occupied, move the booking to a free one now (2026-10-27). */
  | "MOVE_TO_ANOTHER_BED"
  | "ACCEPT_ANOTHER_BED"
  | "DECLINE_ANOTHER_BED"
  /** Tenant: the bed is still not ready, leave with the token owed back. */
  | "LEAVE_BED_NOT_READY";

export type BookingTokenStatus =
  | "NOT_REQUIRED"
  | "DUE"
  | "CLAIMED"
  | "NOT_RECEIVED"
  | "RECEIVED"
  /** Taken off the stay's first bill. */
  | "ADJUSTED"
  /** "Kept": the tenant walked away under a keep rule, the handler kept it, or the booking was onboarded. */
  | "KEPT"
  /** "Refundable": owed back. Refunds are not followed (2026-10-28). */
  | "REFUND_DUE"
  /** "Action pending": the guest did not arrive, and the handler refunds or keeps it. */
  | "DECISION_PENDING";

export type BookingEndCause =
  | "MOVED_IN"
  | "TENANT_CANCELLED"
  | "TENANT_DID_NOT_SIGN"
  | "TENANT_DID_NOT_ARRIVE"
  | "BOOKED_ELSEWHERE"
  | "MANAGEMENT_CANCELLED"
  | "BED_NOT_READY"
  | "PROPERTY_CANNOT_HOST";

export type BookingActionType =
  | "SUBMITTED"
  | "EXPIRED"
  | "ASSIGNED"
  | "UNASSIGNED"
  | "COUNTERED"
  | "FINAL_OFFER"
  | "AGREED"
  | "CONFIRMED"
  | "CANCELLED"
  | "WITHDRAWN"
  | "TOKEN_LAPSED"
  | "TOKEN_CLAIMED"
  | "TOKEN_RECEIVED"
  | "TOKEN_NOT_RECEIVED"
  | "TOKEN_WAIVED"
  /** Earlier history only: refunds are not followed since 2026-10-28. */
  | "TOKEN_REFUND_SENT"
  | "TOKEN_REFUND_CONFIRMED"
  | "TOKEN_REFUND_DISPUTED"
  | "TOKEN_REFUND_OWED"
  | "TOKEN_KEPT"
  | "CONVERTED"
  | "MOVED_IN"
  | "DATE_PUSHED"
  | "BED_OFFERED"
  | "BED_OFFER_ACCEPTED"
  | "BED_OFFER_DECLINED"
  /** The property moved the booking to another room because its bed was occupied (2026-10-27). */
  | "BED_MOVED";

export type BookingAssignmentMode = "FIRST_VIEW" | "SYSTEM_TURNS";

export type BookingListFilter = "OPEN" | "HISTORY";

export type BookingOffer = {
  sequence: number;
  madeBy: BookingParty;
  monthlyRentPaise: number;
  /** False for the property's last word, which the tenant cannot counter. */
  negotiable: boolean;
  madeAt: string;
};

/** Which side did it, never who. `party` is null for something the system did. */
export type BookingHistoryItem = {
  type: BookingActionType;
  party: BookingParty | null;
  offerSequence: number | null;
  statusAfter: BookingStatus;
  note: string | null;
  occurredAt: string;
};

export type BookingTokenClaim = {
  sequence: number;
  method: ManualPaymentMethod;
  /** Handed over at the property's desk. The only way cash, a card or a cheque is recorded. */
  paidAtDesk: boolean;
  reference: string | null;
  proofImageUrls: string[];
  claimedAt: string;
  /** Null while the property has not answered. */
  answer: "RECEIVED" | "NOT_RECEIVED" | null;
  /** Why it was not counted as received. Shown to the tenant. */
  answerReason: string | null;
  answeredAt: string | null;
};

export type BookingToken = {
  status: BookingTokenStatus;
  amountPaise: number;
  /** The owner's answer, as the tenant saw it when they asked for the bed. */
  refundableOnTenantCancel: boolean;
  dueAt: string | null;
  /** The tenant says they paid and the property has not answered. The clock is stopped. */
  claimWaiting: boolean;
  /** The receipt's short code, once received. */
  receiptCode: string | null;
  receivedMethod: ManualPaymentMethod | null;
  receivedReference: string | null;
  receivedAt: string | null;
  waivedAt: string | null;
  refundDueSince: string | null;
  claims: BookingTokenClaim[];
};

/** Another bed, offered in place of one still occupied. Taking it changes the room and the rent. */
export type BookingBedOffer = {
  sequence: number;
  roomId: string;
  roomNumber: string;
  monthlyRentPaise: number;
  offeredAt: string;
};

export type BookingRequest = {
  id: string;
  /** The short code shown to people, never the id. */
  referenceCode: string;
  propertyId: string;
  propertyName: string;
  roomId: string;
  roomNumber: string;
  /** The booked room type's current photos, first one first; empty when unavailable. */
  roomImageUrls: string[];
  /** Current display metadata; the agreed room/rent/term snapshots remain unchanged. */
  roomConditioning: RoomConditioning | null;
  roomCapacity: number | null;
  roomFloor: string | null;
  roomAmenities: RoomAmenity[];
  roomCustomAmenities: string[];
  /** A bed somebody is leaving, not one free on the day it was asked for. */
  futureBed: boolean;
  /** As it stands at the moment of reading: past its time reads EXPIRED at once. */
  status: BookingStatus;
  /** YYYY-MM-DD, like every date here. */
  bookingDate: string;
  earliestMoveInDate: string;
  latestMoveInDate: string;
  /** The date first asked for. Differs from `moveInDate` only after the one push. */
  originalMoveInDate: string;
  moveInDate: string;
  submittedAt: string;
  /** When the request runs out with no terms agreed. */
  expiresAt: string;
  closedAt: string | null;
  agreedAt: string | null;
  agreedRentPaise: number | null;
  /** When the token must have arrived, once terms are agreed where one is taken. */
  tokenDueAt: string | null;
  confirmedAt: string | null;
  endCause: BookingEndCause | null;
  /** Null where the system ended it. */
  cancelledBy: BookingParty | null;
  cancelReason: string | null;
  /** Null for an agreement with no fixed term. */
  agreementMonths: number | null;
  listedRentPaise: number;
  currentRentPaise: number;
  /** Sent back with accept, counter and offer, so an answer names the offer it answers. */
  currentOfferSequence: number;
  currentOfferBy: BookingParty;
  currentOfferNegotiable: boolean;
  depositPaise: number;
  tokenRequired: boolean;
  /** Zero once the owner has waived it. */
  tokenPaise: number;
  tokenRefundable: boolean;
  /** Deposit plus the first month at the rent on the table, less the token. */
  dueAtMoveInPaise: number;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string | null;
  tenantGender: Gender;
  tenantDateOfBirth: string;
  handlerUserId: string | null;
  handlerName: string | null;
  allowedActions: BookingAction[];
  /** Null before terms are agreed, and where the property takes no token. */
  token: BookingToken | null;
  allowedTokenActions: BookingTokenAction[];
  /** The stay created from it when the tenant arrived. */
  tenancyId: string | null;
  convertedAt: string | null;
  /** Null except on a confirmed booking whose move-in day has come. */
  bedReady: boolean | null;
  allowedMoveInActions: BookingMoveInAction[];
  moveInDatePushed: boolean;
  /** The latest day the move-in date may be pushed to. */
  latestPushDate: string;
  bedOffer: BookingBedOffer | null;
  offers: BookingOffer[];
  history: BookingHistoryItem[];
  /** Sent back as If-Match with every step that changes the booking. */
  version: number;
};

export type BookingRequestListItem = {
  id: string;
  referenceCode: string;
  propertyId: string;
  propertyName: string;
  roomNumber: string;
  tenantName: string;
  status: BookingStatus;
  moveInDate: string;
  listedRentPaise: number;
  currentRentPaise: number;
  currentOfferBy: BookingParty;
  handlerUserId: string | null;
  handlerName: string | null;
  /** Whether the reader is the one who handles it. Only they open a confirmed booking from its list. */
  handledByReader: boolean;
  /**
   * Whether the reader can chat about it (user, 2026-10-27): a booking made in the app, read by the
   * person who booked or by whoever handles it (the owner while nobody does).
   */
  canChat: boolean;
  /** For a confirmed booking: whether its bed is free for them now. Null otherwise (2026-10-27). */
  bedReady: boolean | null;
  submittedAt: string;
  expiresAt: string;
  version: number;
};

export type BookingRequestCounts = {
  awaitingHandler: number;
  awaitingTenant: number;
  awaitingToken: number;
  tokenReceived?: number;
  confirmed: number;
};

export type BookingFormFutureBed = {
  exitRequestId: string;
  /** The day the bed is left. Who is leaving is never sent. */
  checkoutDate: string;
  earliestMoveInDate: string;
  latestMoveInDate: string;
};

/** One of the property's rooms. Every active room is sent, so one that cannot be booked is shown as such. */
export type BookingFormRoom = {
  roomId: string;
  roomNumber: string;
  floor: string | null;
  roomType: RoomType;
  conditioning: RoomConditioning;
  /** How many beds the room has. Never inferred from its sharing type. */
  capacity: number;
  listedRentPaise: number;
  /** The room's own amenities, by name. */
  amenities: string[];
  /** Ones the owner typed in. */
  customAmenities: string[];
  /** Beds free today, which take any date inside the bounds. */
  freeBeds: number;
  /** Beds being vacated, each with the dates it can be asked for. */
  futureBeds: BookingFormFutureBed[];
  /** Whether any bed in it can be asked for. */
  available: boolean;
  unavailableReason: "FULL" | "MAINTENANCE" | null;
  /** Photos of the room's type, in the owner's order. Empty where there are none. */
  imageUrls: string[];
};

/** A room with a bed free today, for the person offering a tenant another bed. */
export type BookingBedOption = {
  roomId: string;
  roomNumber: string;
  floor: string | null;
  roomType: RoomType;
  conditioning: RoomConditioning;
  capacity: number;
  listedRentPaise: number;
  freeBeds: number;
  /** The same type and AC as the room they booked: offered first (2026-10-27). */
  sameKind: boolean;
};

/** Everything the booking form needs for one attended visit. Reading it holds nothing. */
export type BookingFormOptions = {
  canBook: boolean;
  /** What is in the way, in words to show. Null when a request can be sent. */
  whyNot: string | null;
  enquiryId: string;
  propertyId: string;
  propertyName: string | null;
  propertyArea: string | null;
  propertyCity: string | null;
  /** The day of the attended visit this form is for. */
  visitedOn: string | null;
  windowEndsOn: string | null;
  requestsLeft: number;
  existingRequestId: string | null;
  earliestMoveInDate: string | null;
  latestMoveInDate: string | null;
  /** The last day of a stay elsewhere, which is why the first day can be later than three days out. */
  currentStayEndsOn: string | null;
  depositPaise: number;
  tokenRequired: boolean;
  tokenAmountPaise: number;
  tokenRefundable: boolean;
  pgFor: PgFor | null;
  rooms: BookingFormRoom[];
};

export type CreateBookingRequestPayload = {
  enquiryId: string;
  roomId: string;
  /** Set for a bed being vacated. Left out for one free today. */
  exitRequestId?: string | null;
  moveInDate: string;
  /** Left out to ask at the listed rent. */
  proposedRentPaise?: number | null;
  /** 1 to 11, or left out for no fixed term. */
  agreementMonths?: number | null;
  name: string;
  phone: string;
  email?: string | null;
  gender: Gender;
  dateOfBirth: string;
  /** Made once per tap of Send, so a retry makes one request. */
  idempotencyKey: string;
};

export type BookingTokenPayDetails = {
  referenceCode: string;
  amountPaise: number;
  refundableOnTenantCancel: boolean;
  dueAt: string | null;
  /** Null where the property takes neither UPI nor a bank transfer. */
  payee: PayeeDetails | null;
  /** Every way a token reaches the property. UPI and bank transfer are what is paid from elsewhere. */
  acceptedMethods: ManualPaymentMethod[];
  /** How a token may be handed over at the desk and recorded as paid there: cash, UPI, card, cheque. */
  deskMethods: ManualPaymentMethod[];
};

export type BookingCashCode = {
  /** The last four digits of the number it went to. */
  sentTo: string;
  amountPaise: number;
  expiresAt: string;
};

/** A phone number's booking at a property, for onboarding to offer "Convert the booking". */
export type BookingConvertible = {
  requestId: string;
  referenceCode: string;
  status: BookingStatus;
  roomId: string;
  roomNumber: string;
  moveInDate: string;
  agreedRentPaise: number | null;
  depositPaise: number;
  agreementMonths: number | null;
  tenantName: string;
  tenantGender: Gender;
  tenantDateOfBirth: string;
  canConvertNow: boolean;
  whyNot: string | null;
  /** Sent back as If-Match when converting. */
  version: number;
};

/**
 * What the person converting takes from the tenant on arrival. The room, rent,
 * deposit, term and phone number are the booking's own and are never sent.
 */
export type ConvertBookingPayload = {
  idCheck?: OnboardWithAgreementPayload["idCheck"];
  idCheckStatementText?: OnboardWithAgreementPayload["idCheckStatementText"];
  verification?: OnboardWithAgreementPayload["verification"];
  device?: OnboardWithAgreementPayload["device"];
  tenant: TenantDetailsInput;
  earlyExitRule?: string | null;
  /** This stay's clauses, edited on the agreement step. The booking agreed the money and the term, not the deed. */
  template?: OnboardWithAgreementPayload["template"];
  /** The room's condition at move-in (2026-10-29). Null when the step was skipped. */
  moveInChecklist?: OnboardWithAgreementPayload["moveInChecklist"];
  /** This stay's own move-out checklist (2026-10-29). */
  moveOutChecklist?: string[] | null;
};

export type BookingConversion = {
  bookingId: string;
  referenceCode: string;
  /** The stay and its agreement, as ordinary onboarding answers. */
  stay: OnboardWithAgreementResult;
};

/** One token the property received, and what became of it. */
export type BookingTokenLedgerItem = {
  requestId: string;
  /** The booking's short code, never its id. */
  bookingReferenceCode: string;
  receiptCode: string;
  tenantName: string;
  roomNumber: string;
  moveInDate: string;
  amountPaise: number;
  /** RECEIVED is still held for a booking to start. KEPT is the tenant's penalty for walking away. */
  status: BookingTokenStatus;
  receivedMethod: ManualPaymentMethod;
  receivedReference: string | null;
  receivedAt: string;
  bookingStatus: BookingStatus;
  /** Why the booking ended, which is why a token was kept or owed back. */
  endCause: BookingEndCause | null;
  refundDueSince: string | null;
  /** Whether the reader may refund or keep it now: a no-show's token. The server decides, as for every "can". */
  canDecide: boolean;
  /** The booking's version, sent back as If-Match with that step. */
  version: number;
};

/** The states a token that arrived can be in, in the order the Tokens screen's filter lists them. */
export const RECEIVED_TOKEN_STATUSES: BookingTokenStatus[] = ["RECEIVED", "DECISION_PENDING", "REFUND_DUE", "KEPT", "ADJUSTED"];

/** Every token a property has received. The totals cover all of them, not only the page shown. */
export type BookingTokenLedger = {
  summary: {
    count: number;
    collectedPaise: number;
    /** Received for bookings still to start. */
    heldPaise: number;
    /** Taken off a first bill at move-in. */
    adjustedPaise: number;
    /** Kept because the tenant walked away. Counted as income. */
    keptPaise: number;
    refundDuePaise: number;
    /** A guest did not arrive and the handler has not decided yet. */
    pendingPaise: number;
  };
  tokens: Page<BookingTokenLedgerItem>;
};

export type BookingSettings = {
  propertyId: string;
  /** False until the owner's first save. Until then the property takes no requests. */
  configured: boolean;
  tokenRequired: boolean;
  tokenAmountPaise: number | null;
  tokenRefundable: boolean | null;
  maximumAdvanceDays: number;
  showFutureVacancies: boolean;
  assignmentMode: BookingAssignmentMode;
  includeOwnerInTurns: boolean;
  /** The soonest a move-in may be asked for. Fixed, with the maximum: not the owner's to set. */
  minimumAdvanceDays: number;
  /** How far a confirmed date may be moved, once. */
  datePushMaximumDays: number;
  /** Null before the first save. */
  version: number | null;
};

export type SaveBookingSettingsPayload = {
  tokenRequired: boolean;
  tokenAmountPaise?: number | null;
  tokenRefundable?: boolean | null;
  showFutureVacancies: boolean;
  assignmentMode?: BookingAssignmentMode | null;
  includeOwnerInTurns?: boolean | null;
};

/** A step on the tenant's own booking: which one, and the version the screen loaded. */
type MyStep = { requestId: string; version: number };
/** A step on a booking at a property. */
type PropertyStep = { propertyId: string; requestId: string; version: number };

const mine = (requestId: string) => `/api/v1/booking-requests/${requestId}`;
const atProperty = (propertyId: string, requestId: string) =>
  `/api/v1/properties/${propertyId}/booking-requests/${requestId}`;

export const bookingApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // ---- The tenant ---------------------------------------------------------

    getBookingFormOptions: builder.query<BookingFormOptions, string>({
      query: (enquiryId) => `/api/v1/booking-requests/options?enquiryId=${enquiryId}`,
      providesTags: ["Booking"],
    }),

    createBookingRequest: builder.mutation<BookingRequest, CreateBookingRequestPayload>({
      query: (body) => ({ body, method: "POST", url: "/api/v1/booking-requests" }),
      invalidatesTags: ["Booking"],
    }),

    getMyBookingRequests: builder.query<Page<BookingRequestListItem>, { page: number }>({
      query: ({ page }) => `/api/v1/booking-requests?page=${page}&size=20`,
      providesTags: ["Booking"],
    }),

    // Tabs/search cover the whole personal collection, not just the first page.
    // Refocus, refresh and Booking invalidations re-read every page together.
    getMyBookings: builder.query<BookingRequestListItem[], void>({
      async queryFn(_arg, _queryApi, _options, baseQuery) {
        const first = await baseQuery("/api/v1/booking-requests?page=0&size=20");
        if (first.error) return { error: first.error };
        const firstPage = first.data as Page<BookingRequestListItem>;
        const items = new Map(firstPage.items.map((item) => [item.id, item]));
        for (let page = 1; page < firstPage.totalPages; page += 1) {
          const result = await baseQuery(`/api/v1/booking-requests?page=${page}&size=20`);
          // Never show incomplete counts or a false empty tab after a failed page.
          if (result.error) return { error: result.error };
          for (const item of (result.data as Page<BookingRequestListItem>).items) items.set(item.id, item);
        }
        return { data: [...items.values()] };
      },
      providesTags: ["Booking"],
    }),

    getMyBookingRequest: builder.query<BookingRequest, string>({
      query: (requestId) => mine(requestId),
      providesTags: ["Booking"],
    }),

    acceptBookingOffer: builder.mutation<BookingRequest, MyStep & { offerSequence: number }>({
      query: ({ offerSequence, requestId, version }) => ({
        body: { offerSequence },
        headers: ifMatch(version),
        method: "POST",
        url: `${mine(requestId)}/accept`,
      }),
      invalidatesTags: ["Booking"],
    }),

    counterBookingOffer: builder.mutation<BookingRequest, MyStep & { offerSequence: number; rentPaise: number }>({
      query: ({ offerSequence, rentPaise, requestId, version }) => ({
        body: { offerSequence, rentPaise },
        headers: ifMatch(version),
        method: "POST",
        url: `${mine(requestId)}/counter`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** Withdraws a request or cancels a booking, until a stay has been created from it. */
    cancelMyBooking: builder.mutation<BookingRequest, MyStep & { reason: string }>({
      query: ({ requestId, version, reason }) => ({
        body: { reason },
        headers: ifMatch(version),
        method: "POST",
        url: `${mine(requestId)}/cancel`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** The chat about the reader's own booking, opened or created (user, 2026-10-27). */
    openMyBookingChat: builder.mutation<{ threadId: string }, { requestId: string }>({
      query: ({ requestId }) => ({ method: "POST", url: `${mine(requestId)}/chat` }),
      invalidatesTags: ["Chat", "Booking"],
    }),

    /** Only once terms are agreed, and only while the token is owed. */
    getBookingTokenPayDetails: builder.query<BookingTokenPayDetails, string>({
      query: (requestId) => `${mine(requestId)}/token/pay-details`,
      providesTags: ["Booking"],
    }),

    claimBookingTokenPaid: builder.mutation<
      BookingRequest,
      MyStep & { method: ManualPaymentMethod; paidAtDesk?: boolean; reference?: string | null; proofImageUrls?: string[] }
    >({
      query: ({ method, paidAtDesk, proofImageUrls, reference, requestId, version }) => ({
        body: { method, paidAtDesk: paidAtDesk ?? false, proofImageUrls: proofImageUrls ?? [], reference: reference ?? null },
        headers: ifMatch(version),
        method: "POST",
        url: `${mine(requestId)}/token/claim`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** The one date push: later, by seven days at most, until the end of the day before move-in. */
    pushBookingMoveInDate: builder.mutation<BookingRequest, MyStep & { moveInDate: string }>({
      query: ({ moveInDate, requestId, version }) => ({
        body: { moveInDate },
        headers: ifMatch(version),
        method: "POST",
        url: `${mine(requestId)}/move-in-date`,
      }),
      invalidatesTags: ["Booking"],
    }),

    acceptAnotherBed: builder.mutation<BookingRequest, MyStep>({
      query: ({ requestId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `${mine(requestId)}/bed-offer/accept`,
      }),
      invalidatesTags: ["Booking"],
    }),

    declineAnotherBed: builder.mutation<BookingRequest, MyStep>({
      query: ({ requestId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `${mine(requestId)}/bed-offer/decline`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** The bed is still not ready after the property's extra days. The token is owed back. */
    leaveBookingBedNotReady: builder.mutation<BookingRequest, MyStep>({
      query: ({ requestId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `${mine(requestId)}/leave`,
      }),
      invalidatesTags: ["Booking"],
    }),

    // ---- The property -------------------------------------------------------

    /**
     * The filters are applied on the server, so the pages and the total are of
     * what was asked for. `mine` is the ones the reader handles. `q` matches a
     * tenant's name, a booking's short code or a room number.
     */
    getPropertyBookingRequests: builder.query<
      Page<BookingRequestListItem>,
      {
        propertyId: string;
        filter: BookingListFilter;
        page: number;
        status?: BookingStatus | null;
        mine?: boolean;
        /** Only the ones nobody handles yet: the All requests tab. Being assigned takes a request out of it. */
        unassigned?: boolean;
        attention?: import("@/features/booking/booking-attention").BookingAttentionFilter;
        q?: string | null;
      }
    >({
      query: ({ filter, mine, page, propertyId, q, status, unassigned, attention }) => {
        const params = [`filter=${filter}`, `page=${page}`, "size=20"];
        if (attention) params.push(`attention=${attention}`);
        if (status) params.push(`status=${status}`);
        if (mine) params.push("mine=true");
        if (unassigned) params.push("unassigned=true");
        if (q && q.trim()) params.push(`q=${encodeURIComponent(q.trim())}`);
        return `/api/v1/properties/${propertyId}/booking-requests?${params.join("&")}`;
      },
      providesTags: ["Booking"],
    }),

    getPropertyBookingCounts: builder.query<BookingRequestCounts, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/booking-requests/counts`,
      providesTags: ["Booking"],
    }),

    /** Reading takes nothing. Call `openPropertyBookingRequest` when a person opens the details. */
    getPropertyBookingRequest: builder.query<BookingRequest, { propertyId: string; requestId: string }>({
      query: ({ propertyId, requestId }) => atProperty(propertyId, requestId),
      providesTags: ["Booking"],
    }),

    /** A person opened the details. Where the first to open handles a request, a manager takes it here. */
    openPropertyBookingRequest: builder.mutation<BookingRequest, { propertyId: string; requestId: string }>({
      query: ({ propertyId, requestId }) => ({ method: "POST", url: `${atProperty(propertyId, requestId)}/open` }),
      invalidatesTags: ["Booking"],
    }),

    acceptBookingOfferForProperty: builder.mutation<BookingRequest, PropertyStep & { offerSequence: number }>({
      query: ({ offerSequence, propertyId, requestId, version }) => ({
        body: { offerSequence },
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/accept`,
      }),
      invalidatesTags: ["Booking"],
    }),

    confirmBookingForProperty: builder.mutation<BookingRequest, PropertyStep>({
      query: ({ propertyId, requestId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/confirm`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** A counter the tenant may answer, or with `negotiable: false` the property's final offer. */
    offerBookingRent: builder.mutation<
      BookingRequest,
      PropertyStep & { offerSequence: number; rentPaise?: number | null; negotiable: boolean }
    >({
      query: ({ negotiable, offerSequence, propertyId, rentPaise, requestId, version }) => ({
        body: { negotiable, offerSequence, rentPaise: rentPaise ?? null },
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/offer`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** Declines a request or cancels a booking, with the reason the tenant is shown. */
    cancelBookingForProperty: builder.mutation<BookingRequest, PropertyStep & { reason: string }>({
      query: ({ propertyId, reason, requestId, version }) => ({
        body: { reason },
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/cancel`,
      }),
      invalidatesTags: ["Booking"],
    }),

    sendBookingTokenCashCode: builder.mutation<BookingCashCode, PropertyStep>({
      query: ({ propertyId, requestId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/token/cash-code`,
      }),
    }),

    /** "Token received." `method` may be left out when answering a claim, which names it. */
    markBookingTokenReceived: builder.mutation<
      BookingRequest,
      PropertyStep & { method?: ManualPaymentMethod | null; reference?: string | null; cashCode?: string | null }
    >({
      query: ({ cashCode, method, propertyId, reference, requestId, version }) => ({
        body: { cashCode: cashCode ?? null, method: method ?? null, reference: reference ?? null },
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/token/received`,
      }),
      invalidatesTags: ["Booking"],
    }),

    markBookingTokenNotReceived: builder.mutation<BookingRequest, PropertyStep & { reason: string }>({
      query: ({ propertyId, reason, requestId, version }) => ({
        body: { reason },
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/token/not-received`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** Owner only. */
    waiveBookingToken: builder.mutation<BookingRequest, PropertyStep>({
      query: ({ propertyId, requestId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/token/waive`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** A no-show's token (2026-10-28), refunded: recorded as owed back, "Refundable". Refunds are not followed. */
    refundBookingToken: builder.mutation<BookingRequest, PropertyStep>({
      query: ({ propertyId, requestId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/token/refund`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** A no-show's token (2026-10-28), kept: "Kept", the property's income. */
    keepBookingToken: builder.mutation<BookingRequest, PropertyStep>({
      query: ({ propertyId, requestId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/token/keep`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** For the onboarding screen. Null when the phone number has no booking here. */
    getConvertibleBooking: builder.query<BookingConvertible | null, { propertyId: string; phone: string }>({
      query: ({ phone, propertyId }) =>
        `/api/v1/properties/${propertyId}/booking-requests/convertible?phone=${encodeURIComponent(phone)}`,
      transformResponse: (response: BookingConvertible | null | undefined) => response ?? null,
      providesTags: ["Booking"],
    }),

    /** The tenant has arrived. Anyone who may onboard at the property may do this. */
    convertBooking: builder.mutation<BookingConversion, PropertyStep & { body: ConvertBookingPayload }>({
      query: ({ body, propertyId, requestId, version }) => ({
        body,
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/convert`,
      }),
      // A stay was created and the bed passed to it, as ordinary onboarding does.
      invalidatesTags: ["Booking", "Tenancy", "Compliance", "Property", "Notification"],
    }),

    /**
     * Nobody came (2026-10-27): from the day after move-in. A received token waits as "Action pending",
     * refunded or kept later from the Tokens screen (2026-10-28).
     */
    closeBookingDidNotArrive: builder.mutation<BookingRequest, PropertyStep>({
      query: ({ propertyId, requestId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/did-not-arrive`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** The booked bed is occupied: move the booking to a free bed in this room now (2026-10-27). */
    moveBookingBed: builder.mutation<BookingRequest, PropertyStep & { roomId: string }>({
      query: ({ propertyId, requestId, roomId, version }) => ({
        body: { roomId },
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/move-bed`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** Rooms with a bed free today, for the offer's picker. Needs no rooms access. */
    getAnotherBedOptions: builder.query<BookingBedOption[], { propertyId: string; requestId: string }>({
      query: ({ propertyId, requestId }) => `${atProperty(propertyId, requestId)}/bed-offer/options`,
      providesTags: ["Booking"],
    }),

    offerAnotherBed: builder.mutation<BookingRequest, PropertyStep & { roomId: string; monthlyRentPaise: number }>({
      query: ({ monthlyRentPaise, propertyId, requestId, roomId, version }) => ({
        body: { monthlyRentPaise, roomId },
        headers: ifMatch(version),
        method: "POST",
        url: `${atProperty(propertyId, requestId)}/bed-offer`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** The Tokens screen: all token money received, newest first, with what became of each. */
    getPropertyBookingTokens: builder.query<
      BookingTokenLedger,
      { propertyId: string; page: number; status?: BookingTokenStatus | null; q?: string }
    >({
      // Narrowed on the server, like the list of requests: `q` is part of a token's own code or its booking's.
      query: ({ page, propertyId, q, status }) =>
        `/api/v1/properties/${propertyId}/booking-tokens?page=${page}&size=20${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      providesTags: ["Booking"],
    }),

    // ---- The owner's settings -----------------------------------------------

    getBookingSettings: builder.query<BookingSettings, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/booking-settings`,
      providesTags: ["Booking"],
    }),

    /** The first save. From here the property takes booking requests. */
    createBookingSettings: builder.mutation<BookingSettings, { propertyId: string; body: SaveBookingSettingsPayload }>({
      query: ({ body, propertyId }) => ({
        body,
        method: "POST",
        url: `/api/v1/properties/${propertyId}/booking-settings`,
      }),
      invalidatesTags: ["Booking"],
    }),

    saveBookingSettings: builder.mutation<
      BookingSettings,
      { propertyId: string; version: number; body: SaveBookingSettingsPayload }
    >({
      query: ({ body, propertyId, version }) => ({
        body,
        headers: ifMatch(version),
        method: "PUT",
        url: `/api/v1/properties/${propertyId}/booking-settings`,
      }),
      invalidatesTags: ["Booking"],
    }),

    /** The chat about a booking, opened by whoever handles it (user, 2026-10-27). */
    openPropertyBookingChat: builder.mutation<{ threadId: string }, { propertyId: string; requestId: string }>({
      query: ({ propertyId, requestId }) => ({
        method: "POST",
        url: `/api/v1/properties/${propertyId}/booking-requests/${requestId}/chat`,
      }),
      invalidatesTags: ["Chat", "Booking"],
    }),
  }),
  // As every other service has it. Without this a changed endpoint is ignored on hot reload, and the screen
  // keeps calling the old one until the app is reloaded: the All requests tab went on asking for every
  // request after it had been told to ask for the unassigned ones (2026-10-11).
  overrideExisting: __DEV__ ? true : "throw",
});

export const {
  useMoveBookingBedMutation,
  useOpenMyBookingChatMutation,
  useOpenPropertyBookingChatMutation,
  useGetBookingFormOptionsQuery,
  useCreateBookingRequestMutation,
  useGetMyBookingRequestsQuery,
  useGetMyBookingsQuery,
  useGetMyBookingRequestQuery,
  useAcceptBookingOfferMutation,
  useCounterBookingOfferMutation,
  useCancelMyBookingMutation,
  useGetBookingTokenPayDetailsQuery,
  useClaimBookingTokenPaidMutation,
  usePushBookingMoveInDateMutation,
  useAcceptAnotherBedMutation,
  useDeclineAnotherBedMutation,
  useLeaveBookingBedNotReadyMutation,
  useGetPropertyBookingRequestsQuery,
  useGetPropertyBookingCountsQuery,
  useGetPropertyBookingRequestQuery,
  useOpenPropertyBookingRequestMutation,
  useAcceptBookingOfferForPropertyMutation,
  useConfirmBookingForPropertyMutation,
  useOfferBookingRentMutation,
  useCancelBookingForPropertyMutation,
  useSendBookingTokenCashCodeMutation,
  useMarkBookingTokenReceivedMutation,
  useMarkBookingTokenNotReceivedMutation,
  useWaiveBookingTokenMutation,
  useKeepBookingTokenMutation,
  useRefundBookingTokenMutation,
  useGetConvertibleBookingQuery,
  useConvertBookingMutation,
  useCloseBookingDidNotArriveMutation,
  useGetAnotherBedOptionsQuery,
  useOfferAnotherBedMutation,
  useGetPropertyBookingTokensQuery,
  useGetBookingSettingsQuery,
  useCreateBookingSettingsMutation,
  useSaveBookingSettingsMutation,
} = bookingApi;
