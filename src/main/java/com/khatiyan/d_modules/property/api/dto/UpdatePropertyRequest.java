package com.khatiyan.d_modules.property.api.dto;

import java.math.BigDecimal;
import java.util.Set;

import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Request body used by an owner to update editable property details.
 */
public record UpdatePropertyRequest(

    @NotBlank
    @Size(max = 120)
    String name,

    @NotBlank
    @Size(max = 300)
    String address,

    @NotBlank
    @Size(max = 80)
    String city,

    @NotBlank
    @Size(max = 10)
    String pincode,

    @DecimalMin(value = "-90.0", message = "must be greater than or equal to -90")
    @DecimalMax(value = "90.0", message = "must be less than or equal to 90")
    @Digits(integer = 3, fraction = 7)
    BigDecimal latitude,

    @DecimalMin(value = "-180.0", message = "must be greater than or equal to -180")
    @DecimalMax(value = "180.0", message = "must be less than or equal to 180")
    @Digits(integer = 3, fraction = 7)
    BigDecimal longitude,

    @NotNull
    PropertyType type,

    Set<@NotNull PropertyFacility> facilities,

    Set<@Size(max = 80) String> customFacilities,

    @Positive
    Long dailyGuestAcRatePaise,

    @Positive
    Long dailyGuestNonAcRatePaise,

    @PositiveOrZero
    Long rentLateFeePerDayPaise,

    @PositiveOrZero
    @Max(30)
    Integer rentGraceDays,

    @PositiveOrZero
    Long standardDepositPaise,

    @PositiveOrZero
    @Max(365)
    Integer noticePeriodDays
) {
}
