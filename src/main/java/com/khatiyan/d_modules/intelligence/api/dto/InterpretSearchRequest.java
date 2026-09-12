package com.khatiyan.d_modules.intelligence.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A sentence to interpret, plus the context it was typed in.
 *
 * @param query          what the person typed. Capped here as well as in the
 *                       service, because a very long input is either a paste
 *                       accident or someone probing the prompt, and neither is
 *                       worth spending a model call on
 * @param device         the device's coordinates, or null. Required only for a
 *                       "near me" sentence, and the server says so rather than
 *                       quietly searching from somewhere else
 */
public record InterpretSearchRequest(
        @NotBlank
        @Size(max = 300)
        String query,

        DeviceLocation device) {

    public record DeviceLocation(Double latitude, Double longitude) {

        public boolean isUsable() {
            return latitude != null && longitude != null;
        }
    }

    public boolean hasDevice() {
        return device != null && device.isUsable();
    }
}
