package com.khatiyan.b_config;

import java.time.Clock;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The application's clock.
 *
 * <p>Exists so services that make decisions about "now" can be tested at a
 * chosen instant instead of at whatever time the suite happens to run. The
 * first case was recurring notices refusing a start time that had already
 * passed: with {@code LocalTime.now()} hard-coded, the only way to test the
 * guard was to pick a wall-clock time and hope the build never ran late enough
 * to cross it — which it did, at half past eleven at night.
 *
 * <p>{@code @ConditionalOnMissingBean} so a test slice can replace it with a
 * fixed clock without competing with this definition.
 */
@Configuration
public class ClockConfig {

    @Bean
    @ConditionalOnMissingBean
    public Clock systemClock() {
        return Clock.systemDefaultZone();
    }
}
