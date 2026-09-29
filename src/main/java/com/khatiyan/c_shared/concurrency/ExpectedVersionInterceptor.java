package com.khatiyan.c_shared.concurrency;

import org.springframework.http.HttpHeaders;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.exception.VersionRequiredException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Reads {@code If-Match} once per request into {@link ExpectedVersionHolder},
 * and refuses a {@link RequiresVersion} endpoint that arrives without one
 * (2026-09-29).
 *
 * <p>Everything that can refuse runs before the holder is set. A refusal from
 * {@code preHandle} skips this interceptor's {@code afterCompletion}, and a
 * value left on a pooled thread would reach the next request.
 */
public class ExpectedVersionInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        ExpectedVersion expected = parse(request.getHeader(HttpHeaders.IF_MATCH));
        if (!expected.isPresent()
                && handler instanceof HandlerMethod method
                && method.hasMethodAnnotation(RequiresVersion.class)) {
            throw new VersionRequiredException();
        }
        ExpectedVersionHolder.set(expected);
        return true;
    }

    @Override
    public void afterCompletion(
            HttpServletRequest request, HttpServletResponse response, Object handler, Exception exception) {
        ExpectedVersionHolder.clear();
    }

    /** A bare number, a quoted one, or a weak tag ({@code W/"5"}). */
    static ExpectedVersion parse(String header) {
        if (header == null || header.isBlank()) {
            return ExpectedVersion.none();
        }
        String value = header.trim();
        if (value.startsWith("W/")) {
            value = value.substring(2).trim();
        }
        value = value.replace("\"", "").trim();
        try {
            return ExpectedVersion.of(Long.parseLong(value));
        } catch (NumberFormatException exception) {
            throw new ValidationException("If-Match must be a record version.");
        }
    }
}
