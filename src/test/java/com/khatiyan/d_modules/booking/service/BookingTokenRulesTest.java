package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTokenAction;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.booking.model.BookingTokenTerms;

/** Pure token rules. The token is a record of what each side says; no money moves here. */
class BookingTokenRulesTest {

    private static final Instant NOW = Instant.parse("2026-10-09T06:30:00Z");

    @Test
    void theOwnersRefundAnswerAppliesOnlyWhenTheTenantWalksAway() {
        for (BookingEndCause cause : new BookingEndCause[]{BookingEndCause.TENANT_CANCELLED,
                BookingEndCause.TENANT_DID_NOT_SIGN, BookingEndCause.BOOKED_ELSEWHERE}) {
            assertThat(cause.isTenantSide()).isTrue();
            assertThat(BookingTokenRules.settle(cause, true)).isEqualTo(BookingTokenStatus.REFUND_DUE);
            assertThat(BookingTokenRules.settle(cause, false)).isEqualTo(BookingTokenStatus.KEPT);
        }
    }

    /** A non-refundable token never lets the property keep money for its own failure. */
    @Test
    void thePropertyFailingToHostAlwaysOwesTheTokenBack() {
        for (BookingEndCause cause : new BookingEndCause[]{BookingEndCause.MANAGEMENT_CANCELLED,
                BookingEndCause.BED_NOT_READY, BookingEndCause.PROPERTY_CANNOT_HOST}) {
            assertThat(cause.isTenantSide()).isFalse();
            for (boolean refundable : new boolean[]{true, false}) {
                assertThat(BookingTokenRules.settle(cause, refundable)).isEqualTo(BookingTokenStatus.REFUND_DUE);
            }
        }
    }

    @Test
    void movingInTakesTheTokenOffTheFirstBillWhateverTheRefundAnswer() {
        assertThat(BookingTokenRules.settle(BookingEndCause.MOVED_IN, true)).isEqualTo(BookingTokenStatus.ADJUSTED);
        assertThat(BookingTokenRules.settle(BookingEndCause.MOVED_IN, false)).isEqualTo(BookingTokenStatus.ADJUSTED);
    }

    @ParameterizedTest
    @EnumSource(BookingTokenStatus.class)
    void onlyReceivedMoneyIsSettledWhenABookingEnds(BookingTokenStatus token) {
        BookingTokenStatus after = BookingTokenRules.onBookingEnd(token, BookingEndCause.TENANT_CANCELLED, false);
        assertThat(after).isEqualTo(token == BookingTokenStatus.RECEIVED ? BookingTokenStatus.KEPT : token);
    }

    @Test
    void theTenantClaimsOnlyWhileTheTokenIsAwaitedAndOwed() {
        for (BookingTokenStatus owed : new BookingTokenStatus[]{BookingTokenStatus.DUE, BookingTokenStatus.NOT_RECEIVED}) {
            assertThat(owed.isOwed()).isTrue();
            assertThat(tenant(BookingStatus.AWAITING_TOKEN, owed)).containsExactly(BookingTokenAction.CLAIM_PAID);
            assertThat(next(BookingTokenAction.CLAIM_PAID, BookingStatus.AWAITING_TOKEN, owed, BookingParty.TENANT, null))
                    .isEqualTo(BookingTokenStatus.CLAIMED);
            for (BookingStatus over : new BookingStatus[]{BookingStatus.EXPIRED, BookingStatus.CANCELLED,
                    BookingStatus.CONFIRMED, BookingStatus.AWAITING_HANDLER}) {
                assertThat(tenant(over, owed)).isEmpty();
            }
        }
        assertThat(tenant(BookingStatus.AWAITING_TOKEN, BookingTokenStatus.CLAIMED)).isEmpty();
        assertThat(tenant(BookingStatus.CONFIRMED, BookingTokenStatus.RECEIVED)).isEmpty();
    }

    /** Cash arrives with no claim, so the property records it directly. */
    @Test
    void thePropertyRecordsReceiptOrWaivesWhileTheTokenIsAwaited() {
        for (BookingTokenStatus owed : new BookingTokenStatus[]{BookingTokenStatus.DUE, BookingTokenStatus.NOT_RECEIVED}) {
            assertThat(management(BookingStatus.AWAITING_TOKEN, owed))
                    .containsExactlyInAnyOrder(BookingTokenAction.MARK_RECEIVED, BookingTokenAction.WAIVE);
            assertThat(next(BookingTokenAction.MARK_RECEIVED, BookingStatus.AWAITING_TOKEN, owed, BookingParty.MANAGEMENT, null))
                    .isEqualTo(BookingTokenStatus.RECEIVED);
            assertThat(next(BookingTokenAction.WAIVE, BookingStatus.AWAITING_TOKEN, owed, BookingParty.MANAGEMENT, null))
                    .isEqualTo(BookingTokenStatus.NOT_REQUIRED);
            assertThat(management(BookingStatus.EXPIRED, owed)).isEmpty();
            assertThat(management(BookingStatus.CANCELLED, owed)).isEmpty();
        }
    }

