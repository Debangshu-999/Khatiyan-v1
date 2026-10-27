package com.khatiyan.d_modules.lead.api;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.lead.api.dto.AppEventBatchRequest;
import com.khatiyan.d_modules.lead.api.dto.AppEventBatchResponse;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse;
import com.khatiyan.d_modules.lead.service.ListingJourneyService;
import com.khatiyan.d_modules.lead.service.ProfileEventService;

/**
 * The listing funnel's two ends (2026-10-18): the app's batched profile events
 * coming in, and the funnel an owner reads.
 */
@RestController
@RequestMapping("/api/v1")
public class ProfileEventController {

    private final ProfileEventService profileEventService;
    private final ListingJourneyService listingJourneyService;

    public ProfileEventController(ProfileEventService profileEventService, ListingJourneyService listingJourneyService) {
        this.profileEventService = profileEventService;
        this.listingJourneyService = listingJourneyService;
    }

    @PostMapping("/app-events")
    public AppEventBatchResponse collect(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody AppEventBatchRequest batch) {
        return profileEventService.collect(user.userId(), batch);
    }

    @GetMapping("/properties/{propertyId}/leads/insights")
    public ListingJourneyResponse journey(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) ListingJourneyService.Period period,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return listingJourneyService.journey(user.userId(), propertyId, period, from, to);
    }
}
