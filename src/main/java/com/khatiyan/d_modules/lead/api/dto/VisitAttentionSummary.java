package com.khatiyan.d_modules.lead.api.dto;

/** Today's scheduled arrivals, split at the end of their slot. Missed past days are the visitor's to move. */
public record VisitAttentionSummary(long arrivalsToday, long attendanceOverdue) {
}
