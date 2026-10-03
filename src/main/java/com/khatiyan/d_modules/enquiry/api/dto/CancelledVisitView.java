package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;

/**
 * The enquiry's latest cancelled visit, for the owner's card: "Visit
 * cancelled", and the reason under the intent line (owner's design,
 * 2026-10-03).
 *
 * @param reason   null on visits cancelled before reasons were asked for
 * @param byTenant whether the enquirer cancelled it, rather than the property
 */
public record CancelledVisitView(String reason, boolean byTenant, Instant cancelledAt) {
}
