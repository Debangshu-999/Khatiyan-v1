package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.model.EnquiryEndReason;

/**
 * One way an enquiry ended, for the action log (user, 2026-10-03): closed,
 * expired, or expired because the enquirer raised a new one.
 *
 * @param byUserId  who closed it, null for an expiry. The enquirer themselves
 *                  when their second Not interested closed it.
 * @param byName    their name, null for an expiry
 * @param automatic the 7-day close: nobody pressed anything
 * @param reason    why it ran out, as on the expired card. Null for a closing,
 *                  and for an expiry the sweep has not reached yet.
 */
public record EnquiryEndingView(
        EnquiryEndingKind kind,
        Instant at,
        UUID byUserId,
        String byName,
        boolean automatic,
        EnquiryEndReason reason) {

    public static EnquiryEndingView closed(Instant at, UUID byUserId, String byName, boolean automatic) {
        return new EnquiryEndingView(EnquiryEndingKind.CLOSED, at, byUserId, byName, automatic, null);
    }

    public static EnquiryEndingView expired(Instant at, EnquiryEndReason reason) {
        return new EnquiryEndingView(EnquiryEndingKind.EXPIRED, at, null, null, false, reason);
    }

    public static EnquiryEndingView expiredByDuplicate(Instant at) {
        return new EnquiryEndingView(EnquiryEndingKind.EXPIRED_BY_DUPLICATE, at, null, null, false, null);
    }
}
