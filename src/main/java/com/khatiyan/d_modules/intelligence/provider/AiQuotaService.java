package com.khatiyan.d_modules.intelligence.provider;

import java.util.UUID;

import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.rate_limit.RateLimitService;
import com.khatiyan.d_modules.intelligence.IntelligenceProperties;

/**
 * Two ceilings, for two different failures.
 *
 * <p><b>Per person</b>, so one user cannot spend the day's allowance for
 * everyone. Six a minute and forty a day is generous for someone searching and
 * absurd for a script.
 *
 * <p><b>Per organisation</b>, because Groq's free limits are counted across the
 * whole account, not per key — which is also why a second key is a rotation
 * slot and never a way to buy more quota. The app throttles itself at ninety
 * per cent of the published ceiling so that the refusal a person sees is one we
 * wrote, in our own words, rather than a 429 surfacing as a broken screen.
 *
 * <p>Enforced through the shared {@link RateLimitService}, which is Valkey
 * backed, so the counts hold across restarts and across instances. A local
 * counter would reset every deploy and let a whole day's budget go twice.
 */
@Service
public class AiQuotaService {

    private static final String USER_MINUTE = "ai:user:%s:min";
    private static final String USER_DAY = "ai:user:%s:day";
    private static final String ORG_MINUTE = "ai:org:min";
    private static final String ORG_DAY = "ai:org:day";

    private static final int ONE_MINUTE = 60;
    private static final int ONE_DAY = 24 * 60 * 60;

    private final RateLimitService rateLimitService;
    private final IntelligenceProperties properties;

    public AiQuotaService(RateLimitService rateLimitService, IntelligenceProperties properties) {
        this.rateLimitService = rateLimitService;
        this.properties = properties;
    }

    /**
     * Claims one smart-search call, or refuses it.
     *
     * <p>The person's own limits are checked first. When somebody is searching
     * too fast, telling them so is more use than telling them the service is
     * busy — and it avoids spending the shared allowance to find that out.
     *
     * @throws ValidationException with a message meant for a person to read
     */
    public void claimSmartSearch(UUID userId) {
        IntelligenceProperties.SmartSearch search = properties.smartSearch();

        rateLimitService.consumeOrThrow(
                USER_MINUTE.formatted(userId), search.userLimitPerMinute(), ONE_MINUTE,
                "That is a lot of searches at once. Give it a moment and try again.");

        rateLimitService.consumeOrThrow(
                USER_DAY.formatted(userId), search.userLimitPerDay(), ONE_DAY,
                "You have used today's smart searches. Ordinary search still works, and this resets tomorrow.");

        claimProviderBudget();
    }

    /**
     * Claims one call against the shared provider budget.
     *
     * <p>Separate from the per-user check so a scheduled job — an insight
     * refresh with no person behind it — can take from the same allowance
     * without inventing a user to charge it to.
     */
    public void claimProviderBudget() {
        IntelligenceProperties.Budget budget = properties.providers().groq().budget();

        rateLimitService.consumeOrThrow(
                ORG_MINUTE, budget.requestsPerMinute(), ONE_MINUTE,
                "Search is busy right now. Try again in a minute, or use the ordinary filters.");

        rateLimitService.consumeOrThrow(
                ORG_DAY, budget.requestsPerDay(), ONE_DAY,
                "Smart search has reached today's limit. Ordinary search is unaffected.");
    }
}
