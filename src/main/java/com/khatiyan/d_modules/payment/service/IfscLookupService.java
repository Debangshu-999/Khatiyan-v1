package com.khatiyan.d_modules.payment.service;

import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.JsonNode;
import com.khatiyan.d_modules.payment.api.dto.IfscLookupResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Resolves an IFSC against Razorpay's public bank directory
 * ({@code https://ifsc.razorpay.com/{ifsc}} — no key, no auth).
 *
 * <p>A regex only proves an IFSC is well <em>formed</em>; this proves the branch
 * actually exists, which is what catches a mistyped code before money is routed
 * to nowhere. It also yields the bank and branch names shown on the payout card.
 *
 * <p>Failures degrade rather than block: only a definite 404 is treated as a bad
 * code. A timeout or outage returns {@code UNAVAILABLE} so a third-party being
 * down can never stop an owner from onboarding.
 */
@Slf4j
@Service
public class IfscLookupService {

    /**
     * Branch records are effectively static, so successful lookups are cached
     * for the process lifetime. Bounded because the key comes from user input.
     */
    private static final int MAX_CACHED_ENTRIES = 500;

    private final Map<String, IfscLookupResponse> cache = new ConcurrentHashMap<>();
    private final RestClient restClient;
    private final String baseUrl;
    private final boolean enabled;

    public IfscLookupService(
            RestClient.Builder restClientBuilder,
            @Value("${app.payment.ifsc.base-url:https://ifsc.razorpay.com}") String baseUrl,
            @Value("${app.payment.ifsc.enabled:true}") boolean enabled,
            @Value("${app.payment.ifsc.timeout-ms:3000}") int timeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(timeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(timeoutMs));

        this.restClient = restClientBuilder.requestFactory(requestFactory).build();
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.enabled = enabled;
    }

    public IfscLookupResponse lookup(String rawIfsc) {
        if (rawIfsc == null || rawIfsc.isBlank()) {
            return IfscLookupResponse.notFound(rawIfsc);
        }

        String ifsc = rawIfsc.trim().toUpperCase(Locale.ROOT);
        if (!enabled) {
            return IfscLookupResponse.unavailable(ifsc);
        }

        IfscLookupResponse cached = cache.get(ifsc);
        if (cached != null) {
            return cached;
        }

        try {
            JsonNode body = restClient.get()
                    .uri(baseUrl + "/" + ifsc)
                    .retrieve()
                    .body(JsonNode.class);
            if (body == null || body.isNull()) {
                return IfscLookupResponse.unavailable(ifsc);
            }

            IfscLookupResponse response = IfscLookupResponse.found(
                    ifsc,
                    text(body, "BANK"),
                    text(body, "BRANCH"),
                    text(body, "CITY"),
                    text(body, "STATE"));
            if (cache.size() < MAX_CACHED_ENTRIES) {
                cache.put(ifsc, response);
            }
            return response;
        } catch (HttpClientErrorException.NotFound exception) {
            // The directory answered clearly: no such branch.
            return IfscLookupResponse.notFound(ifsc);
        } catch (RuntimeException exception) {
            log.warn("IFSC lookup unavailable ifsc={}", ifsc, exception);
            return IfscLookupResponse.unavailable(ifsc);
        }
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : value;
    }
}
