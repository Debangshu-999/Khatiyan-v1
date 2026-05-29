package com.khatiyan.a_auth.service;

import java.io.IOException;
import java.util.List;

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
 * <p>The filter validates the token, reloads the active user, checks
 * credential version, and places {@code UserPrincipal} into Spring
 * Security's context for controllers and services to read later.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final AuthService authService;

    public JwtAuthenticationFilter(JwtService jwtService, AuthService authService) {
        this.jwtService = jwtService;
        this.authService = authService;
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

            authService.findActiveUserById(token.userId())
                .filter(user -> token.credentialVersion() == user.getCredentialVersion())
                .ifPresent(user -> authenticate(user, token));
        } catch (JwtException | IllegalArgumentException ignored) {
            SecurityContextHolder.clearContext();
        }

        filterChain.doFilter(request, response);
    }

    private void authenticate(User user, JwtService.ParsedToken token) {
        UserPrincipal principal = new UserPrincipal(
            user.getId(),
            user.getPhone(),
            user.getRole().name()
        );

        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
            principal,
            null,
            List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
