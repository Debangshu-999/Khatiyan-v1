package com.khatiyan.a_auth.service;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.khatiyan.a_auth.model.User;
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
    private final AuthService authService;
    private final UserSessionService userSessionService;

    public JwtAuthenticationFilter(
            JwtService jwtService,
            AuthService authService,
            UserSessionService userSessionService) {
        this.jwtService = jwtService;
        this.authService = authService;
        this.userSessionService = userSessionService;
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
            Optional<User> user = authService.findActiveUserById(token.userId());

            if (user.isEmpty()) {
                reject(request, TokenRejectionReason.USER_INACTIVE);
            } else if (userSessionService.isRevoked(token.sessionId())) {
                // Valkey, not a query — this runs on every authenticated request.
                reject(request, TokenRejectionReason.SESSION_REVOKED);
            } else if (token.credentialVersion() != user.get().getCredentialVersion()) {
                // The three cases used to be one silent fall-through: a filter
                // that never says which, and a caller left to guess from a bare
                // status why it was turned away.
                reject(request, TokenRejectionReason.CREDENTIALS_STALE);
            } else {
                authenticate(user.get(), token);
                userSessionService.touch(token.sessionId(), Instant.now());
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

    private void authenticate(User user, JwtService.ParsedToken token) {
        UserPrincipal principal = new UserPrincipal(
            user.getId(),
            user.getPhone(),
            user.getRole().name(),
            token.sessionId()
        );

        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
            principal,
            null,
            List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
