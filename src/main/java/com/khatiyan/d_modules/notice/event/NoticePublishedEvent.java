package com.khatiyan.d_modules.notice.event;

import java.util.UUID;

/**
 * Published when a notice should notify active tenants.
 */
public record NoticePublishedEvent(
    UUID noticeId,
    UUID propertyId,
    String title
) {
}
