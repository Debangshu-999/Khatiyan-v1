package com.khatiyan.d_modules.intelligence.discovery;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.intelligence.IntelligenceProperties;
import com.khatiyan.d_modules.intelligence.audit.AiCapability;
import com.khatiyan.d_modules.intelligence.audit.AiInvocation;
import com.khatiyan.d_modules.intelligence.audit.AiInvocationAuditService;
import com.khatiyan.d_modules.intelligence.audit.AiOutcome;
import com.khatiyan.d_modules.intelligence.audit.AiProvider;
import com.khatiyan.d_modules.intelligence.provider.AiQuotaService;
import com.khatiyan.d_modules.intelligence.discovery.SmartSearchRanker.Scored;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes the one line under each card that says why it is in the list.
 *
 * <p><b>It is handed facts and nothing else.</b> No listing, no address, no
 * price, no description — only the phrases the ranker already computed for that
 * property: what matched, what missed, how far the nearest landmark is. So
 * there is nothing here for a model to invent a claim from. A line that says
 * "446 m from Karunamoyee" is repeating arithmetic somebody else did, in
 * better English.
 *
 * <p><b>It must not flatter a weak match.</b> A listing in the related bucket
 * is there because it misses something, and its line has to say so. Results
 * that all sound chosen are worse than no reasons at all — the reader loses the
 * only signal that separates an answer from a suggestion.
 *
 * <p>One call writes every line. A call per card would multiply a metered
 * budget by the length of the page, and the lines are better for being written
 * together: the model can see that one listing is the closest of the set.
 *
 * <p>Failure is not fatal. A search with no reason lines is the search we had
 * before this existed, so a provider error logs and returns nothing rather than
 * costing somebody their results.
 */
@Service
@ConditionalOnProperty(prefix = "app.ai", name = "enabled", havingValue = "true")
public class SmartSearchReasonWriter {

    private static final Logger log = LoggerFactory.getLogger(SmartSearchReasonWriter.class);

    /**
     * How many cards get a written line.
     *
     * <p>The page somebody actually reads. Paying a model to justify the
     * fortieth result of a scroll nobody makes is spending a daily allowance
     * on nothing.
     */
    private static final int MAX_REASONS = 10;

    /**
     * Fifty words is the ceiling, twenty-five the aim.
     *
     * <p>A caption, but not a clipped one: asked for twelve words a model
     * starts dropping the articles and the result reads like a telegram. The
     * character cap is the same limit expressed in the only unit the layout
     * cares about.
     */
    private static final int MAX_REASON_WORDS = 50;

    private static final int MAX_REASON_CHARS = 300;

    private static final String SYSTEM_PROMPT = """
            You write one short line for each property, explaining why it is in a
            search result. You are given only the facts, already computed.

            Write a proper sentence somebody would read out loud. Not a list of
            fragments: "PG, 126 m" is useless, "This PG is 126 m from Behala Bazar
            metro station and sits inside your budget" is what to write.

            Rules:
            - Use only the matched and missed facts given for that property. Never add a
              fact, a price, a name or a claim that is not in them.
            - The question is given for tone only. Never repeat a requirement from it as
              though the property met it: if being near a metro is not in this
              property's facts, the line must not mention a metro at all.
            - When a fact carries a distance and a place name, use both. "446 m from
              Karunamoyee" is useful. "Close to the metro station" is not, and saying
              it without the figure is the one thing you must never do.
            - One or two complete sentences, about 25 words, never more than 50. Short
              and useful, not clipped: full sentences with verbs, no comma-separated
              fragments and no bare labels.
            - Always name the landmark when the facts give you one. "630 m from Nalban
              Metro Station" — the name is the most useful thing on the line.
            - Plain English. No marketing words.
            - Never use a semicolon.
            - When a property missed something, the line must say what it missed. Do not
              make a partial match sound like a good one.
            - Lead with the fact that best answers what the person asked for.
            - Do not start every line the same way, and do not repeat the property name.
            - Return one entry per property id given, and no others.
            """;

    private static final BeanOutputConverter<ReasonList> CONVERTER =
            new BeanOutputConverter<>(ReasonList.class, JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                    .build());

    /** The model's answer: a line per property. */
    public record ReasonList(List<Reason> reasons) {
    }

    public record Reason(String propertyId, String line) {
    }

    private final OpenAiChatModel chatModel;
    private final IntelligenceProperties properties;
    private final AiInvocationAuditService auditService;
    private final AiQuotaService quotaService;

    public SmartSearchReasonWriter(
            @Qualifier("groqFastChatModel") OpenAiChatModel chatModel,
            IntelligenceProperties properties,
            AiInvocationAuditService auditService,
            AiQuotaService quotaService) {
        this.chatModel = chatModel;
        this.properties = properties;
        this.auditService = auditService;
        this.quotaService = quotaService;
    }

