package com.khatiyan.d_modules.booking.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * An attended visitor's request for a bed (user's rules, 2026-10-09).
 *
 * <p><b>It holds one bed from the moment it is sent</b> (user, 2026-10-10), so
 * a bed is asked for by one person at a time. The hold lives in tenancy's
 * {@code bed_holds}, keyed by this request's id. However the request ends
 * short of a confirmed booking, the service frees the bed with it.
 *
 * <p><b>What the tenant was shown is frozen here.</b> The room's rent, the
 * deposit, the token and its refund answer and the latest date they could
 * choose are copied at submission. The owner changing a setting afterwards
 * never alters a request that is already open.
 *
 * <p><b>The clocks never move.</b> The booking date, the bounds and the expiry
 * are set once. No offer, view or assignment restarts them.
 */
@Entity
@Table(name = "requests", schema = "booking")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BookingRequest extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reference_code", nullable = false, updatable = false, length = 40)
    private String referenceCode;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    /**
     * The person's account. Null for an external booking until move-in, when
     * onboarding makes one and {@link #attachAccount} links it, so this column is
     * written once more then (2026-10-19).
     */
    @Column(name = "prospect_user_id")
    private UUID prospectUserId;

    /** The enquiry it came from. Null for an external booking, which had none. */
    @Column(name = "enquiry_id", updatable = false)
    private UUID enquiryId;

    /** The attended visit it was asked from. Null for a stay booked straight from the property profile (2026-10-17). */
    @Column(name = "visit_id", updatable = false)
    private UUID visitId;

    /** Which of the visit's two requests this is. Null once the slot is given back. */
    @Column(name = "visit_slot")
    private Integer visitSlot;

    @Column(name = "idempotency_key", nullable = false, updatable = false, length = 80)
    private String idempotencyKey;

    @Column(name = "property_name", nullable = false, updatable = false, length = 120)
    private String propertyName;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Column(name = "room_number", nullable = false, length = 40)
    private String roomNumber;

    /** The approved exit that frees the bed, or null for a bed that is free today. */
    @Column(name = "exit_request_id")
    private UUID exitRequestId;

    @Column(name = "listed_rent_paise", nullable = false, updatable = false)
    private long listedRentPaise;

    @Column(name = "deposit_paise", nullable = false, updatable = false)
    private long depositPaise;

    @Column(name = "token_required", nullable = false, updatable = false)
    private boolean tokenRequired;

    @Column(name = "token_amount_paise", nullable = false, updatable = false)
    private long tokenAmountPaise;

    @Column(name = "token_refundable", nullable = false, updatable = false)
    private boolean tokenRefundable;

    @Column(name = "tenant_name", nullable = false, updatable = false, length = 120)
    private String tenantName;

    @Column(name = "tenant_phone", nullable = false, updatable = false, length = 20)
    private String tenantPhone;

    @Column(name = "tenant_email", updatable = false, length = 254)
    private String tenantEmail;

    @Enumerated(EnumType.STRING)
    @Column(name = "tenant_gender", nullable = false, updatable = false, length = 20)
    private Gender tenantGender;

    @Column(name = "tenant_date_of_birth", nullable = false, updatable = false)
    private LocalDate tenantDateOfBirth;

    @Column(name = "submitted_at", nullable = false, updatable = false)
    private Instant submittedAt;

    @Column(name = "booking_date", nullable = false, updatable = false)
    private LocalDate bookingDate;

    @Column(name = "earliest_move_in_date", nullable = false, updatable = false)
    private LocalDate earliestMoveInDate;

    @Column(name = "latest_move_in_date", nullable = false, updatable = false)
    private LocalDate latestMoveInDate;

    @Column(name = "original_move_in_date", nullable = false, updatable = false)
    private LocalDate originalMoveInDate;

    /** The date in force. Later than the original only after the one push. */
    @Column(name = "move_in_date", nullable = false)
    private LocalDate moveInDate;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    /** Null is an indefinite agreement. */
    @Column(name = "agreement_months", updatable = false)
    private Integer agreementMonths;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BookingStatus status;

    @Column(name = "current_offer_sequence", nullable = false)
    private int currentOfferSequence;

    @Enumerated(EnumType.STRING)
    @Column(name = "current_offer_by", nullable = false, length = 12)
    private BookingParty currentOfferBy;

    @Column(name = "current_rent_paise", nullable = false)
    private long currentRentPaise;

    @Column(name = "current_offer_negotiable", nullable = false)
    private boolean currentOfferNegotiable;

    @Column(name = "closed_at")
    private Instant closedAt;

    /** Set only when a tenant cancels a confirmed booking that took no token. */
    @Column(name = "cooldown_until")
    private Instant cooldownUntil;

    /**
     * Who handles it, as last written. Never trust this alone: a handler who
     * has since lost the bookings grant is no handler, see BookingHandlerRules.
     */
    @Column(name = "handler_user_id")
    private UUID handlerUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "handler_assigned_by", length = 20)
    private BookingHandlerAssignment handlerAssignedBy;

    @Column(name = "handler_assigned_at")
    private Instant handlerAssignedAt;

    @Column(name = "agreed_at")
    private Instant agreedAt;

    @Column(name = "agreed_rent_paise")
    private Long agreedRentPaise;

    /** What is owed as a token at the agreed rent. Zero where none is taken. */
    @Column(name = "token_due_paise")
    private Long tokenDuePaise;

    /** When the bed stops being held for the token. Null unless one was agreed. */
    @Column(name = "token_due_at")
    private Instant tokenDueAt;

    /** The tenant says they paid and the property has not answered: the token clock is stopped. */
    @Column(name = "token_claim_waiting", nullable = false)
    private boolean tokenClaimWaiting;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    /** Why a cancelled booking ended. An expired one has none: its clock ran out. */
    @Enumerated(EnumType.STRING)
    @Column(name = "end_cause", length = 30)
    private BookingEndCause endCause;

    /** Which side cancelled it. Null when the system did. */
    @Enumerated(EnumType.STRING)
    @Column(name = "cancelled_by", length = 12)
    private BookingParty cancelledBy;

    @Column(name = "cancelled_by_user_id")
    private UUID cancelledByUserId;

    @Column(name = "cancel_reason", length = 500)
    private String cancelReason;

    /** The stay this booking was converted into when the tenant arrived. Null until then. */
    @Column(name = "tenancy_id")
    private UUID tenancyId;

    @Column(name = "converted_at")
    private Instant convertedAt;

    @Column(name = "converted_by_user_id")
    private UUID convertedByUserId;

    /** When the tenant pushed the move-in date. Null while it is the date they asked for. */
    @Column(name = "move_in_pushed_at")
    private Instant moveInPushedAt;

    /**
     * A booking made outside the app (2026-10-19): the lead module's external
     * record of the person. Null for an app booking. Such a booking has no
     * enquiry, and no account until move-in links one.
     */
    @Column(name = "external_prospect_id", updatable = false)
    private UUID externalProspectId;

    /** How an external booking reached the property. Null for an app booking. */
    @Enumerated(EnumType.STRING)
    @Column(name = "reached_via", length = 20, updatable = false)
    private BookingReachedVia reachedVia;

    /**
     * Makes a request just submitted an external one: no person's account, no
     * visit slot, the lead module's record instead (2026-10-19).
     */
    public void markExternal(UUID externalProspectId, BookingReachedVia reachedVia) {
        if (externalProspectId == null || reachedVia == null) {
            throw new IllegalArgumentException("An external booking names its record and how they reached out");
        }
        this.externalProspectId = externalProspectId;
        this.reachedVia = reachedVia;
        this.prospectUserId = null;
        this.enquiryId = null;
        this.visitId = null;
        this.visitSlot = null;
    }

    public boolean isExternal() {
        return externalProspectId != null;
    }

    /** Move-in made the external person an account: the booking is theirs from now on. */
    public void attachAccount(UUID userId) {
        if (!isExternal() || prospectUserId != null) {
            throw new IllegalStateException("Only an external booking without an account takes one");
        }
        this.prospectUserId = userId;
    }

    /** Everything a new request is made of, checked by the service before it gets here. */
    public record Submission(
            String referenceCode, UUID propertyId, UUID prospectUserId, UUID enquiryId, UUID visitId,
            int visitSlot, String idempotencyKey, String propertyName, UUID roomId, String roomNumber,
            UUID exitRequestId, long listedRentPaise, long depositPaise, BookingTokenTerms tokenTerms,
            String tenantName, String tenantPhone, String tenantEmail, Gender tenantGender,
            LocalDate tenantDateOfBirth, BookingTiming timing, LocalDate moveInDate, Integer agreementMonths,
            BookingOffer firstOffer) {
    }

    public static BookingRequest submit(Submission from) {
        if (from.firstOffer().madeBy() != BookingParty.TENANT) {
            throw new IllegalArgumentException("A request opens with the tenant's own offer");
        }
        BookingRequest request = new BookingRequest();
        request.id = UUID.randomUUID();
        request.referenceCode = from.referenceCode();
        request.propertyId = from.propertyId();
        request.prospectUserId = from.prospectUserId();
        request.enquiryId = from.enquiryId();
        request.visitId = from.visitId();
        request.visitSlot = from.visitSlot();
        request.idempotencyKey = from.idempotencyKey();
        request.propertyName = from.propertyName();
        request.roomId = from.roomId();
        request.roomNumber = from.roomNumber();
        request.exitRequestId = from.exitRequestId();
        request.listedRentPaise = from.listedRentPaise();
        request.depositPaise = from.depositPaise();
        request.tokenRequired = from.tokenTerms().required();
        request.tokenAmountPaise = from.tokenTerms().amountPaise();
        request.tokenRefundable = from.tokenTerms().refundableOnTenantCancel();
        request.tenantName = from.tenantName();
        request.tenantPhone = from.tenantPhone();
        request.tenantEmail = from.tenantEmail();
        request.tenantGender = from.tenantGender();
        request.tenantDateOfBirth = from.tenantDateOfBirth();
        request.submittedAt = from.timing().submittedAt();
        request.bookingDate = from.timing().bookingDate();
        request.earliestMoveInDate = from.timing().earliestMoveInDate();
        request.latestMoveInDate = from.timing().latestMoveInDate();
        request.originalMoveInDate = from.moveInDate();
        request.moveInDate = from.moveInDate();
        request.expiresAt = from.timing().expiresAt();
        request.agreementMonths = from.agreementMonths();
        request.status = BookingStatus.AWAITING_HANDLER;
        request.currentOfferSequence = 1;
        request.currentOfferBy = from.firstOffer().madeBy();
        request.currentRentPaise = from.firstOffer().monthlyRentPaise();
        request.currentOfferNegotiable = from.firstOffer().negotiable();
        return request;
    }

    /** The clock snapshot exactly as it was set at submission. */
    public BookingTiming timing() {
        return new BookingTiming(submittedAt, bookingDate, earliestMoveInDate, latestMoveInDate, expiresAt);
    }

    /** The token rule the tenant was shown, whatever the owner's settings say today. */
    public BookingTokenTerms tokenTerms() {
        return new BookingTokenTerms(tokenRequired, tokenAmountPaise, tokenRefundable);
    }

    /** The offer on the table. */
    public BookingOffer currentOffer() {
        return new BookingOffer(currentRentPaise, currentOfferBy, currentOfferNegotiable);
    }

    public boolean isFutureBed() {
        return exitRequestId != null;
    }

    public void assignHandler(UUID handlerUserId, BookingHandlerAssignment how, Instant now) {
        if (handlerUserId == null || how == null) {
            throw new IllegalArgumentException("A handler comes with how they got the request");
        }
        this.handlerUserId = handlerUserId;
        this.handlerAssignedBy = how;
        this.handlerAssignedAt = now;
    }

    /** Back to nobody: the next manager to open it takes it. */
    public void clearHandler() {
        this.handlerUserId = null;
        this.handlerAssignedBy = null;
        this.handlerAssignedAt = null;
    }

    public boolean usesVisitSlot() {
        return visitSlot != null;
    }

    /**
     * The status as it stands at this moment, without waiting for the sweep.
     * A request still being negotiated ends on its own clock. An agreed
     * booking ends on its token clock, which belongs to the token record and
     * is not applied here.
     */
    public BookingStatus statusAt(Instant now) {
        return isOutOfTime(now) ? BookingStatus.EXPIRED : status;
    }

    /**
     * Whether a clock has run out on it: the request clock while it is being
     * negotiated, the token clock once terms are agreed. A claim the property
     * has not answered stops the token clock. A confirmed booking has no clock.
     */
    public boolean isOutOfTime(Instant now) {
        if (status.isPending()) {
            return !now.isBefore(expiresAt);
        }
        return status == BookingStatus.AWAITING_TOKEN && tokenHold().lapsedAt(now);
    }

    /** The token facts the state rules need, as they stand on this row. */
    public BookingTokenHold tokenHold() {
        if (!tokenRequired) {
            return BookingTokenHold.waived();
        }
        return tokenDueAt == null ? BookingTokenHold.toBeAgreed() : BookingTokenHold.due(tokenDueAt, tokenClaimWaiting);
    }

    /**
     * A new offer goes on the table and the turn passes to the other side.
     * The offers before it are untouched: they are rows of their own.
     */
    public void putOffer(BookingOffer offer, BookingStatus next) {
        this.currentOfferSequence = currentOfferSequence + 1;
        this.currentOfferBy = offer.madeBy();
        this.currentRentPaise = offer.monthlyRentPaise();
        this.currentOfferNegotiable = offer.negotiable();
        this.status = next;
    }

    /**
     * The offer on the table was accepted. The rent and the token owed are
     * fixed from here, and the bed it has held since it was sent stays held.
     *
     * @param tokenDueAt when the token must have arrived, or null where the
     *                   property takes none and this confirms the booking
     */
    public void agree(BookingStatus next, Instant now, Instant tokenDueAt) {
        if (!next.isAgreed() || (next == BookingStatus.AWAITING_TOKEN) != (tokenDueAt != null)) {
            throw new IllegalArgumentException("Agreed terms either await a token with a deadline or are confirmed");
        }
        this.agreedAt = now;
        this.agreedRentPaise = currentRentPaise;
        this.tokenDuePaise = tokenTerms().dueFor(currentRentPaise);
        this.tokenDueAt = tokenDueAt;
        this.status = next;
        if (next == BookingStatus.CONFIRMED) {
            this.confirmedAt = now;
        }
    }

    /** The tenant says they paid the token. Its clock stops until the property answers. */
    public void tokenClaimed() {
        this.tokenClaimWaiting = true;
    }

    /** The property answered the claim, and nothing is waiting on it now. */
    public void tokenClaimAnswered() {
        this.tokenClaimWaiting = false;
    }

    /** The property refused the claim on a booking still held: the clock runs again, to this deadline. */
    public void tokenClaimRefused(Instant tokenDueAt) {
        this.tokenClaimWaiting = false;
        this.tokenDueAt = tokenDueAt;
    }

    /** A receipt is not final booking confirmation. The bed stays held without a payment clock. */
    public void tokenReceived() {
        if (status != BookingStatus.AWAITING_TOKEN) {
            throw new IllegalStateException("Only a booking awaiting a token moves to token received");
        }
        this.status = BookingStatus.TOKEN_RECEIVED;
        this.tokenClaimWaiting = false;
    }

    /** The property explicitly confirms a received token, or the owner waives a token. */
    public void confirmAwaited(Instant now) {
        if (status != BookingStatus.AWAITING_TOKEN && status != BookingStatus.TOKEN_RECEIVED) {
            throw new IllegalStateException("Only an agreed booking awaiting confirmation can be confirmed");
        }
        this.status = BookingStatus.CONFIRMED;
        this.confirmedAt = now;
        this.tokenClaimWaiting = false;
    }

    public boolean isDatePushed() {
        return moveInPushedAt != null;
    }

    /**
     * The one change a tenant may make to agreed terms: the move-in date, to
     * a later day, once. The date they first asked for is kept beside it.
     */
    public void pushMoveInDate(LocalDate date, Instant now) {
        if (status != BookingStatus.CONFIRMED || isConverted() || isDatePushed()) {
            throw new IllegalStateException("A confirmed booking's date is pushed once, before it is converted");
        }
        this.moveInDate = date;
        this.moveInPushedAt = now;
    }

    /**
     * The tenant took another bed the property offered, because the one they
     * booked was still occupied. The room and the rent are the offer's. The
     * deposit, the token and the dates are as they were.
     */
    public void takeAnotherBed(UUID roomId, String roomNumber, long monthlyRentPaise) {
        if (status != BookingStatus.CONFIRMED || isConverted()) {
            throw new IllegalStateException("Only a confirmed booking that has not been converted changes its bed");
        }
        this.roomId = roomId;
        this.roomNumber = roomNumber;
        this.exitRequestId = null;
        this.agreedRentPaise = monthlyRentPaise;
        this.currentRentPaise = monthlyRentPaise;
    }

    /** A stay has been created from it. Its bed is the stay's from then on. */
    public boolean isConverted() {
        return tenancyId != null;
    }

    /** The tenant arrived and was onboarded. It stays confirmed until they sign and the stay starts. */
    public void convert(UUID tenancyId, UUID byUserId, Instant now) {
        if (status != BookingStatus.CONFIRMED || isConverted()) {
            throw new IllegalStateException("Only a confirmed booking is converted, and only once");
        }
        this.tenancyId = tenancyId;
        this.convertedAt = now;
        this.convertedByUserId = byUserId;
    }

    /** The stay started. The booking is over. */
    public void movedIn(Instant now) {
        if (status != BookingStatus.CONFIRMED || !isConverted()) {
            throw new IllegalStateException("Only a converted booking moves in");
        }
        this.status = BookingStatus.MOVED_IN;
        this.closedAt = now;
        this.endCause = BookingEndCause.MOVED_IN;
    }

    /**
     * Ended by a person, or by the system for them. The caller frees the bed.
     *
     * @param by             the side that cancelled, or null for the system
     * @param giveSlotBack   true where the tenant should not lose one of the
     *                       visit's two requests to this ending
     * @param cooldownUntil  set only where the tenant walked away from a
     *                       confirmed bed held for nothing
     */
    public void cancel(BookingEndCause cause, BookingParty by, UUID byUserId, String reason, Instant now,
            boolean giveSlotBack, Instant cooldownUntil) {
        if (!status.holdsBed()) {
            throw new IllegalStateException("Only a booking that is still going can be cancelled");
        }
        if (cause == null || (by == null) != (byUserId == null)) {
            throw new IllegalArgumentException("A cancellation says why, and names who or nobody");
        }
        this.status = BookingStatus.CANCELLED;
        this.closedAt = now;
        this.endCause = cause;
        this.cancelledBy = by;
        this.cancelledByUserId = byUserId;
        this.cancelReason = reason;
        this.cooldownUntil = cooldownUntil;
        if (giveSlotBack) {
            this.visitSlot = null;
        }
    }

    public boolean isOpenAt(Instant now) {
        return statusAt(now).holdsBed();
    }

    /**
     * A clock ran out: the request's with no terms agreed, or the token's with
     * no token. Nobody is penalised. Where it was the property's turn to
     * answer a request, the visit gets its slot back: the tenant should not
     * lose one of their two requests to silence. The caller frees the bed.
     *
     * @return true when it expired now, false when it was not due or was over already
     */
    public boolean expire(Instant now) {
        if (!isOutOfTime(now)) {
            return false;
        }
        if (status == BookingStatus.AWAITING_HANDLER) {
            visitSlot = null;
        }
        status = BookingStatus.EXPIRED;
        closedAt = now;
        return true;
    }
}
