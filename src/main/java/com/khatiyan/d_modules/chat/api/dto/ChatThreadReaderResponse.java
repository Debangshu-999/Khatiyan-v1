package com.khatiyan.d_modules.chat.api.dto;

import java.util.UUID;

/**
 * One person on the other side, and how far they have read.
 *
 * <p>A tick cannot say "two of the three managers have seen this", which on a
 * team thread is the thing the tenant actually wants to know. Reading positions
 * are high-water marks, so the client works out who saw a given message by
 * keeping the readers whose {@code lastReadSeq} reaches that message's seq.
 *
 * <p>Only people who have opened the conversation at least once appear here. A
 * manager who never looked has no read row, and listing them at zero would be
 * inventing a reader.
 */
public record ChatThreadReaderResponse(
    UUID userId,
    String name,
    long lastReadSeq
) {}
