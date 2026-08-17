package com.khatiyan.d_modules.nudge.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.nudge.model.Nudge;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Who to nudge and what to say. The property is taken from the tenancy rather
 * than the caller, so a valid tenancy id cannot be paired with a property the
 * sender happens to manage.
 */
public record SendNudgeRequest(
    @NotNull(message = "Choose a tenant to nudge.")
    UUID tenancyId,

    @NotBlank(message = "A nudge needs a message.")
    @Size(max = Nudge.MAX_MESSAGE_LENGTH, message = "A nudge can be at most 200 characters.")
    String message
) {}
