package com.khatiyan.d_modules.booking.api;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.concurrency.RequiresVersion;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.booking.api.dto.BookingCommands;
import com.khatiyan.d_modules.booking.api.dto.BookingFormOptionsResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestListItemResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingTokenPayDetailsResponse;
import com.khatiyan.d_modules.booking.api.dto.CreateBookingRequest;
import com.khatiyan.d_modules.booking.service.BookingConversionService;
import com.khatiyan.d_modules.booking.service.BookingNegotiationService;
import com.khatiyan.d_modules.booking.service.BookingRequestService;
import com.khatiyan.d_modules.booking.service.BookingTokenService;

import jakarta.validation.Valid;

/**
 * A person's own booking requests: sending one after an attended visit,
 * answering the property's offers, saying the token is paid, and what they
 * may do around the move-in day.
 *
 * <p>Every route acts on the signed-in person's own bookings. Somebody else's
 * reads as not found. What a person may do next is in each answer
 * ({@code allowedActions}, {@code allowedTokenActions},
 * {@code allowedMoveInActions}), so a screen shows a button for each and
 * decides nothing itself.
 *
 * <p>A step that changes a booking the screen has loaded carries the version
 * it loaded, as {@code If-Match}. One built on an older version is refused
 * and the screen refreshes.
 */
@RestController
@RequestMapping("/api/v1/booking-requests")
public class BookingRequestController {

    private final BookingRequestService bookings;
    private final BookingNegotiationService negotiation;
    private final BookingTokenService tokens;
    private final BookingConversionService conversion;

    public BookingRequestController(BookingRequestService bookings, BookingNegotiationService negotiation,
            BookingTokenService tokens, BookingConversionService conversion) {
        this.bookings = bookings;
        this.negotiation = negotiation;
        this.tokens = tokens;
        this.conversion = conversion;
    }

    // ---- Asking --------------------------------------------------------------

    /** What the booking form shows for one of the person's attended visits. Reading it holds nothing. */
    @GetMapping("/options")
    public BookingFormOptionsResponse options(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam UUID enquiryId) {
        return bookings.formOptions(user.userId(), enquiryId);
    }

    /** Sends a request. The bed is held from here. The same idempotency key sent twice makes one request. */
    @PostMapping
    public ResponseEntity<BookingRequestResponse> create(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreateBookingRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(bookings.create(user.userId(), request));
    }

    @GetMapping
    public PageResponse<BookingRequestListItemResponse> mine(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return bookings.pageForTenant(user.userId(), page, size);
    }

    @GetMapping("/{requestId}")
    public BookingRequestResponse one(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId) {
        return bookings.forTenant(user.userId(), requestId);
    }

    // ---- Answering -----------------------------------------------------------

    @PostMapping("/{requestId}/accept")
    @RequiresVersion
    public BookingRequestResponse accept(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody BookingCommands.AcceptOffer body) {
        return negotiation.accept(user.userId(), requestId, body.offerSequence());
    }

    @PostMapping("/{requestId}/counter")
    @RequiresVersion
    public BookingRequestResponse counter(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody BookingCommands.CounterOffer body) {
        return negotiation.counter(user.userId(), requestId, body.offerSequence(), body.rentPaise());
    }

    /** Withdraws a request or cancels a booking, until a stay has been created from it. */
    @PostMapping("/{requestId}/cancel")
    @RequiresVersion
    public BookingRequestResponse cancel(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody(required = false) BookingCommands.CancelByTenant body) {
        return negotiation.cancel(user.userId(), requestId, body == null ? null : body.reason());
    }

    // ---- The token -----------------------------------------------------------

    /** Where and how much to pay. Only once terms are agreed, and only while the token is owed. */
    @GetMapping("/{requestId}/token/pay-details")
    public BookingTokenPayDetailsResponse payDetails(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId) {
        return tokens.payDetails(user.userId(), requestId);
    }

    /** "I've paid." The bed stops being at risk from the clock until the property answers. */
    @PostMapping("/{requestId}/token/claim")
    @RequiresVersion
    public BookingRequestResponse claimPaid(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody BookingCommands.ClaimToken body) {
        return tokens.claimPaid(user.userId(), requestId, body.method(), Boolean.TRUE.equals(body.paidAtDesk()),
                body.reference(), body.proofImageUrls());
    }

    // ---- Around the move-in day ----------------------------------------------

    /** The one date push: to a later day, by seven days at most, until the end of the day before move-in. */
    @PostMapping("/{requestId}/move-in-date")
    @RequiresVersion
    public BookingRequestResponse pushMoveInDate(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody BookingCommands.PushMoveInDate body) {
        return conversion.pushMoveInDate(user.userId(), requestId, body.moveInDate());
    }

    /** Takes the other bed the property offered, because the booked one is still occupied. */
    @PostMapping("/{requestId}/bed-offer/accept")
    @RequiresVersion
    public BookingRequestResponse acceptAnotherBed(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId) {
        return conversion.acceptAnotherBed(user.userId(), requestId);
    }

    @PostMapping("/{requestId}/bed-offer/decline")
    @RequiresVersion
    public BookingRequestResponse declineAnotherBed(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId) {
        return conversion.declineAnotherBed(user.userId(), requestId);
    }

    /** Leaves because the bed is still not ready after the property's extra days. The token is owed back. */
    @PostMapping("/{requestId}/leave")
    @RequiresVersion
    public BookingRequestResponse leaveBecauseBedNotReady(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId) {
        return conversion.leaveBecauseBedNotReady(user.userId(), requestId);
    }
}
