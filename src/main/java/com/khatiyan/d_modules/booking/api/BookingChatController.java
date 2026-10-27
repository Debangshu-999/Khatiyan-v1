package com.khatiyan.d_modules.booking.api;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.booking.service.BookingChatService;

/**
 * Opens the chat about a booking made in the app (user, 2026-10-27), from
 * either side. Returns the thread to open. The chat itself is the chat
 * module's, under its Bookings section.
 */
@RestController
@RequestMapping("/api/v1")
public class BookingChatController {

    /** The conversation to open. */
    public record BookingChatResponse(UUID threadId) {
    }

    private final BookingChatService chats;

    public BookingChatController(BookingChatService chats) {
        this.chats = chats;
    }

    /** Whoever handles the booking, or the owner while nobody does. */
    @PostMapping("/properties/{propertyId}/booking-requests/{requestId}/chat")
    public BookingChatResponse openForProperty(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable UUID propertyId, @PathVariable UUID requestId) {
        return new BookingChatResponse(chats.openForProperty(user.userId(), propertyId, requestId));
    }

    /** The person who booked. */
    @PostMapping("/booking-requests/{requestId}/chat")
    public BookingChatResponse openForBooker(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable UUID requestId) {
        return new BookingChatResponse(chats.openForBooker(user.userId(), requestId));
    }
}
