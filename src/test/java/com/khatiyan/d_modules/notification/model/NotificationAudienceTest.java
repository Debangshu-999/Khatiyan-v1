package com.khatiyan.d_modules.notification.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.Test;

/**
 * Every subtype must have an answer.
 *
 * <p>javac refuses a switch expression that misses an enum value, but the
 * IDE's compiler writes the class anyway with a method that throws at run
 * time. Seen 2026-09-27: two new subtypes left out of {@code forSubtype} made
 * EVERY notification fail in the running backend while everything compiled
 * and the backend stayed up.
 */
class NotificationAudienceTest {

    @Test
    void everySubtypeHasAnAudienceAnswer() {
        for (NotificationSubtype subtype : NotificationSubtype.values()) {
            assertThatCode(() -> NotificationAudience.forSubtype(subtype))
                    .as(subtype.name())
                    .doesNotThrowAnyException();
        }
    }

    @Test
    void theTwoLateAdditionsLandWhereTheirListenerSendsThem() {
        assertThat(NotificationAudience.forSubtype(NotificationSubtype.FUTURE_BOOKING_BLOCKED))
                .isEqualTo(NotificationAudience.MANAGEMENT);
        assertThat(NotificationAudience.forSubtype(NotificationSubtype.TENANCY_PENDING_EXIT)).isNull();
    }
}
