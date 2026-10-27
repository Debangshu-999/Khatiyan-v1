package com.khatiyan.d_modules.lead.api;

import java.time.YearMonth;
import java.util.Set;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
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
import com.khatiyan.d_modules.lead.api.dto.LeadFunnelResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadResponse;
import com.khatiyan.d_modules.lead.model.LeadKind;
import com.khatiyan.d_modules.lead.model.LeadRepeatFlag;
import com.khatiyan.d_modules.lead.service.LeadQueryService;

/**
 * REST boundary for the leads pipeline.
 *
 * <p>A lead is written by what happens to its enquiry, its visit and its
 * booking, each on its own screen. Nothing is done to a lead by hand: even a
 * duplicate or potential spam is marked by a rule (user, 2026-10-17).
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
     * One page of the property's records, newest first.
     *
     * @param kind      the kinds wanted, repeated or comma-separated. Left out, every record
     * @param resumed   true for only the people who came back
     * @param goingCold true for only the leads going cold, the one that runs out soonest first
     * @param mine      only the leads the reader handles
     * @param repeat    only the duplicates, the potential spam, or both
     * @param q         part of the person's name or of the short code
     */
    @GetMapping("/properties/{propertyId}/leads")
    public PageResponse<LeadResponse> pageForProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) Set<LeadKind> kind,
            @RequestParam(defaultValue = "false") boolean resumed,
            @RequestParam(defaultValue = "false") boolean goingCold,
            @RequestParam(defaultValue = "false") boolean mine,
            @RequestParam(required = false) Set<LeadRepeatFlag> repeat,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return leadQueryService.pageForProperty(
                user.userId(), propertyId, kind, resumed, goingCold, mine, repeat, q, page, size);
    }

    /**
     * How many records the property has of each kind, with how many came back,
     * how many are repeats and how many are going cold.
     */
    @GetMapping("/properties/{propertyId}/leads/counts")
    public LeadCountsResponse counts(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return leadQueryService.countsForProperty(user.userId(), propertyId);
    }

    /**
     * The property's pipeline for one month, in IST.
     *
     * @param month {@code 2026-10}. Left out, the month it is now
     */
    @GetMapping("/properties/{propertyId}/leads/funnel")
    public LeadFunnelResponse funnel(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") YearMonth month) {
        return leadQueryService.funnel(user.userId(), propertyId, month);
    }

    /** One lead with its timeline, its visits and its bookings. */
    @GetMapping("/leads/{leadId}")
    public LeadDetailResponse detail(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID leadId) {
        return leadQueryService.detail(user.userId(), leadId);
    }
}
