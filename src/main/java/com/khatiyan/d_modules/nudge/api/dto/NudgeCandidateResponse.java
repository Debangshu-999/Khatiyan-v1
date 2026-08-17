package com.khatiyan.d_modules.nudge.api.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * An active tenant on the send list, with their cooldown state.
 *
 * <p>{@code cooldownEndsAt} is sent rather than a bare "blocked" flag so the row
 * can say when the button wakes up. The server decides {@code canNudge} at the
 * moment of the request; the client counts down from {@code cooldownEndsAt}
 * without asking again.
 */
public record NudgeCandidateResponse(
    UUID tenancyId,
    UUID userId,
    String tenantName,
    String roomNumber,
    /** Null when this tenant has never been nudged. */
    Instant lastNudgedAt,
    /** Null when there is no cooldown running. */
    Instant cooldownEndsAt,
    boolean canNudge
) {}
