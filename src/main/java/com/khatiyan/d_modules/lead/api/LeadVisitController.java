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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.concurrency.RequiresVersion;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.lead.api.dto.BookedVisitResponse;
import com.khatiyan.d_modules.lead.api.dto.CheckInVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.MyVisitResponse;
import com.khatiyan.d_modules.lead.api.dto.PropertyVisitsResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitCardResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitFormRequest;
import com.khatiyan.d_modules.lead.api.dto.VisitMoveOptionsResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitPassResponse;
import com.khatiyan.d_modules.lead.api.dto.EnquiryChatActionsResponse;
import com.khatiyan.d_modules.lead.api.dto.RescheduleVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.ScheduleVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.VisitAvailabilityResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitResponse;
import com.khatiyan.d_modules.lead.service.LeadVisitService;
import com.khatiyan.d_modules.lead.service.VisitDayService;

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
    private final VisitDayService visitDayService;

    public LeadVisitController(LeadVisitService leadVisitService, VisitDayService visitDayService) {
        this.leadVisitService = leadVisitService;
        this.visitDayService = visitDayService;
    }

    /** The Manage Visits screen: today's visits, the ones to come, and the missed. */
    @GetMapping("/properties/{propertyId}/visits")
    public PropertyVisitsResponse propertyVisits(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable UUID propertyId) {
        return visitDayService.propertyVisits(user.userId(), propertyId);
    }

    /** The visitor's own visits, at any property: My visits. */
    @GetMapping("/visits/mine")
    public List<MyVisitResponse> myVisits(@AuthenticationPrincipal UserPrincipal user) {
        return visitDayService.myVisits(user.userId());
    }

    /** The visitor's pass for their slot: the QR's contents and the code under it. */
    @GetMapping("/visits/{visitId}/pass")
    public VisitPassResponse pass(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID visitId) {
        return visitDayService.pass(user.userId(), visitId);
    }

    /** Where a visit may be moved to right now, for whoever is asking. */
    @GetMapping("/visits/{visitId}/move-options")
    public VisitMoveOptionsResponse moveOptions(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable UUID visitId) {
        return leadVisitService.moveOptions(user.userId(), visitId);
    }

    /**
     * Marks attendance with the scanned pass or its code. No version: see
     * {@link VisitDayService#checkIn}.
     */
    @PostMapping("/visits/{visitId}/check-in")
    public VisitCardResponse checkIn(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID visitId,
            @Valid @RequestBody CheckInVisitRequest request) {
        return visitDayService.checkIn(user.userId(), visitId, request);
    }

    /** The owner marks a visitor nobody scanned, after the slot and before midnight. */
    @PostMapping("/visits/{visitId}/missed-check-in")
    public VisitCardResponse missedCheckIn(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID visitId) {
        return visitDayService.missedCheckIn(user.userId(), visitId);
    }

    /** The visit form, from whoever checked them in or the owner. Saved again, it is replaced. */
    @PutMapping("/visits/{visitId}/form")
    public VisitCardResponse completeForm(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID visitId,
            @Valid @RequestBody VisitFormRequest request) {
        return visitDayService.completeForm(user.userId(), visitId, request);
    }

    /** The visitor says they are running late, past half their slot. The property is told once. */
    @PostMapping("/visits/{visitId}/running-late")
    public ResponseEntity<Void> runningLate(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID visitId) {
        visitDayService.runningLate(user.userId(), visitId);
        return ResponseEntity.noContent().build();
    }

    /** The visitor of a No visit says they are no longer interested: the enquiry expires. */
    @PostMapping("/visits/{visitId}/not-interested")
    public ResponseEntity<Void> notInterested(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID visitId) {
        visitDayService.notInterested(user.userId(), visitId);
        return ResponseEntity.noContent().build();
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

    /**
     * The dates and slots open for a visit, from tomorrow to 30 days ahead, with
     * the places left. Given the enquiry it is for, only those before that
     * enquiry ends (user, 2026-10-07).
     */
    @GetMapping("/properties/{propertyId}/visit-availability")
    public VisitAvailabilityResponse availability(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) UUID enquiryId) {
        return enquiryId == null
                ? leadVisitService.availability(propertyId)
                : leadVisitService.availabilityForEnquiry(user.userId(), propertyId, enquiryId);
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
