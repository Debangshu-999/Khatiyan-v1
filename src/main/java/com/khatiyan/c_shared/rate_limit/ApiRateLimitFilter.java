package com.khatiyan.c_shared.rate_limit;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khatiyan.c_shared.identity.UserPrincipal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

/**
 * Applies central API rate limits before requests reach controllers.
 */
@Slf4j
@Component
public class ApiRateLimitFilter extends OncePerRequestFilter {

    private final ApiRateLimitProperties properties;
    private final RateLimitService rateLimitService;
    private final ObjectMapper objectMapper;

    public ApiRateLimitFilter(
            ApiRateLimitProperties properties,
            RateLimitService rateLimitService,
            ObjectMapper objectMapper) {
        this.properties = properties;
        this.rateLimitService = rateLimitService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!properties.isEnabled()) {
            return true;
        }

        String path = request.getRequestURI();
        return "OPTIONS".equalsIgnoreCase(request.getMethod())
                || !path.startsWith("/api/")
                || path.equals("/api/v1/payments/webhooks/razorpay");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        try {
            applyDefaultIpLimit(request);
            applyRouteLimitIfMatched(request);
        } catch (RateLimitedException e) {
            writeRateLimitedResponse(response, e.retryAfterSeconds());
            return;
        } catch (RuntimeException e) {
            if (!properties.isFailOpen()) {
                throw e;
            }

            log.warn("Rate limiter unavailable; allowing request path={}", request.getRequestURI(), e);
        }

        filterChain.doFilter(request, response);
    }

    private void applyDefaultIpLimit(HttpServletRequest request) {
        ApiRateLimitProperties.Rule rule = properties.getDefaultRule();
        String key = "rl:default:ip:" + clientIp(request);
        consumeOrReject(key, rule.getAttempts(), rule.getDurationSeconds());
    }

    private void applyRouteLimitIfMatched(HttpServletRequest request) {
        Optional<ApiRateLimitProperties.RouteRule> maybeRule = findRouteRule(request);
        if (maybeRule.isEmpty()) {
            return;
        }

        ApiRateLimitProperties.RouteRule rule = maybeRule.get();
        String key = "rl:route:"
                + request.getMethod().toUpperCase()
                + ":"
                + rule.getPathPrefix()
                + ":"
                + routeIdentity(rule, request);

        consumeOrReject(key, rule.getAttempts(), rule.getDurationSeconds());
    }

    private Optional<ApiRateLimitProperties.RouteRule> findRouteRule(HttpServletRequest request) {
        String method = request.getMethod();
        String path = request.getRequestURI();

        return properties.getRoutes()
                .stream()
                .filter(rule -> rule.getMethod() == null || rule.getMethod().equalsIgnoreCase(method))
                .filter(rule -> rule.getPathPrefix() != null && path.startsWith(rule.getPathPrefix()))
                .findFirst();
    }

    private String routeIdentity(ApiRateLimitProperties.RouteRule rule, HttpServletRequest request) {
        if (rule.getIdentity() == RateLimitIdentity.IP) {
            return "ip:" + clientIp(request);
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof UserPrincipal principal) {
            return "user:" + principal.userId();
        }

        return "ip:" + clientIp(request);
    }

    private void consumeOrReject(String key, int attempts, int durationSeconds) {
        RateLimitResult result = rateLimitService.consume(key, attempts, durationSeconds);
        if (!result.allowed()) {
            throw new RateLimitedException(result.retryAfterSeconds());
        }
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }

        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }

        return request.getRemoteAddr();
    }

    private void writeRateLimitedResponse(HttpServletResponse response, long retryAfterSeconds) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", "RATE_LIMITED");
        body.put("message", "Too many requests. Try again later.");
        body.put("retryAfterSeconds", retryAfterSeconds);
        body.put("timestamp", Instant.now().toString());

        objectMapper.writeValue(response.getOutputStream(), body);
    }

    private static class RateLimitedException extends RuntimeException {
        private final long retryAfterSeconds;

        private RateLimitedException(long retryAfterSeconds) {
            this.retryAfterSeconds = retryAfterSeconds;
        }

        private long retryAfterSeconds() {
            return retryAfterSeconds;
        }
    }
}
