package com.khatiyan.b_config;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khatiyan.c_shared.exception.ErrorResponse;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Answers an authenticated-but-not-permitted request with <b>403</b>, in the
 * same {@link ErrorResponse} shape as every other error.
 *
 * <p>Paired with {@link TokenAuthenticationEntryPoint} so the two halves stay
 * apart: 401 means "we do not know who you are", 403 means "we do, and the
 * answer is still no". Before, both arrived as 403 and a client could not tell
 * an expired session from a permission it never had.
 */
@Component
public class ApiAccessDeniedHandler implements AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    public ApiAccessDeniedHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void handle(
        HttpServletRequest request,
        HttpServletResponse response,
        AccessDeniedException accessDeniedException
    ) throws IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");

        objectMapper.writeValue(
            response.getOutputStream(),
            ErrorResponse.of("ACCESS_DENIED", "You do not have access to this.")
        );
    }
}
