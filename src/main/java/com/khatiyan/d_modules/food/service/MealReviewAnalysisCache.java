package com.khatiyan.d_modules.food.service;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.valkey.FallbackCache;

/**
 * Holds an owner's AI analysis for the rest of its week, then lets it expire
 * (user, 2026-11-01).
 *
 * <p>The table stays the record of whether this week's turn is used, so a cache that
 * is down or cleared costs a read and never a second AI call. The caller still checks
 * the date on what comes back: a clock and a TTL can disagree by a little.
 */
@Component
public class MealReviewAnalysisCache {

    private static final Logger log = LoggerFactory.getLogger(MealReviewAnalysisCache.class);
    private static final String KEY = "khatiyan:food:meal-review-analysis:";

    private final FallbackCache cache;

    public MealReviewAnalysisCache(FallbackCache cache) {
        this.cache = cache;
    }

    Optional<String> get(UUID propertyId) {
        try {
            return Optional.ofNullable(cache.get(KEY + propertyId));
        } catch (RuntimeException exception) {
            log.warn("Meal review analysis cache read skipped propertyId={}", propertyId, exception);
            return Optional.empty();
        }
    }

    void put(UUID propertyId, String json, Duration ttl) {
        if (ttl.isNegative() || ttl.isZero()) {
            return;
        }
        try {
            cache.set(KEY + propertyId, json, ttl);
        } catch (RuntimeException exception) {
            log.warn("Meal review analysis cache write skipped propertyId={}", propertyId, exception);
        }
    }
}
