package com.khatiyan.d_modules.intelligence;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Everything the intelligence module can be told, in one place.
 *
 * <p><b>Off by default, at every level.</b> {@link #enabled()} is the master
 * switch and each capability has its own. A feature nobody has turned on must
 * cost nothing and reach nothing — no provider call, no key read, no bean doing
 * work in the background — because this module is the only part of Khatiyan
 * that sends anything to a third party.
 *
 * <p><b>Model IDs are configuration, never code.</b> Changing which model
 * answers a request is a config change and a re-run of the golden set, not a
 * deployment of new logic.
 *
 * <p><b>Keys come from the environment.</b> They are read from {@code .env} in
 * development and from real environment variables in production, and they are
 * never written into this repository. {@code nextApiKey} is the rotation slot:
 * a second key is for replacing the first, never for doubling the quota. Groq's
 * free limits are per organisation, so pooling keys would buy nothing and an
 * account suspension would take the feature down.
 */
@ConfigurationProperties(prefix = "app.ai")
public record IntelligenceProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue SmartSearch smartSearch,
        @DefaultValue Providers providers) {

    public record SmartSearch(
            @DefaultValue("false") boolean enabled,
            @DefaultValue("300") int maxQueryChars,
            @DefaultValue("8s") Duration timeout,
            @DefaultValue("6") int userLimitPerMinute,
            @DefaultValue("40") int userLimitPerDay,
            /** How long the reading of a sentence is reused. */
            @DefaultValue("24h") Duration cacheTtl,
            /**
             * How long a repeated search returns the identical answer.
             *
             * <p>Short, because the answer includes listings and listings
             * change. Past it the reading is still reused, but the listings are
             * fetched and ranked again.
             */
            @DefaultValue("15m") Duration answerTtl,
            /**
             * Whether our own allowances are applied at all.
             *
             * <p>Off under the dev profile, by decision: testing the feature
             * spends searches far faster than any tenant would, and a limit
             * that refills one search every 36 minutes made the thing being
             * built nearly impossible to try. The provider's own limits still
             * apply either way — this only removes the ones we impose.
             */
            @DefaultValue("true") boolean enforceLimits) {
    }

    public record Providers(
            @DefaultValue Groq groq,
            @DefaultValue WorkersAi workersAi) {
    }

    public record Groq(
            @DefaultValue("https://api.groq.com/openai/v1") String baseUrl,
            @DefaultValue("") String apiKey,
            /** The rotation slot. Never used to widen a quota — see the class note. */
            @DefaultValue("") String nextApiKey,
            /**
             * Groq offers Zero Data Retention, but it is not on until somebody
             * turns it on for the account. Until this says otherwise, assume
             * prompts are retained for up to 30 days for abuse monitoring, and
             * send nothing that would matter if they were.
             */
            @DefaultValue("false") boolean zeroDataRetentionConfirmed,
            /**
             * How hard gpt-oss thinks before answering: low, medium or high.
             *
             * <p>Its hidden reasoning is billed against the same per-minute
             * token limit as the prompt and the answer, and at the default it
             * was the largest part of a search's cost. Configurable rather than
             * fixed so the effect on quality can be measured, not assumed.
             */
            @DefaultValue("low") String reasoningEffort,
            @DefaultValue Models models,
            @DefaultValue Budget budget) {
    }

    public record WorkersAi(
            @DefaultValue("") String baseUrl,
            @DefaultValue("") String apiKey,
            @DefaultValue("") String nextApiKey,
            @DefaultValue Models models,
            @DefaultValue("9000") int neuronsPerDay) {
    }

    public record Models(
            @DefaultValue("") String structuredFast,
            @DefaultValue("") String structuredStrong) {
    }

    /**
     * Ninety per cent of the published free-tier ceilings, so the app throttles
     * itself before the provider does. A self-imposed refusal is a message we
     * control. A 429 is not.
     */
    public record Budget(
            @DefaultValue("27") int requestsPerMinute,
            @DefaultValue("900") int requestsPerDay,
            @DefaultValue("7200") int tokensPerMinute,
            @DefaultValue("180000") int tokensPerDay) {
    }

    /** Whether a capability may actually run: the master switch AND its own. */
    public boolean smartSearchLive() {
        return enabled && smartSearch.enabled();
    }
}
