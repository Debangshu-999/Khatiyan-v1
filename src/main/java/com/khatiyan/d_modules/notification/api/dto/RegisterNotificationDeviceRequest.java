package com.khatiyan.d_modules.notification.api.dto;

import com.khatiyan.d_modules.notification.model.DevicePlatform;
import com.khatiyan.d_modules.notification.model.PushProvider;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body used by the client app to register a push provider token.
 */
public record RegisterNotificationDeviceRequest(

    @NotNull
    PushProvider provider,

    @NotBlank
    @Size(max = 500)
    String providerToken,

    @NotNull
    DevicePlatform platform
) {
}
