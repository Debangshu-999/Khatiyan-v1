package com.khatiyan.d_modules.booking.service;

import java.time.Instant;
import java.util.Set;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.model.BookingAction;
import com.khatiyan.d_modules.booking.model.BookingOffer;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTiming;
import com.khatiyan.d_modules.booking.model.BookingTokenHold;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;

/**
 * Pure state/offer rules, not authorisation. The caller must establish the
 * authenticated prospect and the owner's/handler's bookings access before
 * supplying a party or managementMayAct. No client-supplied role is trusted.
 */
public final class BookingActionRules {

    private BookingActionRules() {
    }

    /**
     * @param stayStarted the linked tenancy is active. Until then either side
     *                    may still cancel, and a pending tenancy created by
     *                    onboarding is resolved with the booking.
     */
    public static Set<BookingAction> allowedActions(
            BookingStatus storedStatus, BookingTiming timing, BookingOffer offer, BookingTokenHold tokenHold,
            BookingParty actor, boolean managementMayAct, boolean stayStarted, Instant now) {
        return allowedActions(storedStatus, timing, offer, tokenHold, actor, managementMayAct, stayStarted, now,
                null);
    }

    /**
     * @param listedRentPaise the room's rent as the request wrote it down when
     *                        it was sent. Where the tenant's offer on the table
     *                        is exactly that, the property has nothing to
     *                        bargain over and may only take the request or
     *                        decline it (user, 2026-10-11). Null leaves the rule
     *                        out, for a caller that has no request to read it
     *                        from
     */
    public static Set<BookingAction> allowedActions(
            BookingStatus storedStatus, BookingTiming timing, BookingOffer offer, BookingTokenHold tokenHold,
            BookingParty actor, boolean managementMayAct, boolean stayStarted, Instant now, Long listedRentPaise) {
        if (actor == null || tokenHold == null || stayStarted
                || (actor == BookingParty.MANAGEMENT && !managementMayAct)) {
            return Set.of();
        }
        if (storedStatus == BookingStatus.AWAITING_TOKEN && !tokenHold.isRunning()) {
            return Set.of(); // Malformed state must not keep a bed held without a deadline.
        }
        BookingStatus status = BookingPolicy.effectiveStatusAt(storedStatus, timing, tokenHold, now);
        if (status == BookingStatus.TOKEN_RECEIVED) {
            // The tenant may not cancel once their token is received, only the
            // property, which confirms or cancels it (user, 2026-10-27).
            return actor == BookingParty.MANAGEMENT
                    ? Set.of(BookingAction.CONFIRM, BookingAction.CANCEL) : Set.of();
        }
        if (status.isAgreed()) {
            return Set.of(BookingAction.CANCEL);
        }
        if (!status.isPending() || offer == null) {
            return Set.of();
        }
        BookingParty expectedOfferSide = status == BookingStatus.AWAITING_HANDLER
                ? BookingParty.TENANT : BookingParty.MANAGEMENT;
        if (offer.madeBy() != expectedOfferSide) {
            return Set.of(); // Malformed/stale state must not enable acceptance of one's own offer.
        }
        if (actor == expectedOfferSide) {
            return Set.of(BookingAction.CANCEL);
        }
        return offer.negotiable() && !askedAtListedRent(offer, actor, listedRentPaise)
                ? Set.of(BookingAction.ACCEPT, BookingAction.COUNTER, BookingAction.CANCEL)
                : Set.of(BookingAction.ACCEPT, BookingAction.CANCEL);
    }

    /**
     * The property is reading, and what the tenant has put on the table is the
     * room's own listed rent. Someone who asks for the room at its price has
     * left nothing to counter: a counter could only ask for more than the
     * listing said, or offer less than was asked.
     */
    public static boolean askedAtListedRent(BookingOffer offer, BookingParty actor, Long listedRentPaise) {
        return actor == BookingParty.MANAGEMENT && offer != null && listedRentPaise != null
                && offer.madeBy() == BookingParty.TENANT && offer.monthlyRentPaise() == listedRentPaise;
    }

    /**
     * Acceptance by either receiving side agrees the terms, with no second
     * approval. The bed has been held since the request was sent: the booking
     * now waits for its token, or is confirmed at once where the owner takes
     * none. This only calculates a state: persistence must still check the
     * current offer/version and cancellation reason in its transaction, and
     * free the bed whenever the result is a booking that is over.
     */
    public static BookingStatus nextStatus(
            BookingAction action, BookingStatus status, BookingTiming timing, BookingOffer offer,
            BookingTokenHold tokenHold, BookingParty actor, boolean managementMayAct, boolean stayStarted,
            Instant now) {
        return nextStatus(action, status, timing, offer, tokenHold, actor, managementMayAct, stayStarted, now,
                null);
    }

    /** As above, with the request's listed rent, so a request made at it cannot be countered by the property. */
    public static BookingStatus nextStatus(
            BookingAction action, BookingStatus status, BookingTiming timing, BookingOffer offer,
            BookingTokenHold tokenHold, BookingParty actor, boolean managementMayAct, boolean stayStarted,
            Instant now, Long listedRentPaise) {
        Set<BookingAction> allowed = allowedActions(status, timing, offer, tokenHold, actor, managementMayAct,
                stayStarted, now, listedRentPaise);
        if (action == null || !allowed.contains(action)) {
            // Said in its own words where that is the only thing in the way: the request is live
            // and theirs to answer, and it is the listed rent that rules the counter out.
            if (action == BookingAction.COUNTER && allowed.contains(BookingAction.ACCEPT)
                    && askedAtListedRent(offer, actor, listedRentPaise)) {
                throw new ValidationException("The tenant asked at the room's listed rent."
                        + " Accept the request or cancel it. There is nothing to counter.");
            }
            throw new ValidationException("This action is not available for this booking request.");
        }
        return switch (action) {
            case ACCEPT -> tokenHold.required() ? BookingStatus.AWAITING_TOKEN : BookingStatus.CONFIRMED;
            case CONFIRM -> BookingStatus.CONFIRMED;
            case COUNTER -> actor == BookingParty.TENANT
                    ? BookingStatus.AWAITING_HANDLER : BookingStatus.AWAITING_TENANT;
            case CANCEL -> BookingStatus.CANCELLED;
        };
    }

    /**
     * The window closure and 30-day cooldown apply only where the tenant
     * walks away from a confirmed bed held for nothing. Withdrawing a request
     * costs nothing beyond its slot, and where a token was taken the token
     * rule is the consequence.
     */
    public static boolean tenantCancellationIsPenalised(BookingStatus statusBefore, BookingTokenStatus token) {
        return statusBefore == BookingStatus.CONFIRMED && token == BookingTokenStatus.NOT_REQUIRED;
    }

    public static String requireManagementCancellationReason(String reason) {
        String trimmed = reason == null ? "" : reason.strip();
        if (trimmed.isEmpty()) {
            throw new ValidationException("Give the tenant a reason for cancelling the booking.");
        }
        return trimmed;
    }
}
