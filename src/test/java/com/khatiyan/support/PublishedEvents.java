package com.khatiyan.support;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Waits for cross-module events to be handled.
 *
 * <p>A listener marked {@code @ApplicationModuleListener} runs after the
 * publisher's transaction commits, on its own thread. A test that publishes an
 * event and looks straight away is looking before the listener has run. A test
 * that deletes its rows straight away pulls them out from under it.
 *
 * <p>Completed publications are deleted from {@code event_publication}, so
 * "none left for this listener" means it has finished.
 */
public final class PublishedEvents {

    private static final Duration PATIENCE = Duration.ofSeconds(15);

    private PublishedEvents() {
    }

    /**
     * Blocks until one listener has handled every event that mentions an id.
     *
     * @param listenerClass the listener's simple class name
     * @param mentioning    an id the events carry, usually the test's property,
     *                      so another test's events are not waited for
     */
    public static void awaitHandled(JdbcTemplate jdbc, String listenerClass, UUID mentioning) {
        Instant giveUp = Instant.now().plus(PATIENCE);
        while (Instant.now().isBefore(giveUp)) {
            Long outstanding = jdbc.queryForObject("""
                    SELECT COUNT(*)
                    FROM public.event_publication
                    WHERE completion_date IS NULL
                      AND listener_id LIKE ?
                      AND serialized_event LIKE ?
                    """, Long.class, "%" + listenerClass + "%", "%" + mentioning + "%");
            if (outstanding != null && outstanding == 0) {
                return;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        throw new AssertionError(
                listenerClass + " was still handling events after " + PATIENCE.toSeconds() + " seconds");
    }
}
