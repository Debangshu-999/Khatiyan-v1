package com.khatiyan.d_modules.servicebalance.service;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.event.PinChangedEvent;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.identity.UserPrincipal;

@Service
public class WalletUnlockService {
    private record Grant(UUID owner, UUID session, Instant expiresAt) {}
    public record UnlockResponse(String token, Instant expiresAt) {}
    private final Map<String, Grant> grants = new ConcurrentHashMap<>();
    private final AuthModule auth;
    private final ServiceBalanceService balances;
    private final Clock clock;

    @Autowired
    public WalletUnlockService(AuthModule auth, ServiceBalanceService balances) { this(auth, balances, Clock.systemUTC()); }
    WalletUnlockService(AuthModule auth, ServiceBalanceService balances, Clock clock) { this.auth = auth; this.balances = balances; this.clock = clock; }

    public UnlockResponse unlock(UserPrincipal user, String pin, String ip) {
        if (!"OWNER".equals(user.role()) || user.sessionId() == null) throw new ForbiddenException("Owner session required");
        auth.verifyOwnerWalletPin(user.userId(), pin, ip);
        return grant(user);
    }

    private UnlockResponse grant(UserPrincipal user) {
        Instant now = clock.instant();
        grants.entrySet().removeIf(entry -> !entry.getValue().expiresAt().isAfter(now));
        String token = UUID.randomUUID().toString();
        Instant expiresAt = now.plusSeconds(300);
        grants.put(token, new Grant(user.userId(), user.sessionId(), expiresAt));
        return new UnlockResponse(token, expiresAt);
    }

    public void requireUnlocked(UserPrincipal user, String token) {
        if (!"OWNER".equals(user.role())) throw new ForbiddenException("Owner account required");
        if (!balances.readAccount(user.userId()).isWalletLockEnabled()) return;
        Grant grant = token == null ? null : grants.get(token);
        if (grant == null || !"OWNER".equals(user.role()) || !grant.owner().equals(user.userId()) || !grant.session().equals(user.sessionId()) || !grant.expiresAt().isAfter(clock.instant())) {
            throw new WalletLockedException();
        }
    }

    public record LockSettingResponse(boolean enabled, String token, Instant expiresAt) {}
    public LockSettingResponse setLock(UserPrincipal user, boolean enabled, String pin, String ip) {
        if (!"OWNER".equals(user.role()) || user.sessionId() == null) throw new ForbiddenException("Owner session required");
        if (!enabled) auth.verifyOwnerWalletPin(user.userId(), pin, ip);
        var account = balances.accountFor(user.userId());
        account.setWalletLockEnabled(enabled);
        balances.saveAccount(account);
        grants.entrySet().removeIf(entry -> entry.getValue().owner().equals(user.userId()));
        // Enabling is free of PIN entry; the current visit gets its short grace period.
        UnlockResponse access = enabled ? grant(user) : null;
        return new LockSettingResponse(enabled, access == null ? null : access.token(), access == null ? null : access.expiresAt());
    }

    @EventListener
    public void pinChanged(PinChangedEvent event) {
        grants.entrySet().removeIf(entry -> entry.getValue().owner().equals(event.userId()));
    }

    public static class WalletLockedException extends ForbiddenException {
        public WalletLockedException() { super("Enter your account PIN to unlock the wallet"); }
        @Override public String getCode() { return "WALLET_LOCKED"; }
    }
}