    @Test
    void receiptNeedsFinalConfirmationWhileAnOwnerWaiverStillConfirms() {
        assertThat(BookingTokenRules.confirmsBooking(BookingTokenAction.MARK_RECEIVED, BookingStatus.AWAITING_TOKEN)).isFalse();
        assertThat(BookingTokenRules.confirmsBooking(BookingTokenAction.WAIVE, BookingStatus.AWAITING_TOKEN)).isTrue();
        assertThat(BookingTokenRules.confirmsBooking(BookingTokenAction.CLAIM_PAID, BookingStatus.AWAITING_TOKEN)).isFalse();
        assertThat(BookingTokenRules.confirmsBooking(BookingTokenAction.MARK_NOT_RECEIVED, BookingStatus.AWAITING_TOKEN)).isFalse();
        assertThat(BookingTokenRules.confirmsBooking(BookingTokenAction.MARK_RECEIVED, BookingStatus.CANCELLED)).isFalse();
    }

    @Test
    void aClaimIsAnsweredReceivedOrNotReceivedWithAReason() {
        assertThat(management(BookingStatus.AWAITING_TOKEN, BookingTokenStatus.CLAIMED))
                .containsExactlyInAnyOrder(BookingTokenAction.MARK_RECEIVED, BookingTokenAction.MARK_NOT_RECEIVED);
        assertThat(next(BookingTokenAction.MARK_NOT_RECEIVED, BookingStatus.AWAITING_TOKEN, BookingTokenStatus.CLAIMED,
                BookingParty.MANAGEMENT, null)).isEqualTo(BookingTokenStatus.NOT_RECEIVED);
        for (String reason : new String[]{null, "", "  \t\n"}) {
            assertThatThrownBy(() -> BookingTokenRules.requireNotReceivedReason(reason))
                    .isInstanceOf(ValidationException.class);
        }
        assertThat(BookingTokenRules.requireNotReceivedReason("  No credit in the account.  "))
                .isEqualTo("No credit in the account.");
    }

