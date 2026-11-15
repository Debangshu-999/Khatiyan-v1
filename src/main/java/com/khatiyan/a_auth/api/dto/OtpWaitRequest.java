package com.khatiyan.a_auth.api.dto;

import com.khatiyan.a_auth.model.OtpPurpose;

import jakarta.validation.constraints.Size;

/**
 * Which number or address to ask the resend wait for (user, 2026-11-14). In the
 * body, not the URL, so a phone or an email never lands in an access log.
 */
public record OtpWaitRequest(
    @Size(max = 15) String phone,
    @Size(max = 320) String email,
    OtpPurpose purpose
) {}
