package com.khatiyan.d_modules.chat.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * How far the reader has got.
 *
 * <p>The mark only ever moves forward, so a stale report from a second device
 * cannot re-light a badge that has already been cleared.
 */
public record MarkChatReadRequest(
    @NotNull @PositiveOrZero Long lastReadSeq
) {}