    /** The money may have moved before the booking ended, so the claim still gets its answer. */
    @Test
    void aClaimConfirmedAfterTheBookingEndedSettlesStraightAway() {
        assertThat(management(BookingStatus.CANCELLED, BookingTokenStatus.CLAIMED))
                .containsExactlyInAnyOrder(BookingTokenAction.MARK_RECEIVED, BookingTokenAction.MARK_NOT_RECEIVED);
        assertThat(next(BookingTokenAction.MARK_RECEIVED, BookingStatus.CANCELLED, BookingTokenStatus.CLAIMED,
                BookingParty.MANAGEMENT, BookingEndCause.TENANT_CANCELLED)).isEqualTo(BookingTokenStatus.KEPT);
        assertThat(BookingTokenRules.next(BookingTokenAction.MARK_RECEIVED, BookingStatus.CANCELLED,
                BookingTokenStatus.CLAIMED, BookingParty.MANAGEMENT, true, BookingEndCause.TENANT_CANCELLED, true))
                .isEqualTo(BookingTokenStatus.REFUND_DUE);
        assertThat(next(BookingTokenAction.MARK_RECEIVED, BookingStatus.CANCELLED, BookingTokenStatus.CLAIMED,
                BookingParty.MANAGEMENT, BookingEndCause.MANAGEMENT_CANCELLED)).isEqualTo(BookingTokenStatus.REFUND_DUE);
        // An ended booking must say why it ended, and a held one cannot.
        assertThatThrownBy(() -> next(BookingTokenAction.MARK_RECEIVED, BookingStatus.CANCELLED,
                BookingTokenStatus.CLAIMED, BookingParty.MANAGEMENT, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> next(BookingTokenAction.MARK_RECEIVED, BookingStatus.AWAITING_TOKEN,
                BookingTokenStatus.CLAIMED, BookingParty.MANAGEMENT, BookingEndCause.TENANT_CANCELLED))
                .isInstanceOf(IllegalArgumentException.class);
    }

    /** A guest who did not arrive: the handler refunds or keeps the token, whatever the owner's rule (2026-10-28). */
    @Test
    void aNoShowsTokenWaitsForTheHandlerToRefundOrKeepIt() {
        for (boolean refundable : new boolean[]{true, false}) {
            assertThat(BookingTokenRules.settle(BookingEndCause.TENANT_DID_NOT_ARRIVE, refundable))
                    .isEqualTo(BookingTokenStatus.DECISION_PENDING);
        }
        assertThat(management(BookingStatus.CANCELLED, BookingTokenStatus.DECISION_PENDING))
                .containsExactlyInAnyOrder(BookingTokenAction.REFUND_TOKEN, BookingTokenAction.KEEP_TOKEN);
        assertThat(tenant(BookingStatus.CANCELLED, BookingTokenStatus.DECISION_PENDING)).isEmpty();
        assertThat(next(BookingTokenAction.REFUND_TOKEN, BookingStatus.CANCELLED, BookingTokenStatus.DECISION_PENDING,
                BookingParty.MANAGEMENT, BookingEndCause.TENANT_DID_NOT_ARRIVE)).isEqualTo(BookingTokenStatus.REFUND_DUE);
        assertThat(next(BookingTokenAction.KEEP_TOKEN, BookingStatus.CANCELLED, BookingTokenStatus.DECISION_PENDING,
                BookingParty.MANAGEMENT, BookingEndCause.TENANT_DID_NOT_ARRIVE)).isEqualTo(BookingTokenStatus.KEPT);
        // Refunds are not followed: one owed back offers nothing more to either side.
        assertThat(management(BookingStatus.CANCELLED, BookingTokenStatus.REFUND_DUE)).isEmpty();
        assertThat(tenant(BookingStatus.CANCELLED, BookingTokenStatus.REFUND_DUE)).isEmpty();
    }

    @ParameterizedTest
    @EnumSource(value = BookingTokenStatus.class,
            names = {"NOT_REQUIRED", "RECEIVED", "ADJUSTED", "KEPT", "REFUND_DUE", "REFUND_SENT", "REFUNDED"})
    void settledOrHeldTokensOfferNoActionToEitherSide(BookingTokenStatus token) {
        for (BookingStatus status : BookingStatus.values()) {
            assertThat(tenant(status, token)).isEmpty();
            assertThat(management(status, token)).isEmpty();
        }
    }

    @Test
    void settledMeansNothingMoreCanHappen() {
        for (BookingTokenStatus token : BookingTokenStatus.values()) {
            boolean settled = Set.of(BookingTokenStatus.NOT_REQUIRED, BookingTokenStatus.ADJUSTED,
                    BookingTokenStatus.KEPT, BookingTokenStatus.REFUND_DUE, BookingTokenStatus.REFUND_SENT,
                    BookingTokenStatus.REFUNDED).contains(token);
            assertThat(token.isSettled()).isEqualTo(settled);
        }
    }

    @Test
    void aManagerWithoutBookingsAccessAndAMissingActorGetNothing() {
        for (BookingTokenStatus token : BookingTokenStatus.values()) {
            assertThat(BookingTokenRules.allowedActions(BookingStatus.AWAITING_TOKEN, token,
                    BookingParty.MANAGEMENT, false)).isEmpty();
            assertThat(BookingTokenRules.allowedActions(BookingStatus.AWAITING_TOKEN, token, null, true)).isEmpty();
        }
        assertThatThrownBy(() -> BookingTokenRules.next(BookingTokenAction.MARK_RECEIVED, BookingStatus.AWAITING_TOKEN,
                BookingTokenStatus.DUE, BookingParty.MANAGEMENT, false, null, false)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> next(null, BookingStatus.AWAITING_TOKEN, BookingTokenStatus.DUE,
                BookingParty.MANAGEMENT, null)).isInstanceOf(ValidationException.class);
        // A tenant can never mark their own token received.
        assertThatThrownBy(() -> next(BookingTokenAction.MARK_RECEIVED, BookingStatus.AWAITING_TOKEN,
                BookingTokenStatus.CLAIMED, BookingParty.TENANT, null)).isInstanceOf(ValidationException.class);
    }

    @Test
    void theTokenOwedIsNeverMoreThanOneMonthOfTheAgreedRent() {
        BookingTokenTerms terms = BookingTokenTerms.of(500_000L, false);
        assertThat(terms.dueFor(880_000L)).isEqualTo(500_000L);
        assertThat(terms.dueFor(500_000L)).isEqualTo(500_000L);
        assertThat(terms.dueFor(420_000L)).isEqualTo(420_000L);
        for (Long rent : new Long[]{null, 0L, -1L}) {
            assertThatThrownBy(() -> terms.dueFor(rent)).isInstanceOf(ValidationException.class);
        }
    }

    @Test
    void aRequiredTokenNeedsAnAmountAndAWaivedOneCarriesNone() {
        for (long amount : new long[]{0L, -1L}) {
            assertThatThrownBy(() -> BookingTokenTerms.of(amount, true)).isInstanceOf(ValidationException.class);
        }
        BookingTokenTerms waived = new BookingTokenTerms(false, 300_000L, true);
        assertThat(waived).isEqualTo(BookingTokenTerms.waived());
        assertThat(waived.amountPaise()).isZero();
        assertThat(waived.refundableOnTenantCancel()).isFalse();
        assertThat(waived.dueFor(880_000L)).isZero();
        assertThat(BookingTokenTerms.of(200_000L, true).refundableOnTenantCancel()).isTrue();
    }

    private static Set<BookingTokenAction> tenant(BookingStatus status, BookingTokenStatus token) {
        return BookingTokenRules.allowedActions(status, token, BookingParty.TENANT, true);
    }

    private static Set<BookingTokenAction> management(BookingStatus status, BookingTokenStatus token) {
        return BookingTokenRules.allowedActions(status, token, BookingParty.MANAGEMENT, true);
    }

    /** Not refundable, which is the stricter of the owner's two answers. */
    private static BookingTokenStatus next(BookingTokenAction action, BookingStatus status, BookingTokenStatus token,
            BookingParty actor, BookingEndCause endCause) {
        return BookingTokenRules.next(action, status, token, actor, true, endCause, false);
    }
}
