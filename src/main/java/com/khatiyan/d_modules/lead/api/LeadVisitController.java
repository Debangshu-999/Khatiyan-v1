package com.khatiyan.d_modules.lead.api;

import com.khatiyan.d_modules.lead.api.dto.CancelVisitRequest;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.concurrency.RequiresVersion;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.lead.api.dto.BookedVisitResponse;
import com.khatiyan.d_modules.lead.api.dto.EnquiryChatActionsResponse;
import com.khatiyan.d_modules.lead.api.dto.RescheduleVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.ScheduleVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.VisitAvailabilityResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitResponse;
import com.khatiyan.d_modules.lead.service.LeadVisitService;

import jakarta.validation.Valid;

/**
 * Visits, and the action bar of an enquiry's chat.
 *
 * <p>Both sides of an enquiry use these: the prospect and the property's
 * management. Each call works out which side is asking.
 */
@RestController
@RequestMapping("/api/v1")
@SuppressWarnings("null")
public class LeadVisitController {

    private final LeadVisitService leadVisitService;

    public LeadVisitController(LeadVisitService leadVisitService) {
        this.leadVisitService = leadVisitService;
    }

    /** What the bar above the enquiry chat's message box shows for the caller. */
    @GetMapping("/enquiries/{enquiryId}/chat-actions")
    public EnquiryChatActionsResponse chatActions(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID enquiryId) {
        return leadVisitService.chatActions(user.userId(), enquiryId);
    }

    /** The visits booked on the property's enquiries and not yet done: the Enquiries card's "Manage visit". */
    @GetMapping("/properties/{propertyId}/booked-visits")
    public List<BookedVisitResponse> bookedVisits(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return leadVisitService.bookedVisits(user.userId(), propertyId);
    }

    /** The dates and slots open for a visit, from tomorrow to 30 days ahead, with the places left. */
    @GetMapping("/properties/{propertyId}/visit-availability")
    public VisitAvailabilityResponse availability(@PathVariable UUID propertyId) {
        return leadVisitService.availability(propertyId);
    }

    /** Books a visit from an enquiry, by the prospect or by its handler. */
    @PostMapping("/enquiries/{enquiryId}/visits")
    public ResponseEntity<EnquiryChatActionsResponse> schedule(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID enquiryId,
            @Valid @RequestBody ScheduleVisitRequest request) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(leadVisitService.schedule(user.userId(), enquiryId, request));
    }

    /** Cancels a visit, from either side. The person is back at Enquired and may book again. */
    @PostMapping("/visits/{visitId}/cancel")
    @RequiresVersion
    public VisitResponse cancel(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID visitId,
            @Valid @RequestBody CancelVisitRequest request) {
        return leadVisitService.cancel(user.userId(), visitId, request);
    }

    /** Moves a visit. The prospect may twice. */
    @PatchMapping("/visits/{visitId}/reschedule")
    @RequiresVersion
    public VisitResponse reschedule(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID visitId,
            @Valid @RequestBody RescheduleVisitRequest request) {
        return leadVisitService.reschedule(user.userId(), visitId, request);
    }
}
