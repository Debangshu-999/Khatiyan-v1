package com.khatiyan.d_modules.booking.listener;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.booking.event.BookingChangedEvent;
import com.khatiyan.d_modules.booking.service.BookingChatService;

/**
 * Keeps a booking's chat in step with the booking (user, 2026-10-27): every
 * change, a new handler included, is announced as a {@link BookingChangedEvent}.
 * After commit and at least once, which is fine: the sync reads the booking as
 * it is now.
 */
@Component
public class BookingChatListener {

    private final BookingChatService chats;

    public BookingChatListener(BookingChatService chats) {
        this.chats = chats;
    }

    @ApplicationModuleListener
    public void onChanged(BookingChangedEvent event) {
        chats.sync(event.requestId());
    }
}
