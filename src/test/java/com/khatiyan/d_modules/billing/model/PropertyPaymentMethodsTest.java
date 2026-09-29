package com.khatiyan.d_modules.billing.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * Which ways a property takes money (2026-09-28): ticked per method, cash on by
 * default, and a ticked online method must have the details a tenant pays to.
 */
class PropertyPaymentMethodsTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final String QR = "https://res.cloudinary.com/demo/image/upload/qr.png";

    @Test
    void aPropertyStartsTakingCashOnlyWithNoCode() {
        PropertyPaymentDetails details = PropertyPaymentDetails.empty(UUID.randomUUID());

        assertThat(details.acceptedMethods()).containsExactly(ManualPaymentMethod.CASH);
        assertThat(details.isCashOtpRequired()).isFalse();
    }

    @Test
    void theMethodsComeBackInTheOrderTenantsSeeThem() {
        PropertyPaymentDetails details = PropertyPaymentDetails.empty(UUID.randomUUID());
        details.update("owner@okbank", "Asha Roy", "9876543210", QR, "123456789012", "HDFC0001234", "Asha Roy", ACTOR);

        details.setAcceptance(
                Set.of(ManualPaymentMethod.CASH, ManualPaymentMethod.CHEQUE, ManualPaymentMethod.UPI,
                        ManualPaymentMethod.BANK_TRANSFER, ManualPaymentMethod.CARD),
                true);

        assertThat(details.acceptedMethods()).containsExactly(
                ManualPaymentMethod.CASH, ManualPaymentMethod.UPI, ManualPaymentMethod.BANK_TRANSFER,
                ManualPaymentMethod.CARD, ManualPaymentMethod.CHEQUE);
        assertThat(details.isCashOtpRequired()).isTrue();
    }

    @Test
    void atLeastOneMethodMustBeTicked() {
        assertThatThrownBy(() -> PropertyPaymentDetails.empty(UUID.randomUUID()).setAcceptance(Set.of(), false))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("at least one");
    }

    @Test
    void upiCanOnlyBeTickedWithItsDetails() {
        assertThatThrownBy(() -> PropertyPaymentDetails.empty(UUID.randomUUID())
                .setAcceptance(Set.of(ManualPaymentMethod.UPI), false))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("UPI");
    }

    @Test
    void bankTransferCanOnlyBeTickedWithItsDetails() {
        assertThatThrownBy(() -> PropertyPaymentDetails.empty(UUID.randomUUID())
                .setAcceptance(Set.of(ManualPaymentMethod.BANK_TRANSFER), false))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("bank");
    }

    /** Unticking hides a method from tenants without throwing its details away. */
    @Test
    void unTickingUpiKeepsItsDetails() {
        PropertyPaymentDetails details = PropertyPaymentDetails.empty(UUID.randomUUID());
        details.update("owner@okbank", "Asha Roy", "9876543210", QR, null, null, null, ACTOR);

        details.setAcceptance(Set.of(ManualPaymentMethod.CASH), false);

        assertThat(details.accepts(ManualPaymentMethod.UPI)).isFalse();
        assertThat(details.getUpiVpa()).isEqualTo("owner@okbank");
    }

    @Test
    void otherIsNeverAWayToBePaid() {
        assertThatThrownBy(() -> PropertyPaymentDetails.empty(UUID.randomUUID())
                .setAcceptance(Set.of(ManualPaymentMethod.OTHER), false))
                .isInstanceOf(ValidationException.class);
    }
}
