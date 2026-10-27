package com.khatiyan.d_modules.booking.service;

import java.util.Objects;
import java.util.Set;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTokenAction;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;

/**
 * Pure token rules, not authorisation. The token is a record of what the two
 * sides say, never a collection: this app moves no money and cannot enforce a
 * refund. The caller establishes who is acting, and that only the owner waives.
 */
public final class BookingTokenRules {

    private BookingTokenRules() {
    }

    /**
     * @param status the booking's effective status, after its clocks are applied
     */
    public static Set<BookingTokenAction> allowedActions(
            BookingStatus status, BookingTokenStatus token, BookingParty actor, boolean managementMayAct) {
        if (status == null || token == null || actor == null
                || (actor == BookingParty.MANAGEMENT && !managementMayAct)) {
            return Set.of();
        }
        boolean awaited = status == BookingStatus.AWAITING_TOKEN;
        if (actor == BookingParty.TENANT) {
            return switch (token) {
                case DUE, NOT_RECEIVED -> awaited ? Set.of(BookingTokenAction.CLAIM_PAID) : Set.of();
                default -> Set.of();
            };
        }
        return switch (token) {
            // Cash arrives with no claim, so the property may record it directly.
            case DUE, NOT_RECEIVED -> awaited
                    ? Set.of(BookingTokenAction.MARK_RECEIVED, BookingTokenAction.WAIVE) : Set.of();
            // A claim is answered even after the booking ended: the money may have moved.
            case CLAIMED -> Set.of(BookingTokenAction.MARK_RECEIVED, BookingTokenAction.MARK_NOT_RECEIVED);
            // A guest who did not arrive: the handler refunds it or keeps it (user, 2026-10-28).
            case DECISION_PENDING -> Set.of(BookingTokenAction.REFUND_TOKEN, BookingTokenAction.KEEP_TOKEN);
            default -> Set.of();
        };
    }

    /**
     * @param endCause why the booking ended, or null while it is still held.
     *                 A claim confirmed after the end settles straight away.
     */
    public static BookingTokenStatus next(
            BookingTokenAction action, BookingStatus status, BookingTokenStatus token, BookingParty actor,
            boolean managementMayAct, BookingEndCause endCause, boolean refundableOnTenantCancel) {
        if (action == null || !allowedActions(status, token, actor, managementMayAct).contains(action)) {
            throw new ValidationException("This action is not available for this booking's token.");
        }
        boolean held = status == BookingStatus.AWAITING_TOKEN;
        if (action == BookingTokenAction.MARK_RECEIVED && held == (endCause != null)) {
            throw new IllegalArgumentException("Only an ended booking has an end cause, and it must have one");
        }
        return switch (action) {
            case CLAIM_PAID -> BookingTokenStatus.CLAIMED;
            case MARK_RECEIVED -> held
                    ? BookingTokenStatus.RECEIVED : settle(endCause, refundableOnTenantCancel);
            case MARK_NOT_RECEIVED -> BookingTokenStatus.NOT_RECEIVED;
            case WAIVE -> BookingTokenStatus.NOT_REQUIRED;
            case REFUND_TOKEN -> BookingTokenStatus.REFUND_DUE;
            case KEEP_TOKEN -> BookingTokenStatus.KEPT;
        };
    }

    /** An owner waiver confirms immediately. Receipt requires a separate property confirmation. */
    public static boolean confirmsBooking(BookingTokenAction action, BookingStatus status) {
        return status == BookingStatus.AWAITING_TOKEN
                && action == BookingTokenAction.WAIVE;
    }

    /**
     * What becomes of a token the property holds when the booking ends. The
     * tenant walking away follows the owner's yes-or-no refund rule. The
     * property failing to host always owes it back. A guest who did not arrive
     * waits on the handler's own decision (user, 2026-10-28).
     */
    public static BookingTokenStatus settle(BookingEndCause cause, boolean refundableOnTenantCancel) {
        Objects.requireNonNull(cause);
        if (cause == BookingEndCause.MOVED_IN) {
            return BookingTokenStatus.ADJUSTED;
        }
        if (!cause.isTenantSide()) {
            return BookingTokenStatus.REFUND_DUE;
        }
        if (cause == BookingEndCause.TENANT_DID_NOT_ARRIVE) {
            return BookingTokenStatus.DECISION_PENDING;
        }
        return refundableOnTenantCancel ? BookingTokenStatus.REFUND_DUE : BookingTokenStatus.KEPT;
    }

    /**
     * Applied when the booking ends. Only received money is settled. A claim
     * still waiting keeps waiting, and is settled when the property answers.
     */
    public static BookingTokenStatus onBookingEnd(
            BookingTokenStatus token, BookingEndCause cause, boolean refundableOnTenantCancel) {
        Objects.requireNonNull(token);
        return token == BookingTokenStatus.RECEIVED ? settle(cause, refundableOnTenantCancel) : token;
    }

    public static String requireNotReceivedReason(String reason) {
        String trimmed = reason == null ? "" : reason.strip();
        if (trimmed.isEmpty()) {
            throw new ValidationException("Tell the tenant why the payment is not counted as received.");
        }
        return trimmed;
    }
}
