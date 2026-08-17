package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.model.DepositAccount;

/**
 * Settlement executes the decision made at end-tenancy; it never makes one.
 *
 * <p>Each case here is a way the two could drift apart — and every drift moves
 * someone's money the wrong way.
 */
class DepositSettlementDecisionTest {

    private static final String REFUND_PATH = "close the account instead";
    private static final String CLOSE_PATH = "settle it instead";

    private static DepositAccount accountMarked(Boolean payable) {
        DepositAccount account = DepositAccount.open(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        if (payable != null) {
            account.markPendingSettlement(payable);
        }
        return account;
    }

    @Test
    void allowsSettlingADepositMarkedRefundable() {
        assertThatCode(() -> DepositManagerService.ensureDecidedAtExit(accountMarked(true), true, REFUND_PATH))
                .doesNotThrowAnyException();
    }

    @Test
    void allowsClosingADepositMarkedNotRefundable() {
        assertThatCode(() -> DepositManagerService.ensureDecidedAtExit(accountMarked(false), false, CLOSE_PATH))
                .doesNotThrowAnyException();
    }

    /** Paying out a deposit the exit decided to keep. */
    @Test
    void refusesToSettleADepositMarkedNotRefundable() {
        assertThatThrownBy(() -> DepositManagerService.ensureDecidedAtExit(accountMarked(false), true, REFUND_PATH))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining(REFUND_PATH);
    }

    /** Pocketing a deposit the exit decided to return. */
    @Test
    void refusesToCloseADepositMarkedRefundable() {
        assertThatThrownBy(() -> DepositManagerService.ensureDecidedAtExit(accountMarked(true), false, CLOSE_PATH))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining(CLOSE_PATH);
    }

    /**
     * Accounts that predate the exit flow, and tenancies that ended without one.
     * Either default moves money on an assumption, so neither is taken.
     */
    @Test
    void refusesAnAccountWithNoRecordedDecision() {
        assertThatThrownBy(() -> DepositManagerService.ensureDecidedAtExit(accountMarked(null), true, REFUND_PATH))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("No payability decision");

        assertThatThrownBy(() -> DepositManagerService.ensureDecidedAtExit(accountMarked(null), false, CLOSE_PATH))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("No payability decision");
    }

    /**
     * A refundable deposit fully consumed by exit charges settles at zero.
     *
     * <p>This used to be refused, which left the account unreachable: settle was
     * blocked by the empty-balance guard, and close-unpaid is barred for a
     * deposit marked refundable — so it sat in PENDING_SETTLEMENT with no action
     * that could clear it.
     */
    @Test
    void allowsSettlingARefundableDepositWithNothingLeft() {
        assertThatCode(() -> DepositManagerService.ensureDecidedAtExit(accountMarked(true), true, REFUND_PATH))
                .doesNotThrowAnyException();
    }

    @Test
    void refusesAnAccountThatIsAlreadySettled() {
        DepositAccount account = accountMarked(true);
        account.settle(Instant.now());

        assertThatThrownBy(() -> DepositManagerService.ensureDecidedAtExit(account, true, REFUND_PATH))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already settled");
    }
}
