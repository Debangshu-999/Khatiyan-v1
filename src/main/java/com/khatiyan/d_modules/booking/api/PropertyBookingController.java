package com.khatiyan.d_modules.booking.api;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

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
import com.khatiyan.c_shared.http.ClientIpResolver;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.booking.api.dto.BookingBedOptionResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingCashCodeResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingCommands;
import com.khatiyan.d_modules.booking.api.dto.BookingConversionResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingConvertibleResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestCountsResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestListItemResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.ConvertBookingRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.service.BookingConversionService;
import com.khatiyan.d_modules.booking.service.BookingNegotiationService;
import com.khatiyan.d_modules.booking.service.BookingRequestService;
import com.khatiyan.d_modules.booking.service.BookingTokenService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

/**
 * A property's booking requests, for its owner and the managers on its
 * bookings access list.
 *
 * <p>Who may do what is settled in the services, never here. The owner and
 * the managers on the access list may read. The owner and a booking's
 * handler may answer it, record its token and close a no-show. Only the owner
 * waives a token. Converting a booking on arrival is onboarding, so it is for
 * anyone who may onboard tenants at the property, on the access list or not.
 *
 * <p>Reading takes nothing. A manager becomes a request's handler only
 * through {@code open}, called when a person opens its details, never when a
 * list loads or a badge counts.
 *
 * <p>A step that changes a booking the screen has loaded carries the version
 * it loaded, as {@code If-Match}.
 */
@RestController
@RequestMapping("/api/v1/properties/{propertyId}/booking-requests")
public class PropertyBookingController {

    private final BookingRequestService bookings;
    private final BookingNegotiationService negotiation;
    private final BookingTokenService tokens;
    private final BookingConversionService conversion;
    private final ClientIpResolver clientIpResolver;

    public PropertyBookingController(BookingRequestService bookings, BookingNegotiationService negotiation,
            BookingTokenService tokens, BookingConversionService conversion, ClientIpResolver clientIpResolver) {
        this.bookings = bookings;
        this.negotiation = negotiation;
        this.tokens = tokens;
        this.conversion = conversion;
        this.clientIpResolver = clientIpResolver;
    }

    // ---- Reading -------------------------------------------------------------

    @GetMapping
    public PageResponse<BookingRequestListItemResponse> page(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(defaultValue = "OPEN") BookingListFilter filter,
            @RequestParam(required = false) BookingStatus status,
            @RequestParam(defaultValue = "false") boolean mine,
            @RequestParam(defaultValue = "false") boolean unassigned,
            @RequestParam(required = false) com.khatiyan.d_modules.booking.api.dto.BookingAttentionFilter attention,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return bookings.pageForProperty(user.userId(), propertyId, filter, status, mine, unassigned, attention, q, page, size);
    }

    @GetMapping("/counts")
    public BookingRequestCountsResponse counts(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return bookings.countsForProperty(user.userId(), propertyId);
    }

    @GetMapping("/{requestId}")
    public BookingRequestResponse one(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId) {
        return bookings.forProperty(user.userId(), propertyId, requestId);
    }

    /** A person opened the details. Where the first to open handles a request, a manager takes it here. */
    @PostMapping("/{requestId}/open")
    public BookingRequestResponse open(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId) {
        return bookings.open(user.userId(), propertyId, requestId);
    }

    // ---- Answering -----------------------------------------------------------

    @PostMapping("/{requestId}/accept")
    @RequiresVersion
    public BookingRequestResponse accept(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId,
            @Valid @RequestBody BookingCommands.AcceptOffer body) {
        return negotiation.acceptForProperty(user.userId(), propertyId, requestId, body.offerSequence());
    }

    /** Confirms agreed terms after the token has been received. Owner or assigned handler only. */
    @PostMapping("/{requestId}/confirm")
    @RequiresVersion
    public BookingRequestResponse confirm(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId) {
        return negotiation.confirmForProperty(user.userId(), propertyId, requestId);
    }

    /** A counter the tenant may answer, or the property's final offer. */
    @PostMapping("/{requestId}/offer")
    @RequiresVersion
    public BookingRequestResponse offer(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId,
            @Valid @RequestBody BookingCommands.PropertyOffer body) {
        return negotiation.offer(user.userId(), propertyId, requestId, body.offerSequence(), body.rentPaise(),
                body.mayBeCountered());
    }

    /** Declines a request or cancels a booking, with the reason the tenant is shown. */
    @PostMapping("/{requestId}/cancel")
    @RequiresVersion
    public BookingRequestResponse cancel(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId,
            @Valid @RequestBody BookingCommands.CancelByProperty body) {
        return negotiation.cancelForProperty(user.userId(), propertyId, requestId, body.reason());
    }

    // ---- The token -----------------------------------------------------------

