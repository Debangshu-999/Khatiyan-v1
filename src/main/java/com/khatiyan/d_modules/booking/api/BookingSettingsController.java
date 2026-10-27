package com.khatiyan.d_modules.booking.api;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.concurrency.RequiresVersion;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.booking.api.dto.BookingSettingsResponse;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.service.BookingSettingsService;

import jakarta.validation.Valid;

/**
 * The owner's booking settings for one property: the token, how far ahead a
 * tenant may book, which vacancies they see, and who handles a new request.
 *
 * <p>Owner only, enforced in the service. Which managers may see bookings at
 * all is not set here: that is the ordinary BOOKINGS grant, written from the
 * bookings access list through the manager-permissions endpoints.
 *
 * <p>This is the only booking endpoint so far. Sending and answering requests
 * stay unreachable until both sides can finish what they start.
 */
@RestController
@RequestMapping("/api/v1/properties/{propertyId}/booking-settings")
public class BookingSettingsController {

    private final BookingSettingsService settings;

    public BookingSettingsController(BookingSettingsService settings) {
        this.settings = settings;
    }

    /** What the form opens on. Before the first save it is the defaults, marked not configured. */
    @GetMapping
    public BookingSettingsResponse get(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return settings.forOwner(user.userId(), propertyId);
    }

    /** The first save. From here the property takes booking requests. */
    @PostMapping
    public ResponseEntity<BookingSettingsResponse> create(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody SaveBookingSettingsRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(settings.create(user.userId(), propertyId, request));
    }

    /** A change. Needs the version the screen loaded. Requests already sent keep what they were shown. */
    @PutMapping
    @RequiresVersion
    public BookingSettingsResponse save(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody SaveBookingSettingsRequest request) {
        return settings.save(user.userId(), propertyId, request);
    }
}
