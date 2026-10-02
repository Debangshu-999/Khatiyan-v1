package com.khatiyan.d_modules.enquiry.event;

import java.util.UUID;

import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerAssignment;

/** An enquiry has a handler, for the first time or a new one. */
public record EnquiryHandlerAssignedEvent(
        UUID enquiryId,
        UUID propertyId,
        UUID enquirerUserId,
        UUID handlerUserId,
        EnquiryHandlerAssignment assignedBy) {
}
