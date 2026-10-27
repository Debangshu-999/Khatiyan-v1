package com.khatiyan.d_modules.booking.api;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.booking.api.dto.BookingTokenLedgerResponse;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.booking.service.BookingTokenService;

/**
 * A property's booking tokens: every one it has received, and what became of
 * each. For the owner and the managers on the bookings access list.
 *
 * <p>Read only. A token is acted on through its booking's own endpoints, never
 * from here. The list says which rows the reader may act on.
 */
@RestController
@RequestMapping("/api/v1/properties/{propertyId}/booking-tokens")
public class BookingTokenController {

    private final BookingTokenService tokens;

    public BookingTokenController(BookingTokenService tokens) {
        this.tokens = tokens;
    }

    @GetMapping
    public BookingTokenLedgerResponse ledger(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) BookingTokenStatus status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return tokens.ledgerForProperty(user.userId(), propertyId, status, q, page, size);
    }
}
