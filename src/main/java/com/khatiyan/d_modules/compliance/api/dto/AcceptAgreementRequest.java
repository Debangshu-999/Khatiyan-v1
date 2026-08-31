package com.khatiyan.d_modules.compliance.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * What the tenant sends when they sign.
 *
 * <p>Three of these fields exist to be CHECKED rather than stored, and the check
 * is the point of each one.
 *
 * <p>{@code contentHash} is the agreement as it looked on their screen. The
 * server recomputes it from the agreement as it stands now and refuses if they
 * differ, which catches the one case that would otherwise be silent: an owner
 * amending clauses while the tenant is reading them. Without it a signature
 * could attach to text the signatory never saw.
 *
 * <p>{@code statementText} is the click-wrap wording the app displayed. The
 * server holds the canonical copy and refuses a mismatch, so a modified or
 * out-of-date build cannot record somebody as having agreed to words we did not
 * write.
 *
 * <p>{@code otp} proves the person was reachable on their registered number at
 * that moment. Bound to this agreement by the contentHash check above rather
 * than by anything inside the code itself.
 */
public record AcceptAgreementRequest(
        @NotBlank @Size(max = 8) String otp,
        @NotBlank @Size(max = 128) String contentHash,
        @NotBlank String statementText,
        @Valid DeviceFingerprintInput device) {
}
