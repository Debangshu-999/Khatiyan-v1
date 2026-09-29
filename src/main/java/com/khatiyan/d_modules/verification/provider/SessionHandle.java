package com.khatiyan.d_modules.verification.provider;

import java.time.Instant;

/**
 * An open Aadhaar App session.
 *
 * <p>No QR code: the Aadhaar App must be on the tenant's own phone (owner's
 * rule, 2026-09-27), so the intent link is the only way in.
 *
 * @param providerSessionId the provider's id, used to ask about it later
 * @param intentUrl         opens the Aadhaar App on this phone
 * @param expiresAt         after this the session is closed and swept
 */
public record SessionHandle(String providerSessionId, String intentUrl, Instant expiresAt) {
}
