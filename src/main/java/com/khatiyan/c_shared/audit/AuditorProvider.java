package com.khatiyan.c_shared.audit;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.AuditorAware;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import com.khatiyan.c_shared.identity.UserPrincipal;

/**
 * Resolves the currently authenticated user for JPA auditing.
 *
 * <p>Returns {Optional.empty()} for system-initiated operations
 * (cron jobs, webhook handlers, unauthenticated endpoints), in which
 * case audit-by columns will be left NULL.
 */
public class AuditorProvider implements AuditorAware<UUID> {

    @Override
    @SuppressWarnings("null")
    public @NonNull Optional<UUID> getCurrentAuditor() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return Optional.empty();
        }
        Object principal = auth.getPrincipal();
        if (principal instanceof UserPrincipal user) {
            return Optional.of(user.userId());
        }
        return Optional.empty();
    }
}

