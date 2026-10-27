package com.khatiyan.d_modules.enquiry.event;

import java.time.Instant;
import java.util.UUID;

/** Attendance established the original post-visit window; consumers re-read current state. */
public record EnquiryPostVisitWindowOpenedEvent(
        UUID enquiryId, UUID propertyId, UUID enquirerUserId, UUID visitId, Instant openedAt) {}
