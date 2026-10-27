package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.booking.event.BookedBedNotFreeEvent;
import com.khatiyan.d_modules.booking.model.BookingNotice;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.repository.BookingNoticeRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Tells the property that a booked bed must be freed for a booking to start
 * (user's rule, 2026-10-10).
 *
 * <p>It is about the booking, not the stay in the way: a stay past its
 * checkout date already has a notification of its own. This one says which
 * booking is waiting on the bed, and that today is the day.
 *
 * <p>Once a day per booking, on the move-in day and the three after it, which
 * are the days the property has before the tenant may choose to leave. It
 * stops the moment the bed is free, the booking is converted, or it ends.
 */
@Slf4j
@Service
public class BookingBedNoticeService {

    private final BookingRequestRepository requests;
    private final BookingNoticeRepository notices;
    private final BookingInventoryService inventory;
    private final BookingHandlerService handlers;
    private final ApplicationEventPublisher events;
    private final BookingTenantNotices tenantNotices;
    private final Clock clock;

    public BookingBedNoticeService(BookingRequestRepository requests, BookingNoticeRepository notices,
            BookingInventoryService inventory, BookingHandlerService handlers, ApplicationEventPublisher events,
            BookingTenantNotices tenantNotices, Clock clock) {
        this.requests = requests;
        this.notices = notices;
        this.inventory = inventory;
        this.handlers = handlers;
        this.events = events;
        this.tenantNotices = tenantNotices;
        this.clock = clock;
    }

    /** Bookings whose move-in day is today or one of the three days before it, and that no stay has come from. */
    @Transactional(readOnly = true)
    public List<UUID> dueOn(LocalDate today) {
        return requests.findIdsDueToMoveIn(today.minusDays(BookingPolicy.BED_NOT_READY_EXTRA_DAYS), today);
    }

    /**
     * One booking, in its own transaction. Says it only where the bed is still
     * occupied and it has not been said today.
     *
     * @return true when the property was told now
     */
    @Transactional
    public boolean noticeIfBedNotFree(UUID requestId, LocalDate today) {
        BookingRequest request = requests.findById(requestId).orElse(null);
        if (request == null || request.getStatus() != BookingStatus.CONFIRMED || request.isConverted()
                || today.isBefore(request.getMoveInDate())
                || inventory.bedReady(request.getId(), request.getPropertyId())
                || notices.existsByRequestIdAndKindAndNoticeDate(
                        request.getId(), BookingNotice.Kind.BED_NOT_FREE, today)) {
            return false;
        }
        // Written first: the unique key is what stops two runs both saying it.
        notices.saveAndFlush(BookingNotice.of(request.getId(), BookingNotice.Kind.BED_NOT_FREE, today,
                clock.instant().truncatedTo(ChronoUnit.MICROS)));

        BookingHandlerService.Team team = handlers.teamOf(request.getPropertyId());
        List<UUID> recipients = new ArrayList<>(team.managersWithGrant());
        if (!recipients.contains(team.ownerUserId())) {
            recipients.add(team.ownerUserId());
        }
        events.publishEvent(new BookedBedNotFreeEvent(request.getId(), request.getReferenceCode(),
                request.getPropertyId(), request.getRoomId(), request.getRoomNumber(), request.getTenantName(),
                request.getMoveInDate(), today, List.copyOf(recipients)));
        // The tenant hears once, on the first day (2026-10-18).
        if (today.equals(request.getMoveInDate())) {
            tenantNotices.bedNotReady(request);
        }
        log.info("Booked bed not free, property told requestId={} reference={} moveInDate={} day={} recipients={}",
                request.getId(), request.getReferenceCode(), request.getMoveInDate(), today, recipients.size());
        return true;
    }
}
