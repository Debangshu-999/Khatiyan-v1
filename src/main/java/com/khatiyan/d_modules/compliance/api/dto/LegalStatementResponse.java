package com.khatiyan.d_modules.compliance.api.dto;

/**
 * A click-wrap wording, served rather than shipped.
 *
 * <p>The app renders exactly this and sends it back when the person agrees. The
 * server refuses a mismatch, so what somebody agreed to is never whatever
 * their installed build happened to contain.
 */
public record LegalStatementResponse(String key, int version, String text) {
}
