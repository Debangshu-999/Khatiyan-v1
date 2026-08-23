package com.khatiyan.d_modules.chat.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.chat.model.ChatThreadKind;
import com.khatiyan.d_modules.chat.model.ChatThreadOrigin;
import com.khatiyan.d_modules.chat.model.ChatThreadStatus;

/**
 * One row in a conversation list.
 *
 * <p>{@code id} is null for a tenant who has never been written to. The Tenants
 * section is a roster of current tenants rather than an inbox of started
 * conversations, so a row can exist before its thread does — the thread is
 * created by the first message.
 */
public record ChatThreadResponse(
    UUID id,
    ChatThreadKind kind,
    ChatThreadOrigin origin,
    UUID originId,
    UUID propertyId,
    ChatThreadStatus status,
    /** What the row is called: the other person, or the property for a team thread. */
    String title,
    /** The person on the other side. Null for a team thread read by management. */
    UUID counterpartUserId,
    /** The other party's photo, when they have one. */
    String counterpartPhotoUrl,
    String lastMessagePreview,
    Instant lastMessageAt,
    String lastMessageKind,
    long lastMessageSeq,
    boolean unread,
    /**
     * How far the OTHER side has read, for rendering receipts on your own
     * messages: anything you sent at or below this seq has been read.
     *
     * <p>On a team thread this is the furthest ANY manager has read, because the
     * tenant wrote to the property rather than to a person — one manager opening
     * it means the property has seen it. Read by management, it is the tenant's
     * own position, never a colleague's, which would tick for the wrong reason.
     */
    long counterpartLastReadSeq
) {}
