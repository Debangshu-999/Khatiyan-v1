package com.khatiyan.d_modules.nudge.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.nudge.model.Nudge;

/**
 * One nudge, as both sides read it.
 *
 * <p>The tenant screen uses the sender fields, the owner's Sent tab uses the
 * recipient fields, and both are filled — a nudge is short enough that
 * splitting this into two shapes would cost more than it saved.
 */
public record NudgeResponse(
    UUID id,
    UUID propertyId,
    UUID tenancyId,
    String message,
    Instant sentAt,
    Instant readAt,

    UUID recipientUserId,
    /** Null when the tenant's user record could not be resolved. */
    String recipientName,
    /** Room number, for the owner's Sent tab. Null if the room is gone. */
    String roomNumber,

    UUID senderUserId,
    String senderName,
    /**
     * True when the reader sent this one. Drives "Sent by you" against "Sent by
     * Rahul Sharma", which is the point of showing the whole property's nudges
     * rather than only the reader's own.
     */
    boolean sentByViewer
) {
    public static NudgeResponse of(
            Nudge nudge,
            String recipientName,
            String roomNumber,
            String senderName,
            boolean sentByViewer) {
        return new NudgeResponse(
                nudge.getId(),
                nudge.getPropertyId(),
                nudge.getTenancyId(),
                nudge.getMessage(),
                nudge.getSentAt(),
                nudge.getReadAt(),
                nudge.getRecipientUserId(),
                recipientName,
                roomNumber,
                nudge.getSenderUserId(),
                senderName,
                sentByViewer);
    }
}
