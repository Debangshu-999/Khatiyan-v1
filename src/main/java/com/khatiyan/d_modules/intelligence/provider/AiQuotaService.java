package com.khatiyan.d_modules.intelligence.provider;

import java.util.UUID;

import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.TooManyRequestsException;
import com.khatiyan.c_shared.rate_limit.RateLimitResult;
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

    /**
     * What somebody reads when any smart-search allowance says no.
     *
     * <p>One message for every limit — per minute, per day, the shared
     * provider budget, and the provider itself refusing. The reader cannot act
     * differently on any of those distinctions, and each one used to have its
     * own wording while the app showed none of them: it caught the refusal and
     * printed "AI could not read that search", which blamed the sentence for a
     * limit.
     *
     * <p>No promise of a time. The allowances refill continuously — one search
     * returns roughly every 36 minutes — so "tomorrow" was never true.
     */
    public static final String OUT_OF_SEARCHES =
            "You have run out of smart searches. Please try again after some time. "
                    + "You can switch to manual search in the meanwhile.";

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
     * @throws TooManyRequestsException carrying {@link #OUT_OF_SEARCHES}, as a 429
     */
    public void claimSmartSearch(UUID userId) {
        IntelligenceProperties.SmartSearch search = properties.smartSearch();
        if (!search.enforceLimits()) {
            return;
        }

        claim(USER_MINUTE.formatted(userId), search.userLimitPerMinute(), ONE_MINUTE);
        claim(USER_DAY.formatted(userId), search.userLimitPerDay(), ONE_DAY);
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
        if (!properties.smartSearch().enforceLimits()) {
            return;
        }
        IntelligenceProperties.Budget budget = properties.providers().groq().budget();

        claim(ORG_MINUTE, budget.requestsPerMinute(), ONE_MINUTE);
        claim(ORG_DAY, budget.requestsPerDay(), ONE_DAY);
    }

    /**
     * Takes one from a bucket, or refuses with a 429.
     *
     * <p>A 429 rather than the validation error these used to throw, so a
     * client can tell a limit from a bad request — the app showed "could not
     * read that search" for both, because a 400 is what a bad sentence looks
     * like too.
     *
     * <p>Every bucket here STARTS FULL and refills continuously: a person
     * begins with the whole daily allowance and gets one search back every
     * 36 minutes after spending it, never more than the capacity.
     */
    private void claim(String key, int capacity, int windowSeconds) {
        RateLimitResult result = rateLimitService.consume(key, capacity, windowSeconds);
        if (!result.allowed()) {
            throw new TooManyRequestsException(OUT_OF_SEARCHES, result.retryAfterSeconds());
        }
    }
}
