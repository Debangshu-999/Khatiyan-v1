package com.khatiyan.d_modules.chat.api.dto;

import java.util.UUID;

/**
 * Somebody the reader may start a one-to-one with.
 *
 * <p>{@code existingThreadId} is what stops the picker offering a duplicate: a
 * person already spoken to opens their thread rather than creating a second one.
 */
public record ChatContactResponse(
    UUID userId,
    String name,
    /** OWNER, MANAGER or TENANT — for grouping the picker, not for permissions. */
    String role,
    UUID existingThreadId
) {}
