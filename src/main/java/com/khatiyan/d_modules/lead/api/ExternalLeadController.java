package com.khatiyan.d_modules.lead.api;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.booking.service.BookingExternalService;
import com.khatiyan.d_modules.lead.api.dto.CreateExternalBookingRequest;
import com.khatiyan.d_modules.lead.api.dto.ExternalRecordResponse;
import com.khatiyan.d_modules.lead.api.dto.RecordExternalVisitRequest;
import com.khatiyan.d_modules.lead.service.ExternalLeadService;

import jakarta.validation.Valid;

/**
 * External visits and bookings (2026-10-19): people who reached the property
 * outside the app, recorded by the property, counted as leads.
 */
@RestController
@RequestMapping("/api/v1/properties/{propertyId}")
public class ExternalLeadController {

    private final ExternalLeadService external;

    public ExternalLeadController(ExternalLeadService external) {
        this.external = external;
    }

    @PostMapping("/external-visits")
    @ResponseStatus(HttpStatus.CREATED)
    public ExternalRecordResponse recordVisit(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody RecordExternalVisitRequest request) {
        return external.recordVisit(user.userId(), propertyId, request);
    }

    @GetMapping("/external-bookings/options")
    public BookingExternalService.Options bookingOptions(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return external.bookingOptions(user.userId(), propertyId);
    }

    @PostMapping("/external-bookings")
    @ResponseStatus(HttpStatus.CREATED)
    public ExternalRecordResponse createBooking(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateExternalBookingRequest request) {
        return external.createBooking(user.userId(), propertyId, request);
    }
}
