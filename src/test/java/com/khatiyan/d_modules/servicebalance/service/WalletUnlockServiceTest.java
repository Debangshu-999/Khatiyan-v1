package com.khatiyan.d_modules.servicebalance.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.event.PinChangedEvent;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;

class WalletUnlockServiceTest {
    final AuthModule auth = mock(AuthModule.class);
    final ServiceBalanceService balances = mock(ServiceBalanceService.class);
    final Clock clock = mock(Clock.class);
    final UserPrincipal owner = new UserPrincipal(UUID.randomUUID(), "+919876543210", "OWNER", UUID.randomUUID());
    final WalletUnlockService service = new WalletUnlockService(auth, balances, clock);
    final Instant now = Instant.parse("2026-10-01T10:00:00Z");

    void lockedAccount() {
        var account = ServiceBalanceAccount.open(owner.userId());
        account.setWalletLockEnabled(true);
        when(balances.readAccount(owner.userId())).thenReturn(account);
        when(clock.instant()).thenReturn(now);
    }

    @Test void grantIsSessionBoundAndExpiresAfterFiveMinutes() {
        lockedAccount();
        var grant = service.unlock(owner, "135790", "127.0.0.1");
        assertEquals(now.plusSeconds(300), grant.expiresAt());
        assertDoesNotThrow(() -> service.requireUnlocked(owner, grant.token()));
        var anotherSession = new UserPrincipal(owner.userId(), owner.phone(), "OWNER", UUID.randomUUID());
        assertThrows(WalletUnlockService.WalletLockedException.class, () -> service.requireUnlocked(anotherSession, grant.token()));
        var anotherOwner = new UserPrincipal(UUID.randomUUID(), owner.phone(), "OWNER", owner.sessionId());
        var lockedBalance = balances.readAccount(owner.userId());
        when(balances.readAccount(anotherOwner.userId())).thenReturn(lockedBalance);
        assertThrows(WalletUnlockService.WalletLockedException.class, () -> service.requireUnlocked(anotherOwner, grant.token()));
        when(clock.instant()).thenReturn(now.plusSeconds(300));
        assertThrows(WalletUnlockService.WalletLockedException.class, () -> service.requireUnlocked(owner, grant.token()));
    }

    @Test void missingGrantAndPinChangesLockWallet() {
        lockedAccount();
        assertThrows(WalletUnlockService.WalletLockedException.class, () -> service.requireUnlocked(owner, null));
        var grant = service.unlock(owner, "135790", "127.0.0.1");
        service.pinChanged(new PinChangedEvent(owner.userId()));
        assertThrows(WalletUnlockService.WalletLockedException.class, () -> service.requireUnlocked(owner, grant.token()));
    }

    @Test void enablingNeedsNoPinButDisablingAlwaysVerifiesFreshPin() {
        lockedAccount();
        var account = ServiceBalanceAccount.open(owner.userId());
        when(balances.accountFor(owner.userId())).thenReturn(account);
        var setting = service.setLock(owner, true, null, "127.0.0.1");
        assertTrue(setting.enabled());
        assertTrue(account.isWalletLockEnabled());
        verifyNoInteractions(auth);
        doThrow(new ValidationException("Incorrect wallet PIN")).when(auth).verifyOwnerWalletPin(owner.userId(), "999999", "127.0.0.1");
        assertThrows(ValidationException.class, () -> service.setLock(owner, false, "999999", "127.0.0.1"));
        assertTrue(account.isWalletLockEnabled());
        service.setLock(owner, false, "135790", "127.0.0.1");
        assertFalse(account.isWalletLockEnabled());
        verify(auth).verifyOwnerWalletPin(owner.userId(), "135790", "127.0.0.1");
    }

    @Test void disabledLockAllowsAccessWithoutGrant() {
        when(balances.readAccount(owner.userId())).thenReturn(ServiceBalanceAccount.open(owner.userId()));
        assertDoesNotThrow(() -> service.requireUnlocked(owner, null));
    }
}
