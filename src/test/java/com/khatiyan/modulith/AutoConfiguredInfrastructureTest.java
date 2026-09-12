package com.khatiyan.modulith;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.modulith.events.core.EventPublicationRegistry;
import org.springframework.modulith.events.core.EventSerializer;
import org.springframework.security.web.SecurityFilterChain;

import com.khatiyan.support.IntegrationTest;

import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import net.javacrumbs.shedlock.core.LockProvider;

/**
 * The infrastructure beans that would go missing quietly.
 *
 * <p><b>Why these and not others.</b> Most missing beans stop the application:
 * something injects them, the context fails, and
 * {@code ApplicationContextLoadsTest} catches it. The ones below are different.
 * Nothing injects them by type — they work by wrapping other beans or by
 * running in the background — so if their auto-configuration stops applying,
 * the context starts perfectly and the behaviour simply stops:
 *
 * <ul>
 * <li><b>ShedLock.</b> Without the advisor, {@code @SchedulerLock} is an
 *     annotation nobody reads. Every scheduled job runs on every instance —
 *     billing cycles generated twice, notifications sent twice.</li>
 * <li><b>Resilience4j.</b> Without the registry and its aspects,
 *     {@code @CircuitBreaker} and {@code @Retry} are decoration. Calls that
 *     should trip a breaker hammer a failing provider instead.</li>
 * <li><b>Modulith event publication.</b> Without the registry, cross-module
 *     events stop being persisted, so an event whose listener fails is lost
 *     rather than retried.</li>
 * <li><b>Security filter chain.</b> A context with no chain does not refuse to
 *     start. It serves every endpoint unauthenticated.</li>
 * </ul>
 *
 * <p><b>Why now.</b> Hazard #3 of the Spring Boot 4.1 upgrade
 * (see {@code docs/Spring AI/ai-intelligence-platform-spec.md} §6.2): Boot 4
 * ships smaller auto-configuration modules, so anything wired without a starter
 * may need its dependencies restated. Four of these come from non-starter
 * dependencies — {@code spring-modulith-events-jdbc},
 * {@code spring-modulith-events-jackson}, {@code shedlock-spring} and
 * {@code resilience4j-spring-boot3}, the last of which the spec says must
 * become the Boot 4 artifact outright.
 *
 * <p>This is a list of what must keep existing, not of everything that does.
 * Add to it when something new is wired without a starter and fails quietly.
 */
@IntegrationTest
@DisplayName("infrastructure that fails silently")
class AutoConfiguredInfrastructureTest {

    @Autowired private ApplicationContext context;

    @Test
    @DisplayName("ShedLock can still take a lock, and still intercepts the annotation")
    void shedLockIsWired() {
        assertThat(context.getBeansOfType(LockProvider.class))
                .as("No LockProvider: @SchedulerLock cannot lock anything.")
                .isNotEmpty();

        // The provider alone proves nothing — it is our own @Bean and would
        // survive the auto-configuration going away. The advisor is what makes
        // the annotation do something, and it comes from shedlock-spring.
        assertThat(beanTypeNamesContaining("ScheduledLock"))
                .as("No ShedLock advisor: @SchedulerLock is ignored and every job "
                        + "runs on every instance.")
                .isNotEmpty();
    }

    @Test
    @DisplayName("Resilience4j registries are present")
    void resilienceIsWired() {
        assertThat(context.getBeansOfType(CircuitBreakerRegistry.class))
                .as("No CircuitBreakerRegistry: @CircuitBreaker is decoration.")
                .isNotEmpty();
    }

    @Test
    @DisplayName("Modulith persists event publications")
    void eventPublicationIsWired() {
        assertThat(context.getBeansOfType(EventPublicationRegistry.class))
                .as("No EventPublicationRegistry: a failed listener loses its event "
                        + "instead of retrying it.")
                .isNotEmpty();
        assertThat(context.getBeansOfType(EventSerializer.class)).isNotEmpty();
    }

    @Test
    @DisplayName("the security filter chain exists")
    void securityIsWired() {
        assertThat(context.getBeansOfType(SecurityFilterChain.class))
                .as("No SecurityFilterChain: every endpoint is open.")
                .isNotEmpty();
    }

    /**
     * Bean types matched by simple name, for infrastructure whose class is not
     * on our compile classpath or is an implementation detail we should not
     * import.
     */
    private java.util.List<String> beanTypeNamesContaining(String fragment) {
        return java.util.Arrays.stream(context.getBeanDefinitionNames())
                .map(name -> {
                    Class<?> type = context.getType(name);
                    return type == null ? "" : type.getName();
                })
                .filter(name -> name.contains(fragment))
                .toList();
    }
}
