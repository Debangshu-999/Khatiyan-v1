package com.khatiyan.d_modules.billing.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * A claim raised straight from a payment method's tab (2026-09-28): it goes to
 * the owner at once, carries its method, and its proof is optional.
 */
class PaymentClaimTest {

    private static PaymentIntent claim(ManualPaymentMethod method, String reference, List<String> proofs) {
        return PaymentIntent.claim(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                13_500_00L, "BIL-2026-000240", method, reference, null, proofs);
    }

    @Test
    void aClaimGoesStraightToTheOwnerWithItsMethod() {
        PaymentIntent intent = claim(ManualPaymentMethod.CHEQUE, "123456", List.of());

        assertThat(intent.getStatus()).isEqualTo(PaymentIntentStatus.TENANT_CONFIRMED);
        assertThat(intent.getMethod()).isEqualTo(ManualPaymentMethod.CHEQUE);
        assertThat(intent.getTenantReferenceText()).isEqualTo("123456");
        assertThat(intent.getUpiVpa()).isNull();
        assertThat(intent.getTenantDecidedAt()).isNotNull();
    }

    /** Proof is the tenant's to give or not (user, 2026-09-28). */
    @Test
    void aClaimNeedsNoProof() {
        PaymentIntent intent = claim(ManualPaymentMethod.BANK_TRANSFER, null, null);

        assertThat(intent.getTenantReferenceText()).isNull();
        assertThat(intent.getProofImageUrls()).isEmpty();
    }

    /** Cash is handed over at the desk and recorded by the owner, never claimed. */
    @Test
    void cashIsNeverClaimed() {
        assertThatThrownBy(() -> claim(ManualPaymentMethod.CASH, null, List.of()))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> claim(ManualPaymentMethod.OTHER, null, List.of()))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void aUpiLinkAttemptIsAUpiClaim() {
        PaymentIntent intent = PaymentIntent.open(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                13_500_00L, "BIL-2026-000240", "owner@okbank");

        assertThat(intent.getMethod()).isEqualTo(ManualPaymentMethod.UPI);
    }
}
