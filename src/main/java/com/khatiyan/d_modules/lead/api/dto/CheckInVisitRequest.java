package com.khatiyan.d_modules.lead.api.dto;

import jakarta.validation.constraints.Size;

/**
 * Marks attendance: the scanned pass, or the code on it. One of the two.
 *
 * @param token what the scanned QR held
 * @param code  the six digits typed in
 */
public record CheckInVisitRequest(
        @Size(max = 64) String token,
        @Size(max = 6) String code) {
}
