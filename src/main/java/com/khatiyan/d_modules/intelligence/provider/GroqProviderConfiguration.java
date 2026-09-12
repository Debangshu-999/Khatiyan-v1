package com.khatiyan.d_modules.intelligence.provider;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.setup.OpenAiSetup;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import com.khatiyan.d_modules.intelligence.IntelligenceProperties;
import com.openai.client.OpenAIClient;
import com.openai.client.OpenAIClientAsync;

import io.micrometer.observation.ObservationRegistry;

/**
 * The Groq chat model, built by hand.
 *
 * <p><b>Explicit, not auto-configured.</b> Spring AI's OpenAI auto-configuration
 * is excluded in {@code application.yml}: left on, it builds six models aimed at
 * {@code api.openai.com}, and an auto-configured {@code ChatModel} is one an
 * {@code @Autowired ChatModel} somewhere else could pick up by accident and
 * quietly send a tenant's words to a provider nobody chose. Every model in this
 * application is constructed here, with its own base URL, key and retry policy.
 *
 * <p><b>Groq is OpenAI-shaped, not OpenAI.</b> It serves the same wire format at
 * {@code api.groq.com/openai/v1}, which is the only reason the OpenAI client is
 * involved at all.
 *
 * <p><b>No bean unless the module is switched on.</b> {@code app.ai.enabled}
 * false means this configuration never runs, so a disabled module holds no
 * client, opens no connection pool and reads no key.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "app.ai", name = "enabled", havingValue = "true")
public class GroqProviderConfiguration {

    /**
     * One attempt, then fall over to the other provider.
     *
     * <p>The OpenAI client retries three times by default, and Spring AI's own
     * default is higher still. Both are wrong here. A 429 from Groq means the
     * free-tier budget is spent, and retrying the same provider spends what is
     * left of it faster while the reader waits — the fallback provider replaces
     * retrying, and a refusal we write ourselves beats a timeout.
     */
    private static final int NO_RETRIES = 0;

    @Bean
    OpenAIClient groqClient(IntelligenceProperties properties) {
        IntelligenceProperties.Groq groq = requireKey(properties);
        return OpenAiSetup.setupSyncClient(
                groq.baseUrl(), groq.apiKey(), null, null, null, null, false, false,
                groq.models().structuredFast(), properties.smartSearch().timeout(), NO_RETRIES,
                null, Map.of(), ObservationRegistry.NOOP, null, List.of());
    }

    /**
     * The async client, which OpenAiChatModel requires even for blocking calls.
     *
     * <p>Without it the builder falls back to constructing its own client from
     * ambient configuration and fails with "At least one credential source must
     * be specified" — a confusing message, because the key is right there on
     * the sync client it was already given.
     */
    @Bean
    OpenAIClientAsync groqClientAsync(IntelligenceProperties properties) {
        IntelligenceProperties.Groq groq = requireKey(properties);
        return OpenAiSetup.setupAsyncClient(
                groq.baseUrl(), groq.apiKey(), null, null, null, null, false, false,
                groq.models().structuredFast(), properties.smartSearch().timeout(), NO_RETRIES,
                null, Map.of(), ObservationRegistry.NOOP, null, List.of());
    }

    private static IntelligenceProperties.Groq requireKey(IntelligenceProperties properties) {
        IntelligenceProperties.Groq groq = properties.providers().groq();
        if (!StringUtils.hasText(groq.apiKey())) {
            // Enabled without a key is a configuration mistake, and it is worth
            // saying so at startup rather than on the first tenant's search.
            throw new IllegalStateException(
                    "app.ai.enabled is true but no Groq API key is set. Put GROQ_API_KEY in .env "
                            + "(it is gitignored) or set app.ai.enabled=false.");
        }
        return groq;
    }

    /**
     * The fast structured model, for smart search.
     *
     * <p>Named rather than {@code @Primary}: a second provider is coming, and a
     * primary chat model is the same accident this class exists to avoid.
     * Callers ask for the model they mean.
     */
    @Bean
    OpenAiChatModel groqFastChatModel(
            OpenAIClient groqClient, OpenAIClientAsync groqClientAsync, IntelligenceProperties properties) {
        return OpenAiChatModel.builder()
                .openAiClient(groqClient)
                .openAiClientAsync(groqClientAsync)
                .options(OpenAiChatOptions.builder()
                        .model(properties.providers().groq().models().structuredFast())
                        // Groq converts a temperature of 0 to 1e-8 rather than
                        // rejecting it, so ask for the smallest value it will
                        // honour instead of relying on that.
                        .temperature(0.01)
                        .reasoningEffort(properties.providers().groq().reasoningEffort())
                        .build())
                .build();
    }

    /** How long a single call may take before it is abandoned. */
    static Duration timeoutOf(IntelligenceProperties properties) {
        return properties.smartSearch().timeout();
    }
}
