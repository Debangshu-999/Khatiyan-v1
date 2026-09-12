package com.khatiyan.d_modules.intelligence.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.util.StringUtils;

import com.khatiyan.d_modules.intelligence.IntelligenceProperties;
import com.khatiyan.support.IntegrationTest;

/**
 * The Milestone 1 provider spike: does this actually work, and what does it cost?
 *
 * <p>This makes a REAL call to Groq. It is skipped unless a key is configured,
 * so a normal build and CI never touch the network — but when it runs it
 * answers questions the specification could only guess at
 * ({@code docs/Spring AI/ai-intelligence-platform-spec.md}, Milestone 1):
 *
 * <ol>
 * <li>Does Groq accept the JSON schema Spring AI generates from one of our
 *     records, and does structured output actually come back conforming?</li>
 * <li>What does a smart-search-shaped call really cost in tokens? §8.5's
 *     budgets are estimates until measured.</li>
 * <li>Does usage metadata reach application code at all — without it there is
 *     nothing to meter a budget against.</li>
 * </ol>
 *
 * <p><b>Tagged out of the normal build.</b> It costs a real network call and
 * about 300 tokens of a tight free-tier allowance, so every build paying that
 * is wrong. Run it deliberately:
 *
 * <pre>mvn test -Dtest=GroqProviderSpikeTest -Dtest.excluded.groups=</pre>
 *
 * <p>The tag is also what makes removing the key safe. Forcing
 * {@code app.ai.enabled=true} with no key configured fails the whole context at
 * bean creation — by design, since a live module with no credential is a
 * mistake worth shouting about — so the {@code assumeTrue} below would never be
 * reached. Excluded, not skipped, is the only version that actually holds.
 *
 * <p><b>Why it opts back into {@code .env}.</b> {@code application-test.yml}
 * deliberately blocks the dev {@code .env} so no test picks up developer
 * configuration by accident. This is the one test that needs a real credential,
 * so it re-enables the import for itself and nothing else.
 *
 * <p><b>Never assert on model prose.</b> The checks below are about plumbing —
 * did a well-formed answer come back, did usage arrive. What the model chose to
 * say is not a fixed thing and must never be a build gate.
 */
@Tag("spike")
@IntegrationTest
@TestPropertySource(properties = {
        "app.ai.enabled=true",
        "spring.config.import=optional:file:./.env[.properties]",
})
@DisplayName("Groq provider spike")
class GroqProviderSpikeTest {

    /** Shaped like the smart-search intent draft, small enough to be cheap. */
    record SearchIntent(String city, String area, Integer maxRentRupees, List<String> amenities) {}

    @Autowired private OpenAiChatModel groqFastChatModel;
    @Autowired private IntelligenceProperties properties;

    @Test
    @DisplayName("answers a structured smart-search prompt, and reports what it cost")
    void structuredCallAndTokenCost() {
        assumeTrue(
                StringUtils.hasText(properties.providers().groq().apiKey()),
                "No GROQ_API_KEY configured — spike skipped");

        ChatClient client = ChatClient.create(groqFastChatModel);

        SearchIntent intent = client.prompt()
                .system("""
                        Extract search intent for an Indian PG and hostel listing site.
                        Return only fields you are confident about. Use null otherwise.
                        Rent is a monthly figure in rupees.""")
                .user("looking for a single room in salt lake kolkata under 9000 with wifi and food")
                .call()
                .entity(SearchIntent.class);

        System.out.println(">>> SPIKE intent: " + intent);
        assertThat(intent).as("Groq returned no parseable structured output").isNotNull();

        // The measurement the budgets need. Printed rather than asserted: a
        // token count is a fact to record in the spec, not a build gate.
        ChatResponse response = client.prompt()
                .system("Extract search intent. Answer with JSON only.")
                .user("2 sharing near howrah station below 7500")
                .call()
                .chatResponse();

        assertThat(response).isNotNull();
        var usage = response.getMetadata().getUsage();
        System.out.println(">>> SPIKE model:  " + properties.providers().groq().models().structuredFast());
        System.out.println(">>> SPIKE tokens: prompt=" + usage.getPromptTokens()
                + " completion=" + usage.getCompletionTokens()
                + " total=" + usage.getTotalTokens());

        assertThat(usage.getTotalTokens())
                .as("No usage metadata came back, so there is nothing to meter a budget against")
                .isPositive();
    }
}
