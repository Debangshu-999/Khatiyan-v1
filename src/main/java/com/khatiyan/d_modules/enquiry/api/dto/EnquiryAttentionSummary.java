package com.khatiyan.d_modules.enquiry.api.dto;

/** Disjoint queues: pick up an enquiry, answer it, or record the outcome of a pending call. */
public record EnquiryAttentionSummary(long unassigned, long awaitingResponse, long callsToRecord) {
}
