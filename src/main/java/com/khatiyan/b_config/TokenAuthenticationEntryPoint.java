package com.khatiyan.b_config;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khatiyan.a_auth.service.TokenRejectionReason;
import com.khatiyan.c_shared.exception.ErrorResponse;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Answers an unauthenticated request to a protected route with <b>401</b>.
 *
 * <p>Without this Spring falls back to its default entry point, which for an API
 * with no {@code httpBasic} or {@code formLogin} answers <b>403</b>. That single
 * wrong digit was the whole session-expiry bug: the client keys "you have been
 * signed out" off a 401, so an expired token produced a screen of dead requests
 * and no explanation, and the only way out was a refresh that happened to bounce
 * someone to sign-in.
 *
 * <p>403 still means what it should — signed in, not allowed — and is handled by
 * the access-denied handler instead. The two were conflated because nothing had
 * ever separated them.
 */
@Component
public class TokenAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper;

    public TokenAuthenticationEntryPoint(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void commence(
        HttpServletRequest request,
        HttpServletResponse response,
        AuthenticationException authException
    ) throws IOException {
        // Set by JwtAuthenticationFilter when a token WAS presented and refused.
        // Absent means no token was sent at all, which is not an expiry — a
        // client that never signed in must not be told its session ended.
        Object recorded = request.getAttribute(TokenRejectionReason.ATTRIBUTE);
        TokenRejectionReason reason = recorded instanceof TokenRejectionReason value ? value : null;

        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");

        ErrorResponse body = reason == null
            ? ErrorResponse.of("UNAUTHENTICATED", "Sign in to continue.")
            : ErrorResponse.of(reason.name(), reason.message());

        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
