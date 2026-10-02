package com.khatiyan.d_modules.lead.api;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.lead.api.dto.LeadCountsResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadDetailResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadResponse;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;
import com.khatiyan.d_modules.lead.service.LeadQueryService;

/**
 * REST boundary for the leads pipeline.
 *
 * <p>Reads only, for now. A lead is written by what happens to its enquiry,
 * and later by visits, reviews and bookings. Nothing is created or edited here
 * by hand.
 */
@RestController
@RequestMapping("/api/v1")
@SuppressWarnings("null")
public class LeadController {

    private final LeadQueryService leadQueryService;

    public LeadController(LeadQueryService leadQueryService) {
        this.leadQueryService = leadQueryService;
    }

    /**
     * One page of the property's leads, newest first.
     *
     * @param state OPEN or CLOSED. Left out, both
     * @param stage one stage. Left out, all of them
     */
    @GetMapping("/properties/{propertyId}/leads")
    public PageResponse<LeadResponse> pageForProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) LeadState state,
            @RequestParam(required = false) LeadStage stage,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return leadQueryService.pageForProperty(user.userId(), propertyId, state, stage, page, size);
    }

    /** How many records sit at each stage, and how many closed. */
    @GetMapping("/properties/{propertyId}/leads/counts")
    public LeadCountsResponse counts(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return leadQueryService.countsForProperty(user.userId(), propertyId);
    }

    /** One lead with its timeline. */
    @GetMapping("/leads/{leadId}")
    public LeadDetailResponse detail(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID leadId) {
        return leadQueryService.detail(user.userId(), leadId);
    }
}
