package com.khatiyan.d_modules.discovery.api.dto;

import java.math.BigDecimal;
import java.util.Set;

import org.hibernate.validator.constraints.URL;

import com.khatiyan.d_modules.discovery.model.PropertyLocalPlaceTag;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreatePropertyLocalPlaceRequest(
        @NotBlank
        @Size(max = 120)
        String name,

        @Size(max = 12)
        Set<PropertyLocalPlaceTag> tags,

        @Size(max = 800)
        String description,

        @Size(max = 20)
        String phone,

        @Size(max = 300)
        String addressText,

        @DecimalMin("-90.0")
        @DecimalMax("90.0")
        BigDecimal latitude,

        @DecimalMin("-180.0")
        @DecimalMax("180.0")
        BigDecimal longitude,

        @URL
        @Size(max = 600)
        String directionsUrl,

        @URL
        @Size(max = 600)
        String photoUrl,

        Boolean ownerRecommended
) {
}
