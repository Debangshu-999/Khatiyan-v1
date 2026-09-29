package com.khatiyan.d_modules.billing.api.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.billing.model.DepositAccount;

class DepositAccountResponseTest {

    @Test
    void usesLedgerActivityWhenItIsTheOnlyRecordedUpdate() {
        DepositAccount account = DepositAccount.open(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        Instant ledgerActivity = Instant.parse("2026-09-28T12:00:00Z");

        DepositAccountResponse response = DepositAccountResponse.from(
                account,
                "Test tenant",
                "TEN-2026-000001",
                7_000_00L,
                ledgerActivity,
                List.of());

        assertThat(response.updatedAt()).isEqualTo(ledgerActivity);
    }
}
