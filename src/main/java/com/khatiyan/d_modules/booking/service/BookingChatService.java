package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;
import com.khatiyan.d_modules.chat.ChatModule;

import lombok.extern.slf4j.Slf4j;

/**
 * The chat about a booking made in the app (user, 2026-10-27).
 *
 * <p>A private conversation between the person who booked and whoever is on
 * the property's side: the booking's handler, or the owner while nobody
 * handles it (a handler who lost the bookings grant counts as nobody). When
 * the handler changes, the chat goes with the booking, history and all. Once
 * the booking is cancelled, expired or moved in, the chat is read-only.
 *
 * <p>External bookings have nobody in the app to talk to, so they have no chat.
 */
@Slf4j
@Service
public class BookingChatService {

    private static final Set<BookingStatus> ENDED = Set.of(
            BookingStatus.CANCELLED, BookingStatus.EXPIRED, BookingStatus.MOVED_IN);

    private final BookingRequestRepository requests;
    private final BookingHandlerService handlers;
    private final ChatModule chat;
    private final Clock clock;

    public BookingChatService(BookingRequestRepository requests, BookingHandlerService handlers, ChatModule chat,
            Clock clock) {
        this.requests = requests;
        this.handlers = handlers;
        this.chat = chat;
        this.clock = clock;
    }

    /** The property's side opens it: only whoever is on that side of it. */
    @Transactional
    public UUID openForProperty(UUID actorUserId, UUID propertyId, UUID requestId) {
        BookingRequest request = requests.findById(requestId)
                .filter(found -> found.getPropertyId().equals(propertyId))
                .orElseThrow(() -> new NotFoundException("Booking request", requestId.toString()));
        requireInApp(request);
        UUID side = propertySideOf(request);
        if (!actorUserId.equals(side)) {
            throw new ForbiddenException("Only the person handling this booking can chat about it.");
        }
        return open(request, side);
    }

    /** The person who booked opens it. Not found for anyone else's booking. */
    @Transactional
    public UUID openForBooker(UUID actorUserId, UUID requestId) {
        BookingRequest request = requests.findById(requestId)
                .filter(found -> actorUserId.equals(found.getProspectUserId()))
                .orElseThrow(() -> new NotFoundException("Booking request", requestId.toString()));
        return open(request, propertySideOf(request));
    }

    /**
     * After any change to a booking: the chat, if there is one, follows its
     * handler and its end. At least once and in any order is fine, since it
     * always reads the booking as it is now.
     */
    @Transactional
    public void sync(UUID requestId) {
        requests.findById(requestId)
                .filter(request -> request.getProspectUserId() != null)
                .ifPresent(request -> chat.syncBookingThread(request.getId(), request.getProspectUserId(),
                        propertySideOf(request), ended(request)));
    }

    /** Whether this reader can chat about this booking: the booker, or whoever is on the property's side. */
    public boolean canChat(BookingRequest request, UUID readerUserId, UUID propertySideUserId) {
        return request.getProspectUserId() != null
                && (readerUserId.equals(request.getProspectUserId()) || readerUserId.equals(propertySideUserId));
    }

    /** Whoever answers for the property: the effective handler, or the owner while nobody handles it. */
    public UUID propertySideOf(BookingRequest request) {
        BookingHandlerService.Team team = handlers.teamOf(request.getPropertyId());
        UUID handler = team.effectiveHandler(request.getHandlerUserId());
        return handler != null ? handler : team.ownerUserId();
    }

    private UUID open(BookingRequest request, UUID side) {
        requireInApp(request);
        UUID threadId = chat.openBookingThread(request.getPropertyId(), request.getId(),
                request.getProspectUserId(), side, ended(request));
        log.info("Booking chat opened requestId={} threadId={}", request.getId(), threadId);
        return threadId;
    }

    private void requireInApp(BookingRequest request) {
        if (request.getProspectUserId() == null) {
            throw new ValidationException("This booking was made outside the app, so there is nobody to chat with.");
        }
    }

    private boolean ended(BookingRequest request) {
        Instant now = clock.instant();
        return ENDED.contains(request.statusAt(now));
    }
}
