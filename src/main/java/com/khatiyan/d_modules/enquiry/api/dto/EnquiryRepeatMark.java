package com.khatiyan.d_modules.enquiry.api.dto;

/**
 * The person behind an enquiry walked away from earlier records at this
 * property (user, 2026-10-17).
 *
 * @param flag         duplicate after one or two, potential spam after three or more
 * @param earlierLeads how many of their earlier records here ended for their own reason
 * @param reason       the words to show, as the leads pipeline writes them
 */
public record EnquiryRepeatMark(EnquiryRepeatFlag flag, int earlierLeads, String reason) {
}
