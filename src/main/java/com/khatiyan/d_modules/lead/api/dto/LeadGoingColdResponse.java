package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;

import com.khatiyan.d_modules.lead.model.LeadColdReason;

/**
 * Why an open lead is going cold, and its times.
 *
 * @param since when it began waiting. Null where the reason is a deadline
 *              coming up and nothing has been waiting
 * @param by    the moment it runs out. Null where nothing ends it by itself,
 *              and somebody has to act
 */
public record LeadGoingColdResponse(LeadColdReason reason, Instant since, Instant by) {
}