    /** Sends the tenant the code to read out as they hand over cash, where the property asks for one. */
    @PostMapping("/{requestId}/token/cash-code")
    @RequiresVersion
    public BookingCashCodeResponse sendCashCode(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId,
            HttpServletRequest servletRequest) {
        return tokens.sendCashCode(user.userId(), propertyId, requestId, clientIpResolver.resolve(servletRequest));
    }

    /** "Token received." Records a receipt and answers a waiting claim; does not confirm the booking. */
    @PostMapping("/{requestId}/token/received")
    @RequiresVersion
    public BookingRequestResponse tokenReceived(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId,
            @Valid @RequestBody BookingCommands.RecordToken body) {
        return tokens.markReceived(user.userId(), propertyId, requestId, body.method(), body.reference(),
                body.cashCode());
    }

    @PostMapping("/{requestId}/token/not-received")
    @RequiresVersion
    public BookingRequestResponse tokenNotReceived(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId,
            @Valid @RequestBody BookingCommands.TokenNotReceived body) {
        return tokens.markNotReceived(user.userId(), propertyId, requestId, body.reason());
    }

    /** The owner holds the bed without a token after all. Owner only. */
    @PostMapping("/{requestId}/token/waive")
    @RequiresVersion
    public BookingRequestResponse waiveToken(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId) {
        return tokens.waive(user.userId(), propertyId, requestId);
    }

    /** A no-show's token, refunded: recorded as refundable, owed back (user, 2026-10-28). */
    @PostMapping("/{requestId}/token/refund")
    @RequiresVersion
    public BookingRequestResponse refundToken(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId) {
        return tokens.decideToken(user.userId(), propertyId, requestId, true);
    }

    /** A no-show's token, kept: non refundable, the property's income (user, 2026-10-28). */
    @PostMapping("/{requestId}/token/keep")
    @RequiresVersion
    public BookingRequestResponse keepToken(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId) {
        return tokens.decideToken(user.userId(), propertyId, requestId, false);
    }

    // ---- Around the move-in day ----------------------------------------------

    /**
     * The booking a phone number has here, for the onboarding screen to offer
     * "Convert the booking". No content when there is none.
     */
    @GetMapping("/convertible")
    public ResponseEntity<BookingConvertibleResponse> convertible(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam String phone) {
        Optional<BookingConvertibleResponse> found = conversion.convertibleFor(user.userId(), propertyId, phone);
        return found.map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    /**
     * The tenant has arrived. Onboards them into the bed they booked, at the
     * terms that were agreed. The body carries only what is taken in person:
     * the ID check or a verification order, and the tenant's address.
     */
    @PostMapping("/{requestId}/convert")
    @RequiresVersion
    public BookingConversionResponse convert(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId,
            @Valid @RequestBody ConvertBookingRequest body,
            HttpServletRequest servletRequest) {
        return conversion.convert(user.userId(), propertyId, requestId, body,
                clientIpResolver.resolve(servletRequest), user.sessionId());
    }

    /** Where the handler moves a booking whose bed is still occupied. */
    public record MoveBedRequest(UUID roomId) {
    }

    /**
     * Nobody came (user, 2026-10-27). From the day after the move-in date, bed
     * free or not. A token received waits on the handler's decision, made
     * from its record (2026-10-28).
     */
    @PostMapping("/{requestId}/did-not-arrive")
    @RequiresVersion
    public BookingRequestResponse didNotArrive(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId) {
        return conversion.closeAsDidNotArrive(user.userId(), propertyId, requestId);
    }

    /** The booked bed is still occupied: the handler moves the booking to a free one now (user, 2026-10-27). */
    @PostMapping("/{requestId}/move-bed")
    @RequiresVersion
    public BookingRequestResponse moveBed(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId,
            @org.springframework.web.bind.annotation.RequestBody MoveBedRequest body) {
        return conversion.moveToAnotherBed(user.userId(), propertyId, requestId, body == null ? null : body.roomId());
    }

    /**
     * Rooms with a bed free today, for the person about to offer another bed.
     * For the owner or the booking's handler. It needs no rooms access.
     */
    @GetMapping("/{requestId}/bed-offer/options")
    public List<BookingBedOptionResponse> anotherBedOptions(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId) {
        return bookings.anotherBedOptions(user.userId(), propertyId, requestId);
    }

    /** Offers another bed in place of one still occupied after the property's extra days. */
    @PostMapping("/{requestId}/bed-offer")
    @RequiresVersion
    public BookingRequestResponse offerAnotherBed(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID requestId,
            @Valid @RequestBody BookingCommands.OfferAnotherBed body) {
        return conversion.offerAnotherBed(user.userId(), propertyId, requestId, body.roomId(),
                body.monthlyRentPaise());
    }
}
