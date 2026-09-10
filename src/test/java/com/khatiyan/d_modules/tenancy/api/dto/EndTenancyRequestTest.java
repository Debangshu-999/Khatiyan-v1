package com.khatiyan.d_modules.tenancy.api.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest.DamageCharge;
import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest.ExitCharge;
import com.khatiyan.d_modules.billing.api.dto.ExitChargeInstrument;

class EndTenancyRequestTest {

    @Test
    void rejectsEarlyExitChargeAgainstNonRefundableDeposit() {
        EndTenancyRequest request = new EndTenancyRequest(
                List.of(new ExitCharge(
                        10_000L,
                        ExitChargeInstrument.DEPOSIT,
                        "Early exit charge",
                        null)),
                false,
                null,
                List.of(),
                null);

        assertThat(request.isDepositCollectionCompatible()).isFalse();
    }

    @Test
    void rejectsDamageChargeAgainstNonRefundableDeposit() {
        EndTenancyRequest request = new EndTenancyRequest(
                List.of(),
                false,
                new DamageCharge(
                        List.of("Mattress"),
                        List.of(),
                        ExitChargeInstrument.DEPOSIT,
                        null),
                List.of(),
                null);

        assertThat(request.isDepositCollectionCompatible()).isFalse();
    }

    @Test
    void allowsChargesBilledWhileDepositIsNonRefundable() {
        EndTenancyRequest request = new EndTenancyRequest(
                List.of(new ExitCharge(
                        10_000L,
                        ExitChargeInstrument.ONE_OFF_BILL,
                        "Early exit charge",
                        null)),
                false,
                new DamageCharge(
                        List.of("Mattress"),
                        List.of(),
                        ExitChargeInstrument.ONE_OFF_BILL,
                        null),
                List.of(),
                null);

        assertThat(request.isDepositCollectionCompatible()).isTrue();
    }
}
