package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A batch of events from the app's tracker (2026-10-18).
 *
 * <p>The shape the common analytics pipelines use: each event carries its own
 * id, so a batch the app resends after a failed upload is ignored, and the time
 * it happened on the phone. {@code sentAt} is when the app sent the batch, which
 * lets the server correct for a phone whose clock is wrong.
 *
 * <p>Everything boxed: Jackson 3 refuses a body with a missing primitive, and
 * a malformed event should be set aside, not fail the whole batch.
 */
public record AppEventBatchRequest(Instant sentAt, Context context, List<AppEvent> events) {

    /** About the app, the same for every event in the batch. */
    public record Context(String appVersion, String platform) {
    }

    /**
     * One event.
     *
     * @param name       PROFILE_OPENED, PROFILE_CLOSED or CONTACT_TAPPED
     * @param viewId     pairs an open with its close
     * @param source     where the profile was opened from, on an open
     * @param durationMs time on the profile while the app was in front, on a close
     * @param channel    CALL, on a contact tap
     */
    public record AppEvent(
            UUID eventId,
            String name,
            Integer schemaVersion,
            Instant occurredAt,
            UUID propertyId,
            UUID viewId,
            String source,
            Long durationMs,
            String channel) {
    }
}
