package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.model.DepositAccount;
import com.khatiyan.d_modules.billing.model.DepositAccountStatus;
import com.khatiyan.d_modules.billing.model.DepositMovement;
import com.khatiyan.d_modules.billing.repository.DepositAccountRepository;
import com.khatiyan.d_modules.billing.repository.DepositMovementRepository;
import com.khatiyan.d_modules.billing.service.DepositManagerService.ExitDeduction;

/**
 * The deposit half of the end-tenancy exit policy.
 *
 * <p>These are the rules that decide whether a tenant's money moves, so each one
 * is pinned to a scenario rather than asserted structurally.
 */
@ExtendWith(MockitoExtension.class)
class ExitDepositDeductionTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID TENANCY = UUID.randomUUID();

    @Mock
    private DepositAccountRepository depositAccountRepository;
    @Mock
    private DepositMovementRepository depositMovementRepository;

    private DepositManagerService service;
    private DepositAccount account;

    @BeforeEach
    void setUp() {
        service = new DepositManagerService(
                depositAccountRepository, depositMovementRepository, null, null, null, null, null);
        account = DepositAccount.open(TENANCY, UUID.randomUUID(), UUID.randomUUID());
    }

    /** Opens the account with a balance and lets saved movements accumulate. */
    private List<DepositMovement> openingBalanceOf(long paise) {
        List<DepositMovement> ledger = new ArrayList<>();
        ledger.add(DepositMovement.correctionAddition(account.getId(), "Opening deposit", paise, null));

        when(depositAccountRepository.findByTenancyId(TENANCY)).thenReturn(Optional.of(account));
        when(depositMovementRepository.findByDepositAccountId(account.getId())).thenReturn(ledger);
        return ledger;
    }

    @Test
    void deductsInOrderAndParksTheAccountPendingSettlement() {
        openingBalanceOf(10_000_00L);

        service.applyExitDeductions(ACTOR, TENANCY, List.of(
                new ExitDeduction("Early exit charge", 3_000_00L),
                new ExitDeduction("Damage charges", 2_000_00L)), true);

        ArgumentCaptor<DepositMovement> saved = ArgumentCaptor.forClass(DepositMovement.class);
        verify(depositMovementRepository, org.mockito.Mockito.times(2)).save(saved.capture());
        assertThat(saved.getAllValues())
                .extracting(DepositMovement::getReason)
                .containsExactly("Early exit charge", "Damage charges");

        assertThat(account.getStatus()).isEqualTo(DepositAccountStatus.PENDING_SETTLEMENT);
        assertThat(account.getPayableAtExit()).isTrue();
    }

    /**
     * The bug this whole design exists to prevent: ₹6,000 and ₹5,000 are each
     * affordable against a ₹10,000 deposit, and together they are not. Checking
     * both against the opening balance would let them through.
     */
    @Test
    void refusesTheSecondDeductionWhenTheFirstAlreadySpentTheBalance() {
        openingBalanceOf(10_000_00L);

        assertThatThrownBy(() -> service.applyExitDeductions(ACTOR, TENANCY, List.of(
                new ExitDeduction("Early exit charge", 6_000_00L),
                new ExitDeduction("Damage charges", 5_000_00L)), true))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Damage charges")
                .hasMessageContaining("₹4,000");
    }

    @Test
    void allowsTwoDeductionsThatExactlyExhaustTheDeposit() {
        openingBalanceOf(10_000_00L);

        assertThatCode(() -> service.applyExitDeductions(ACTOR, TENANCY, List.of(
                new ExitDeduction("Early exit charge", 6_000_00L),
                new ExitDeduction("Damage charges", 4_000_00L)), true))
                .doesNotThrowAnyException();
    }

    /**
     * Deducting from a deposit that is not coming back charges the tenant twice
     * for the same money.
     */
    @Test
    void refusesToDeductFromAForfeitedDeposit() {
        when(depositAccountRepository.findByTenancyId(TENANCY)).thenReturn(Optional.of(account));

        assertThatThrownBy(() -> service.applyExitDeductions(
                ACTOR, TENANCY, List.of(new ExitDeduction("Damage charges", 1_00L)), false))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("one-off bill");

        verify(depositMovementRepository, never()).save(any());
    }

    @Test
    void recordsAForfeitWithNoDeductionsAsNotPayable() {
        openingBalanceOf(10_000_00L);

        service.applyExitDeductions(ACTOR, TENANCY, List.of(), false);

        assertThat(account.getStatus()).isEqualTo(DepositAccountStatus.PENDING_SETTLEMENT);
        assertThat(account.getPayableAtExit()).isFalse();
        verify(depositMovementRepository, never()).save(any());
    }

    @Test
    void refusesAnAccountThatHasAlreadyLeftActive() {
        account.markPendingSettlement(true);
        when(depositAccountRepository.findByTenancyId(TENANCY)).thenReturn(Optional.of(account));

        assertThatThrownBy(() -> service.applyExitDeductions(ACTOR, TENANCY, List.of(), true))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("no longer active");
    }
}