    /**
     * A line per listing, keyed by property id. Missing keys simply have no
     * line, and the card renders without one.
     */
    public Map<UUID, String> write(String query, List<Scored> listings, UUID actorUserId) {
        List<Scored> subject = listings.size() > MAX_REASONS ? listings.subList(0, MAX_REASONS) : listings;
        if (subject.isEmpty()) {
            return Map.of();
        }

        long startedAt = System.currentTimeMillis();
        String model = properties.providers().groq().models().structuredFast();
        try {
            // The shared free-tier ceiling, not the person's own allowance:
            // they asked for one search, and this is the second call we chose
            // to make on their behalf. When the ceiling says no, the results
            // are already correct and simply arrive without their lines.
            quotaService.claimProviderBudget();
            ReasonList answer = ChatClient.create(chatModel)
                    .prompt()
                    .system(SYSTEM_PROMPT)
                    .user(facts(query, subject))
                    .call()
                    .entity(CONVERTER);

            auditService.record(AiInvocation.answered(
                            AiCapability.SMART_SEARCH, AiProvider.GROQ, model, actorUserId,
                            null, null, elapsed(startedAt))
                    .withVersions(SmartSearchService.INTENT_VERSION, SmartSearchService.INTENT_VERSION, null));

            return collect(answer, subject);
        } catch (RuntimeException exception) {
            // The results are already correct and already explained by their
            // matched-and-missed chips. This was the prose on top.
            log.warn("Smart search reason lines skipped", exception);
            auditService.record(AiInvocation.failed(
                            AiCapability.SMART_SEARCH, AiProvider.GROQ, model, actorUserId,
                            AiOutcome.PROVIDER_ERROR, "reason-write-failed",
                            elapsed(startedAt))
                    .withVersions(SmartSearchService.INTENT_VERSION, SmartSearchService.INTENT_VERSION, null));
            return Map.of();
        }
    }

    /**
     * The whole of what the model gets to see.
     *
     * <p>Worth reading as a security boundary, not just a format: ids, matched
     * phrases, missed phrases. A model cannot leak what it was never given.
     */
    private String facts(String query, List<Scored> listings) {
        StringBuilder text = new StringBuilder("The person asked: ").append(query).append("\n\n");
        for (Scored listing : listings) {
            text.append("id: ").append(listing.property().propertyId()).append('\n');
            text.append("  matched: ")
                    .append(listing.matchedTags().isEmpty() ? "nothing specific" : String.join(", ", listing.matchedTags()))
                    .append('\n');
            text.append("  missed: ")
                    .append(listing.missedTags().isEmpty() ? "nothing" : String.join(", ", listing.missedTags()))
                    .append('\n');
        }
        return text.toString();
    }

    private Map<UUID, String> collect(ReasonList answer, List<Scored> subject) {
        if (answer == null || answer.reasons() == null) {
            return Map.of();
        }
        Map<UUID, String> wanted = new HashMap<>();
        subject.forEach(listing -> wanted.put(listing.property().propertyId(), null));

        Map<UUID, String> lines = new HashMap<>();
        for (Reason reason : answer.reasons()) {
            if (reason == null || reason.propertyId() == null || reason.line() == null) {
                continue;
            }
            UUID id = parse(reason.propertyId());
            // An id we did not ask about is discarded rather than shown. A
            // model that invents a row must not put words under a card.
            if (id == null || !wanted.containsKey(id)) {
                continue;
            }
            String line = reason.line().strip().replace(";", ",");
            if (line.isEmpty()) {
                continue;
            }
            lines.put(id, trim(line));
        }
        return Map.copyOf(lines);
    }

    /**
     * Cuts an over-long line at a word, not mid-word.
     *
     * <p>Both limits are enforced here rather than trusted to the prompt. A
     * model told to stay under fifty words mostly does, and the card has to
     * survive the times it does not.
     */
    private static String trim(String line) {
        String[] words = line.split("\\s+");
        String capped = words.length <= MAX_REASON_WORDS
                ? line
                : String.join(" ", java.util.Arrays.copyOfRange(words, 0, MAX_REASON_WORDS));
        if (capped.length() <= MAX_REASON_CHARS) {
            return capped;
        }
        int cut = capped.lastIndexOf(' ', MAX_REASON_CHARS);
        return capped.substring(0, cut < 40 ? MAX_REASON_CHARS : cut).strip();
    }

    private static int elapsed(long startedAt) {
        return (int) Math.min(Integer.MAX_VALUE, System.currentTimeMillis() - startedAt);
    }

    private static UUID parse(String value) {
        try {
            return UUID.fromString(value.strip().toLowerCase(Locale.ROOT));
        } catch (IllegalArgumentException invalid) {
            return null;
        }
    }
}
