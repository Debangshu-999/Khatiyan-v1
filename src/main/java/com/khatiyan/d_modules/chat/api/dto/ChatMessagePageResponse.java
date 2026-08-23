package com.khatiyan.d_modules.chat.api.dto;

import java.util.List;

/**
 * A page of a conversation, plus the one thread-level fact the messages cannot
 * carry themselves.
 *
 * <p>Receipts are a single number rather than a flag per message: the reader's
 * position is a high-water mark, so the client ticks everything it sent at or
 * below {@code counterpartLastReadSeq}. A per-message boolean would be the same
 * comparison done many times and would go stale the moment the number moved.
 */
public record ChatMessagePageResponse(
    List<ChatMessageResponse> messages,
    /**
     * How far the other side has read, as one number.
     *
     * <p>The furthest anybody on the other side has reached. Enough for a plain
     * tick on a one-to-one, where {@link #readers()} would be a list of one.
     */
    long counterpartLastReadSeq,
    /**
     * Everyone on the other side who has opened this conversation, with their
     * own position.
     *
     * <p>This is what makes "seen by" work on a team thread: the tenant wrote to
     * a group, so the useful answer is which of them saw it, not whether one did.
     */
    List<ChatThreadReaderResponse> readers,
    /**
     * The conversation itself — who it is with, and whether it still accepts
     * messages.
     *
     * <p>Carried here rather than left to the caller's navigation params. A
     * conversation opened from a push notification has no params to read, and a
     * title passed from a list goes stale the moment anything renames it.
     */
    ChatThreadResponse thread,
    /**
     * How far the READER had got before this request.
     *
     * <p>Their own mark, not the other side's — it is what lets the screen draw
     * a line above the first message they have not seen. Captured on the client
     * at open, because the act of reading moves it immediately afterwards.
     */
    long viewerLastReadSeq
) {}
