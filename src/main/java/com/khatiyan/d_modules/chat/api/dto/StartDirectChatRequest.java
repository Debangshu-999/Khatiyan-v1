package com.khatiyan.d_modules.chat.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/** Open the one-to-one with this person, or return the one that already exists. */
public record StartDirectChatRequest(
    @NotNull UUID propertyId,
    @NotNull UUID withUserId
) {}
