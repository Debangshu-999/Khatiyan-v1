package com.khatiyan.d_modules.intelligence.discovery;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.intelligence.IntelligenceProperties;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchRequest;
import com.khatiyan.d_modules.intelligence.api.dto.SmartSearchResponse;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Remembers searches so a repeat is not a new one.
 *
 * <p><b>What counts as the same search.</b> Case, spacing and punctuation are
 * ignored: "PG near metro, Kolkata!" and "pg  near metro kolkata" are one
 * search. Somebody tapping Search again, or fixing a stray comma, has not asked
 * a new question and must not spend a new one from their allowance — nor a
 * fresh few thousand provider tokens, which is what was actually running out.
 *
 * <p><b>Two layers, because the two halves age differently.</b>
 *
 * <ul>
 *   <li>The READING of a sentence is kept for a day ({@code cache-ttl}). What a
 *       sentence asks for does not change, so a repeat reuses it and never calls
 *       the model to interpret it again. Only the raw draft is kept: the airlock,
 *       the location and the ranking all run again on top of it, so a stale
 *       reading can never smuggle in a filter the current rules would refuse.
 *   <li>The whole ANSWER — listings and reason lines — is kept for a short
 *       window ({@code answer-ttl}, fifteen minutes). A repeat inside it returns
 *       exactly what was shown, with no model call at all. After it, the reading
 *       is reused but the listings are fetched and ranked again, because
 *       listings change and a day-old answer could show a room that has gone.
 * </ul>
 *
 * <p>Every key carries the intent version, the model and the reasoning effort.
 * Any of the three changing can change what a sentence means, and an answer
 * produced under older rules must never be replayed under newer ones.
 *
 * <p>Failures are swallowed. This is an optimisation: a cache that is down
 * means searches cost what they cost without it, never that searching breaks.
 */
@Component
public class SmartSearchCache {

    private static final Logger log = LoggerFactory.getLogger(SmartSearchCache.class);

    private static final String INTENT_KEY = "khatiyan:ai:intent:";
    private static final String ANSWER_KEY = "khatiyan:ai:answer:";

    private static final JsonMapper JSON = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    private final StringRedisTemplate valkey;
    private final IntelligenceProperties properties;

    public SmartSearchCache(StringRedisTemplate valkey, IntelligenceProperties properties) {
        this.valkey = valkey;
        this.properties = properties;
    }

    /**
     * The sentence reduced to what it asks.
     *
     * <p>Lower case, every run of punctuation and whitespace collapsed to a
     * single space. Letters and digits from any script survive, so a Bengali or
     * Hindi place name is not flattened into nothing — and so do combining
     * marks: the vowel signs and viramas of Bengali and Devanagari are marks,
     * not letters, and dropping them broke "সল্টলেক" into fragments.
     */
    static String sameSearch(String query) {
        if (query == null) {
            return "";
        }
        return query.toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{M}\\p{N}]+", " ")
                .trim();
    }

    // ------------------------------------------------------------ the reading

    Optional<DiscoveryIntentDraft> draft(String query) {
        return read(INTENT_KEY + identity(query), DiscoveryIntentDraft.class);
    }

    void putDraft(String query, DiscoveryIntentDraft draft) {
        write(INTENT_KEY + identity(query), draft, properties.smartSearch().cacheTtl());
    }

    // ------------------------------------------------------------- the answer

    Optional<SmartSearchResponse> answer(InterpretSearchRequest request) {
        return read(ANSWER_KEY + answerIdentity(request), SmartSearchResponse.class);
    }

    void putAnswer(InterpretSearchRequest request, SmartSearchResponse answer) {
        write(ANSWER_KEY + answerIdentity(request), answer, properties.smartSearch().answerTtl());
    }

    /**
     * The answer also depends on where the device is, but only coarsely.
     *
     * <p>"Near me" is measured from the device, so two people asking it a city
     * apart must not share an answer. Rounded to two decimals — about a
     * kilometre — so the same person asking twice from the same room still
     * gets their repeat, even though GPS never reports exactly the same point.
     */
    private String answerIdentity(InterpretSearchRequest request) {
        String where = request.hasDevice()
                ? String.format(Locale.ROOT, "%.2f,%.2f", request.device().latitude(), request.device().longitude())
                : "nowhere";
        return identity(request.query()) + ":" + where;
    }

    private String identity(String query) {
        IntelligenceProperties.Groq groq = properties.providers().groq();
        return SmartSearchService.INTENT_VERSION
                + ":" + groq.models().structuredFast()
                + ":" + groq.reasoningEffort()
                + ":" + sha256(sameSearch(query));
    }

    // --------------------------------------------------------------- plumbing

    private <T> Optional<T> read(String key, Class<T> type) {
        try {
            String json = valkey.opsForValue().get(key);
            return json == null ? Optional.empty() : Optional.ofNullable(JSON.readValue(json, type));
        } catch (RuntimeException exception) {
            log.warn("Smart search cache read skipped key={}", key, exception);
            return Optional.empty();
        }
    }

    /**
     * Each entry lives its TTL from its own write, plus up to a tenth more.
     *
     * <p>Per-key expiry already spreads most entries out, since searches are
     * written whenever people run them. The jitter is for the bursts: a spike of
     * searches in one minute, or many people tapping the same suggested
     * sentence, would otherwise all expire in the same minute a day later and
     * send their repeats to the model together.
     */
    private void write(String key, Object value, Duration ttl) {
        long spreadMillis = Math.max(1, ttl.toMillis() / 10);
        Duration jittered = ttl.plusMillis(ThreadLocalRandom.current().nextLong(spreadMillis));
        try {
            valkey.opsForValue().set(key, JSON.writeValueAsString(value), jittered);
        } catch (RuntimeException exception) {
            log.warn("Smart search cache write skipped key={}", key, exception);
        }
    }

    private static String sha256(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is required by every JVM", impossible);
        }
    }
}
