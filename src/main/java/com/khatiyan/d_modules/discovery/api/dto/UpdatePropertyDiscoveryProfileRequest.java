package com.khatiyan.d_modules.discovery.api.dto;

import org.hibernate.validator.constraints.URL;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdatePropertyDiscoveryProfileRequest(
        @NotBlank
        @Size(max = 160)
        String headline,

        @NotBlank
        @Size(max = 1000)
        String description,

        @URL
        @Size(max = 600)
        String profileImageUrl,

        Boolean showOwnerContact,

        Boolean showManagerContact
) {
}
