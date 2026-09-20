package com.khatiyan.d_modules.servicebalance.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.exception.BusinessException;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceAccountRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceEntryRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceTopUpRepository;

/**
 * The only place a paid service can be refused.
 *
 * <p>An attempt is never refused: by then a tenant is mid-verification and the
 * provider has already been paid out of Khatiyan's own prepaid balance. So every
 * limit is enforced here instead, when an owner ORDERS checks — a moment where
 * "no, clear your dues first" costs nobody a half-finished check.
 */
@ExtendWith(MockitoExtension.class)
class ServiceBalanceOrderGuardTest {

    @Mock
    private ServiceBalanceAccountRepository accountRepository;

    @Mock
    private ServiceBalanceEntryRepository entryRepository;

    @Mock
    private ServiceBalanceTopUpRepository topUpRepository;

    private ServiceBalanceService service;
    private ServiceBalanceProperties properties;
    private UUID ownerUserId;
    private ServiceBalanceAccount account;

    @BeforeEach
    void setUp() {
        properties = new ServiceBalanceProperties();
        service = new ServiceBalanceService(accountRepository, entryRepository, topUpRepository, properties);
        ownerUserId = UUID.randomUUID();
        account = ServiceBalanceAccount.open(ownerUserId);
    }

    private void accountExists() {
        when(accountRepository.findByOwnerUserId(ownerUserId)).thenReturn(Optional.of(account));
    }

    /** Orders one check at the default Rs 15, with nothing else committed. */
    private void order(long committedPaise, long newOrderPaise) {
        service.ensureCanOrder(ownerUserId, committedPaise, newOrderPaise);
    }

    @Test
    void anOwnerWithMoneyMayOrder() {
        account.credit(50_000L);
        accountExists();

        assertThatCode(() -> order(0L, 4_500L)).doesNotThrowAnyException();
    }

    /**
     * An empty balance is not a refusal. The owner is trusted for the dues
     * ceiling, which is what lets a manager onboard a tenant on a Sunday
     * without the owner being reachable to top up.
     */
    @Test
    void anEmptyBalanceStillAllowsAModestOrder() {
        accountExists();

        assertThatCode(() -> order(0L, 4_500L)).doesNotThrowAnyException();
    }

    @Test
    void anOwnerAtTheDuesCeilingCannotOrderMore() {
        account.chargeToOutstanding(properties.getMaxOutstandingPaise());
        accountExists();

        assertThatThrownBy(() -> order(0L, 1_500L))
                .isInstanceOf(BusinessException.class)
                .extracting(problem -> ((BusinessException) problem).getCode())
                .isEqualTo("SERVICE_BALANCE_DUES");
    }

    /**
     * The limit that actually bites. Ten tenancies each ordering five attempts
     * would pass a per-order dues check every single time, and still run up far
     * more real debt than the ceiling was ever meant to allow — because none of
     * it is dues until the attempts run.
     */
    @Test
    void ordersAlreadyPlacedCountAgainstTheNextOne() {
        accountExists();

        assertThatThrownBy(() -> order(properties.getMaxExposurePaise(), 1_500L))
                .isInstanceOf(BusinessException.class)
                .extracting(problem -> ((BusinessException) problem).getCode())
                .isEqualTo("SERVICE_BALANCE_EXPOSURE");
    }

    /** Money already paid in covers what it covers, so it is not exposure. */
    @Test
    void moneyOnTheBalanceOffsetsWhatIsCommitted() {
        account.credit(properties.getMaxExposurePaise() + 10_000L);
        accountExists();

        assertThatCode(() -> order(properties.getMaxExposurePaise(), 1_500L)).doesNotThrowAnyException();
    }

    @Test
    void aLockedAccountCannotOrderAtAll() {
        account.credit(50_000L);
        account.lock("Chargeback received", Instant.now());
        accountExists();

        assertThatThrownBy(() -> order(0L, 1_500L))
                .isInstanceOf(BusinessException.class)
                .extracting(problem -> ((BusinessException) problem).getCode())
                .isEqualTo("SERVICE_BALANCE_LOCKED");
    }
}
