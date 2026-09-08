package com.khatiyan.d_modules.billing.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * The state machine behind "Pay Now stays blocked".
 *
 * <p>Which states are LIVE is the whole contract: a live intent blocks a fresh
 * attempt, and the two that are live are the two a tenant has not finished
 * answering for. Getting that set wrong either lets someone pay twice or strands
 * a bill nobody can pay.
 */
class PaymentIntentLifecycleTest {

    private static PaymentIntent open() {
        return PaymentIntent.open(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                13_500_00L, "BIL-2026-000042", "owner@okaxis");
    }

    @Test
    void opensInCreatedAndBlocksAFreshAttempt() {
        PaymentIntent intent = open();

        assertThat(intent.getStatus()).isEqualTo(PaymentIntentStatus.CREATED);
        assertThat(intent.isLive()).isTrue();
        assertThat(intent.getTenantDecidedAt()).isNull();
    }

    /**
     * Closing the modal without choosing leaves it exactly here — nothing is
     * called, so the intent stays CREATED and stays live. The bill goes on
     * showing an open attempt, which is the specified behaviour.
     */
    @Test
    void staysLiveWhenNobodyAnswers() {
        assertThat(open().isLive()).isTrue();
    }

    // ---- The tenant's answer ---------------------------------------------

    @Test
    void cancellingReleasesTheBill() {
        PaymentIntent intent = open();
        intent.cancelByTenant();

        assertThat(intent.getStatus()).isEqualTo(PaymentIntentStatus.TENANT_CANCELLED);
        assertThat(intent.isLive()).isFalse();
        assertThat(intent.getTenantDecidedAt()).isNotNull();
    }

    /** Claiming success keeps the block — a claim must not permit a second payment. */
    @Test
    void confirmingKeepsTheBlock() {
        PaymentIntent intent = open();
        intent.confirmByTenant("UTR123456", "Paid at 9pm", List.of("https://img/1.png"));

        assertThat(intent.getStatus()).isEqualTo(PaymentIntentStatus.TENANT_CONFIRMED);
        assertThat(intent.isLive()).isTrue();
        assertThat(intent.getTenantReferenceText()).isEqualTo("UTR123456");
        assertThat(intent.getProofImageUrls()).containsExactly("https://img/1.png");
    }

    /**
     * A tenant who paid should not be blocked by not knowing where their banking
     * app hides the UTR. The owner still has the short code in their statement.
     */
    @Test
    void acceptsASuccessClaimWithNoEvidenceAtAll() {
        PaymentIntent intent = open();
        intent.confirmByTenant(null, null, null);

        assertThat(intent.getStatus()).isEqualTo(PaymentIntentStatus.TENANT_CONFIRMED);
        assertThat(intent.getTenantReferenceText()).isNull();
        assertThat(intent.getProofImageUrls()).isEmpty();
    }

    @Test
    void refusesMoreProofImagesThanTheCap() {
        assertThatThrownBy(() -> open().confirmByTenant(null, null, List.of("a", "b", "c")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("at most 2");
    }

    /** Withdrawing a claim under review would leave the owner ruling on nothing. */
    @Test
    void refusesToCancelAClaimAlreadyUnderReview() {
        PaymentIntent intent = open();
        intent.confirmByTenant(null, null, null);

        assertThatThrownBy(intent::cancelByTenant).isInstanceOf(ValidationException.class);
    }

    @Test
    void refusesASecondAnswerFromTheTenant() {
        PaymentIntent intent = open();
        intent.cancelByTenant();

        assertThatThrownBy(() -> intent.confirmByTenant(null, null, null))
                .isInstanceOf(ValidationException.class);
    }

    // ---- The owner's verdict ---------------------------------------------

    @Test
    void verifyingRecordsWhoDecidedAndReleasesTheBlock() {
        UUID owner = UUID.randomUUID();
        PaymentIntent intent = open();
        intent.confirmByTenant(null, null, null);
        intent.verifyByOwner(owner);

        assertThat(intent.getStatus()).isEqualTo(PaymentIntentStatus.OWNER_VERIFIED);
        assertThat(intent.isLive()).isFalse();
        assertThat(intent.getOwnerDecidedByUserId()).isEqualTo(owner);
        assertThat(intent.getOwnerDecidedAt()).isNotNull();
    }

    @Test
    void rejectingReleasesTheBlockSoTheTenantCanTryAgain() {
        PaymentIntent intent = open();
        intent.confirmByTenant(null, null, null);
        intent.rejectByOwner(UUID.randomUUID());

        assertThat(intent.getStatus()).isEqualTo(PaymentIntentStatus.OWNER_REJECTED);
        assertThat(intent.isLive()).isFalse();
    }

    /** An owner cannot rule on an attempt the tenant has not claimed success on. */
    @Test
    void refusesAnOwnerVerdictOnAnUnclaimedAttempt() {
        assertThatThrownBy(() -> open().verifyByOwner(UUID.randomUUID()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("not waiting for a decision");
    }

    @Test
    void refusesASecondOwnerVerdict() {
        PaymentIntent intent = open();
        intent.confirmByTenant(null, null, null);
        intent.verifyByOwner(UUID.randomUUID());

        assertThatThrownBy(() -> intent.rejectByOwner(UUID.randomUUID()))
                .isInstanceOf(ValidationException.class);
    }

    /** A verdict is never anonymous — the database check constraint says so too. */
    @Test
    void refusesAnAnonymousVerdict() {
        PaymentIntent intent = open();
        intent.confirmByTenant(null, null, null);

        assertThatThrownBy(() -> intent.verifyByOwner(null)).isInstanceOf(ValidationException.class);
    }
}
