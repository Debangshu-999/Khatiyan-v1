package com.khatiyan.d_modules.discovery.api.dto;

import java.math.BigDecimal;

public record LocationCityResponse(
        String city,
        String state,
        BigDecimal latitude,
        BigDecimal longitude
) {
}
