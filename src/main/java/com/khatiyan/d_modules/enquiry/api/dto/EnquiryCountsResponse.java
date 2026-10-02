package com.khatiyan.d_modules.enquiry.api.dto;

/**
 * The badges of the enquiries screen.
 *
 * @param awaiting   every enquiry on the property still waiting on an answer
 * @param mine       the part of it the person asking handles
 * @param unassigned the part of it nobody handles yet
 */
public record EnquiryCountsResponse(long awaiting, long mine, long unassigned) {
}
