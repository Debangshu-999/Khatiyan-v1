package com.khatiyan.d_modules.discovery.api.dto;

import java.math.BigDecimal;

public record LocationAreaResponse(
        String city,
        String state,
        String area,
        BigDecimal latitude,
        BigDecimal longitude
) {
}
