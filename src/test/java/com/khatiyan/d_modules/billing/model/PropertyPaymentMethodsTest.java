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

    // ---- Where booking tokens are paid (2026-10-11) -----------------------------

    @Test
    void tokensArePaidToTheBillDetailsUntilTheOwnerSaysOtherwise() {
        PropertyPaymentDetails details = PropertyPaymentDetails.empty(UUID.randomUUID());

        assertThat(details.isTokenUsesBillDetails()).isTrue();
        // Cash only: nothing a person booking a bed can pay from where they are and record.
        assertThat(details.tokenMethods()).isEmpty();
        assertThat(details.tokenAcceptedMethods()).containsExactly(ManualPaymentMethod.CASH);

        details.update("owner@okbank", "Asha Roy", "9876543210", QR, "123456789012", "HDFC0001234", "Asha Roy", ACTOR);
        // Saved and not ticked for bills: not offered for a token either.
        assertThat(details.tokenMethods()).isEmpty();

        details.setAcceptance(
                Set.of(ManualPaymentMethod.CASH, ManualPaymentMethod.CHEQUE, ManualPaymentMethod.UPI,
                        ManualPaymentMethod.BANK_TRANSFER, ManualPaymentMethod.CARD),
                false);
        // A token is recorded by UPI or a bank transfer, never by what changes hands at the desk.
        assertThat(details.tokenMethods())
                .containsExactly(ManualPaymentMethod.UPI, ManualPaymentMethod.BANK_TRANSFER);
        assertThat(details.tokenAcceptedMethods()).containsExactly(
                ManualPaymentMethod.CASH, ManualPaymentMethod.UPI, ManualPaymentMethod.BANK_TRANSFER,
                ManualPaymentMethod.CARD, ManualPaymentMethod.CHEQUE);
        assertThat(com.khatiyan.d_modules.billing.api.dto.PayeeDetailsResponse.forToken(details).upiVpa())
                .isEqualTo("owner@okbank");
    }

    @Test
    void aTokensOwnDetailsDecideHowItIsPaidWhateverBillsTake() {
        PropertyPaymentDetails details = PropertyPaymentDetails.empty(UUID.randomUUID());
        details.update("owner@okbank", "Asha Roy", "9876543210", QR, null, null, null, ACTOR);
        details.setAcceptance(Set.of(ManualPaymentMethod.CASH, ManualPaymentMethod.UPI), false);

        details.updateTokenDetails(false, null, null, null, null, " 998877665544 ", "icic0000123", "Asha Tokens", ACTOR);

        assertThat(details.isTokenUsesBillDetails()).isFalse();
        // The bill's UPI is not where a token goes, and the token's bank account is not where a bill goes.
        assertThat(details.tokenMethods()).containsExactly(ManualPaymentMethod.BANK_TRANSFER);
        assertThat(details.tokenAcceptedMethods())
                .containsExactly(ManualPaymentMethod.CASH, ManualPaymentMethod.BANK_TRANSFER);
        assertThat(details.acceptedMethods()).containsExactly(ManualPaymentMethod.CASH, ManualPaymentMethod.UPI);
        var payee = com.khatiyan.d_modules.billing.api.dto.PayeeDetailsResponse.forToken(details);
        assertThat(payee.bankAccountNumber()).isEqualTo("998877665544");
        assertThat(payee.bankIfsc()).isEqualTo("ICIC0000123");
        assertThat(payee.payeeName()).isEqualTo("Asha Tokens");
        assertThat(payee.upiVpa()).isNull();
        assertThat(payee.hasBankDetails()).isTrue();

        // UPI of its own instead: all four details, as a bill's.
        details.updateTokenDetails(false, "tokens@okbank", "Asha Tokens", "9123456780", QR, null, null, null, ACTOR);
        assertThat(details.tokenMethods()).containsExactly(ManualPaymentMethod.UPI);
        assertThat(com.khatiyan.d_modules.billing.api.dto.PayeeDetailsResponse.forToken(details).upiVpa())
                .isEqualTo("tokens@okbank");

        // Back to the bill details: the token's own are gone, whatever came with the request.
        details.updateTokenDetails(true, "ignored@okbank", "Ignored", "9000000000", QR, "111111", "HDFC0001234", "x", ACTOR);
        assertThat(details.isTokenUsesBillDetails()).isTrue();
        assertThat(details.getTokenUpiVpa()).isNull();
        assertThat(details.getTokenBankAccountNumber()).isNull();
        assertThat(details.tokenMethods()).containsExactly(ManualPaymentMethod.UPI);
    }

    @Test
    void aTokensOwnDetailsPassTheChecksABillsDoAndNeedSomewhereToPay() {
        PropertyPaymentDetails details = PropertyPaymentDetails.empty(UUID.randomUUID());

        // "Different details" with none given leaves a person nowhere to pay.
        assertThatThrownBy(() -> details.updateTokenDetails(false, null, null, null, null, null, null, null, ACTOR))
                .isInstanceOf(ValidationException.class).hasMessageContaining("booking tokens");
        assertThatThrownBy(
                () -> details.updateTokenDetails(false, "tokens@okbank", null, null, null, null, null, null, ACTOR))
                .isInstanceOf(ValidationException.class).hasMessageContaining("together");
        assertThatThrownBy(
                () -> details.updateTokenDetails(false, null, null, null, null, "998877665544", null, null, ACTOR))
                .isInstanceOf(ValidationException.class).hasMessageContaining("both");
        assertThatThrownBy(
                () -> details.updateTokenDetails(false, null, null, null, null, "998877665544", "NOPE", null, ACTOR))
                .isInstanceOf(ValidationException.class).hasMessageContaining("valid IFSC");
        // A refused save changed nothing.
        assertThat(details.isTokenUsesBillDetails()).isTrue();
        assertThat(details.getTokenBankAccountNumber()).isNull();
        assertThat(com.khatiyan.d_modules.billing.api.dto.PayeeDetailsResponse.forToken(details)).isNull();
    }
}
