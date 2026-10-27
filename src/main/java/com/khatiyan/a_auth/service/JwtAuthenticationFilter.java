package com.khatiyan.a_auth.service;

import java.io.IOException;
import java.time.Instant;
import java.util.List;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.khatiyan.a_auth.model.AuthUser;
import com.khatiyan.c_shared.identity.UserPrincipal;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Authenticates requests carrying a Bearer JWT.
 *
 * <p>The filter validates the token, reloads the active user, checks credential
 * version, and places {@code UserPrincipal} into Spring Security's context for
 * controllers and services to read later.
 *
 * <p>A refused token does NOT end the request here. The filter records WHY it
 * refused on the request and carries on unauthenticated; whether that becomes a
 * 401 is decided downstream by
 * {@link com.khatiyan.b_config.TokenAuthenticationEntryPoint}. That split
 * matters: {@code /api/v1/auth/**} is {@code permitAll}, and someone signing in
 * again after an expiry still has the dead token in memory — answering 401 from
 * here would refuse the very login call meant to recover from it.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    /**
     * The user and the session, from Valkey or (while it is down) memory, read
     * from the database once per record (2026-10-18). Before this, every
     * signed-in request read both rows and also asked Valkey about revocation.
     */
    private final AuthStateCache authStateCache;

    public JwtAuthenticationFilter(JwtService jwtService, AuthStateCache authStateCache) {
        this.jwtService = jwtService;
        this.authStateCache = authStateCache;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            JwtService.ParsedToken token = jwtService.parse(authHeader.substring(7));
            AuthStateCache.Snapshot state = authStateCache.lookup(token.userId(), token.sessionId());

            if (state.user().isEmpty()) {
                reject(request, TokenRejectionReason.USER_INACTIVE);
            } else if (state.session().revoked()) {
                reject(request, TokenRejectionReason.SESSION_REVOKED);
            } else if (token.credentialVersion() != state.user().get().credentialVersion()) {
                // The three cases used to be one silent fall-through: a filter
                // that never says which, and a caller left to guess from a bare
                // status why it was turned away.
                reject(request, TokenRejectionReason.CREDENTIALS_STALE);
            } else {
                authenticate(state.user().get(), token);
                authStateCache.seen(token.sessionId(), Instant.now(), state.session().expiresAt());
            }
        } catch (JwtException | IllegalArgumentException invalid) {
            reject(request, TokenRejectionReason.TOKEN_INVALID);
        }

        filterChain.doFilter(request, response);
    }

    private void reject(HttpServletRequest request, TokenRejectionReason reason) {
        SecurityContextHolder.clearContext();
        request.setAttribute(TokenRejectionReason.ATTRIBUTE, reason);
    }

    private void authenticate(AuthUser user, JwtService.ParsedToken token) {
        UserPrincipal principal = new UserPrincipal(
            user.id(),
            user.phone(),
            user.role().name(),
            token.sessionId()
        );

        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
            principal,
            null,
            List.of(new SimpleGrantedAuthority("ROLE_" + user.role().name()))
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
