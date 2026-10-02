package com.khatiyan.d_modules.lead.api.dto;

import java.util.List;

/** One lead with its timeline, newest entry first. */
public record LeadDetailResponse(LeadResponse lead, List<LeadActivityResponse> timeline) {
}
