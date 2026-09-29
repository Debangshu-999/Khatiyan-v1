package com.khatiyan.d_modules.notification.listener;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.event.AgreementExpiryApproachingEvent;

/**
 * A reminder delivered on a later day than it was written for is dropped.
 *
 * <p>Seen 2026-09-27: after a notification outage the failed events were re-sent
 * together, and "ends in 2 days" landed beside "ends in 1 day" for the same
 * agreement.
 */
class AgreementExpiryStaleReminderTest {

    private static final LocalDate ENDS = LocalDate.of(2026, 9, 28);

    private static AgreementExpiryApproachingEvent event(int daysRemaining) {
        return new AgreementExpiryApproachingEvent(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), ENDS, daysRemaining);
    }

    @Test
    void aCountThatIsStillTrueIsNotStale() {
        assertThat(AgreementExpiryNotificationEventListener.isStale(event(1), LocalDate.of(2026, 9, 27))).isFalse();
    }

    @Test
    void aCountFromAnEarlierDayIsStale() {
        assertThat(AgreementExpiryNotificationEventListener.isStale(event(2), LocalDate.of(2026, 9, 27))).isTrue();
    }

    @Test
    void aStaleReminderSendsNothing() {
        NotificationModule notifications = mock(NotificationModule.class);
        PropertyModule properties = mock(PropertyModule.class);
        // 27 Sep in India, 10:00.
        Clock clock = Clock.fixed(Instant.parse("2026-09-27T04:30:00Z"), ZoneId.of("UTC"));

        new AgreementExpiryNotificationEventListener(notifications, properties, clock)
                .onAgreementExpiryApproaching(event(2));

        verifyNoInteractions(notifications, properties);
    }
}
