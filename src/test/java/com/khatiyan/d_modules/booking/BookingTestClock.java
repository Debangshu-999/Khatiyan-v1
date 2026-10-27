package com.khatiyan.d_modules.booking;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * The application's clock, settable, shared by the booking suites so they also
 * share one application context.
 *
 * <p>A real clock and not a mock: the event registry stamps every publication
 * with it while the context starts, long before a test could stub anything.
 * Left alone it is the system clock.
 */
@TestConfiguration
public class BookingTestClock {

    public static class SettableClock extends Clock {
        private volatile Instant fixed;

        public void set(Instant instant) {
            this.fixed = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("Asia/Kolkata");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            Instant set = fixed;
            return set != null ? set : Instant.now();
        }
    }

    @Bean
    @Primary
    SettableClock bookingSettableClock() {
        return new SettableClock();
    }
}
