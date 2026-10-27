package com.khatiyan.d_modules.booking.service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.d_modules.booking.event.BookingChangedEvent;
import com.khatiyan.d_modules.booking.event.BookingTenantToldEvent;
import com.khatiyan.d_modules.booking.model.BookingNotice;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingToken;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.booking.repository.BookingNoticeRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;
import com.khatiyan.d_modules.booking.repository.BookingTokenRepository;
import com.khatiyan.d_modules.mail.MailContent;
import com.khatiyan.d_modules.mail.MailModule;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Tells the tenant about their own booking (user, 2026-10-18): a push, an
 * in-app notice, and a mail when they have a verified email. Confirmed, the
 * date moved, move-in tomorrow, cancelled, expired, and the bed not free on
 * the day. Nothing for offers, agreed terms or the token (user's choice).
 *
 * <p>Each telling is written to {@code booking.notices} first, so it is said
 * once however many times a booking event arrives, and the mail's own key
 * keeps the mail to one as well.
 */
@Slf4j
@Service
public class BookingTenantNotices {

    /** The move-in reminder goes at this hour the day before, in India. */
    static final LocalTime MOVE_IN_REMINDER_AT = LocalTime.of(10, 0);

    private final BookingRequestRepository requests;
    private final BookingNoticeRepository notices;
    private final BookingTokenRepository tokens;
    private final PropertyModule propertyModule;
    private final MailModule mailModule;
    private final ApplicationEventPublisher events;
    private final RecordByRecord recordByRecord;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public BookingTenantNotices(BookingRequestRepository requests, BookingNoticeRepository notices,
            BookingTokenRepository tokens, PropertyModule propertyModule, MailModule mailModule,
            ApplicationEventPublisher events, RecordByRecord recordByRecord, JdbcTemplate jdbc, Clock clock) {
        this.requests = requests;
        this.notices = notices;
        this.tokens = tokens;
        this.propertyModule = propertyModule;
        this.mailModule = mailModule;
        this.events = events;
        this.recordByRecord = recordByRecord;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** After every booking change commits. Reads the booking as it stands now. */
    @ApplicationModuleListener
    public void onBookingChanged(BookingChangedEvent event) {
        changed(event.requestId());
    }

    /** Whatever this booking's state now calls for, less what has been said already. */
    @Transactional
    public void changed(UUID requestId) {
        BookingRequest booking = requests.findById(requestId).orElse(null);
        if (booking == null) {
            return;
        }
        Instant now = clock.instant();
        BookingStatus status = booking.statusAt(now);
        String address = addressOf(booking.getPropertyId());
        boolean tokenReceived = tokenReceived(booking.getId());
        switch (status) {
            case CONFIRMED -> {
                tell(booking, BookingNotice.Kind.TENANT_CONFIRMED, "", "CONFIRMED", "Booking confirmed",
                        booking.getPropertyName() + " confirmed your booking. You move in on "
                                + BookingMails.day(booking.getMoveInDate()) + ".",
                        BookingMails.confirmed(booking, address, tokenReceived));
                if (booking.getMoveInPushedAt() != null) {
                    tell(booking, BookingNotice.Kind.TENANT_DATE_MOVED, "", "DATE_MOVED", "Move-in date moved",
                            "Your move-in at " + booking.getPropertyName() + " is now "
                                    + BookingMails.day(booking.getMoveInDate()) + ".",
                            BookingMails.dateMoved(booking, address));
                }
            }
            case CANCELLED -> tell(booking, BookingNotice.Kind.TENANT_CANCELLED, "", "CANCELLED", "Booking cancelled",
                    cancelledLine(booking), BookingMails.cancelled(booking, address, tokenStatus(booking.getId())));
            case EXPIRED -> tell(booking, BookingNotice.Kind.TENANT_EXPIRED, "", "EXPIRED", "Booking request expired",
                    "Your booking request at " + booking.getPropertyName() + " expired.",
                    BookingMails.expired(booking, address));
            // The property's offer is waiting on the tenant: one notice per offer.
            case AWAITING_TENANT -> {
                if (booking.getCurrentOfferBy() == com.khatiyan.d_modules.booking.model.BookingParty.MANAGEMENT) {
                    tell(booking, BookingNotice.Kind.TENANT_OFFER, String.valueOf(booking.getCurrentOfferSequence()),
                            "OFFER_RECEIVED", "New offer",
                            booking.getPropertyName() + " offered " + BookingMails.rupees(booking.getCurrentRentPaise())
                                    + " a month for Room " + booking.getRoomNumber() + ". Accept or reply by "
                                    + BookingMails.dayTime(booking.getExpiresAt()) + ".",
                            null);
                }
            }
            case AWAITING_TOKEN -> tell(booking, BookingNotice.Kind.TENANT_TERMS_AGREED, "", "TERMS_AGREED", "Rent agreed",
                    "You and " + booking.getPropertyName() + " agreed " + BookingMails.rupees(rentOf(booking))
                            + " a month. Pay the token of " + BookingMails.rupees(tokenDue(booking)) + " by "
                            + BookingMails.dayTime(booking.getTokenDueAt()) + " to confirm the booking.",
                    null);
            default -> {
                // Waiting on the property, the token claimed, moved in: nothing to tell the tenant here.
            }
        }
    }

    @Scheduled(cron = "0 0 10 * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "booking-move-in-reminders", lockAtMostFor = "PT10M", lockAtLeastFor = "PT30S")
    public void remindMoveIns() {
        int told = remindMoveInsDue();
        if (told > 0) {
            log.info("Move-in reminders sent {}", told);
        }
    }

    /** Confirmed bookings moving in tomorrow, each in its own transaction. Safe to run again. */
    public int remindMoveInsDue() {
        LocalDate tomorrow = LocalDate.now(clock.withZone(BookingPolicy.ZONE)).plusDays(1);
        return recordByRecord.run("booking-move-in-reminder", requests.findIdsDueToMoveIn(tomorrow, tomorrow),
                id -> id, id -> remindMoveIn(id, tomorrow));
    }

    @Transactional
    public boolean remindMoveIn(UUID requestId, LocalDate moveInDate) {
        BookingRequest booking = requests.findById(requestId).orElse(null);
        if (booking == null || booking.statusAt(clock.instant()) != BookingStatus.CONFIRMED || booking.isConverted()
                || !moveInDate.equals(booking.getMoveInDate())) {
            return false;
        }
        return tell(booking, BookingNotice.Kind.TENANT_MOVE_IN_TOMORROW, "", "MOVE_IN_TOMORROW", "You move in tomorrow",
                "Your move-in day at " + booking.getPropertyName() + " is tomorrow, "
                        + BookingMails.day(booking.getMoveInDate()) + ".",
                BookingMails.moveInTomorrow(booking, addressOf(booking.getPropertyId()), tokenReceived(booking.getId())));
    }

    /**
     * The move-in day came and the bed is not free. Once, on the first such
     * day. Called inside the property's bed notice, in its transaction.
     */
    void bedNotReady(BookingRequest booking) {
        tell(booking, BookingNotice.Kind.TENANT_BED_NOT_READY, "", "BED_NOT_READY", "Your bed is not free yet",
                "The bed in Room " + booking.getRoomNumber() + " at " + booking.getPropertyName()
                        + " is still occupied. The property has been asked to free it.",
                BookingMails.bedNotReady(booking, addressOf(booking.getPropertyId())));
    }

    /**
     * Tells the tenant once: a push and an in-app notice, and the mail when
     * there is one.
     *
     * @param subject which thing of this kind it is about ("" when the kind needs
     *                none): an offer's sequence, so each offer is told once
     * @return false when it was said before
     */
    boolean tell(BookingRequest booking, BookingNotice.Kind kind, String subject, String eventKind, String title,
            String body, MailContent mail) {
        // Someone who booked outside the app has no app, and is told nothing (2026-10-19).
        if (booking.getProspectUserId() == null || !claim(booking, kind, subject, subject.isEmpty())) {
            return false;
        }
        events.publishEvent(new BookingTenantToldEvent(booking.getId(), booking.getProspectUserId(), eventKind, title,
                body, dataFor(booking)));
        if (mail != null) {
            mailModule.queue(booking.getProspectUserId(), "BOOKING_" + eventKind,
                    "booking-" + eventKind.toLowerCase(java.util.Locale.ROOT) + ":" + booking.getId(), mail);
        }
        log.info("Tenant told about booking requestId={} reference={} kind={} subject={}",
                booking.getId(), booking.getReferenceCode(), kind, subject);
        return true;
    }

    /**
     * Reminds the property once a day at most for this kind and subject: the
     * request's handler, or the owner and everyone with booking access while
     * nobody handles it.
     *
     * @return false when it was said before
     */
    boolean tellProperty(BookingRequest booking, BookingNotice.Kind kind, String subject, String eventKind,
            java.util.List<UUID> recipients, String title, String body) {
        if (recipients.isEmpty() || !claim(booking, kind, subject, false)) {
            return false;
        }
        events.publishEvent(new com.khatiyan.d_modules.booking.event.BookingPropertyToldEvent(
                booking.getId(), java.util.List.copyOf(recipients), eventKind, title, body, dataFor(booking)));
        log.info("Property reminded about booking requestId={} reference={} kind={} subject={} recipients={}",
                booking.getId(), booking.getReferenceCode(), kind, subject, recipients.size());
        return true;
    }

    /**
     * Writes the telling's row. Claimed by one only: two deliveries handled at
     * the same moment both pass the check, and the unique key lets one of them
     * write the row. The other gives way quietly here.
     *
     * @param onceEver a kind said once in a booking's life, whatever the day,
     *                 rather than once a day
     */
    private boolean claim(BookingRequest booking, BookingNotice.Kind kind, String subject, boolean onceEver) {
        if (onceEver && notices.existsByRequestIdAndKind(booking.getId(), kind)) {
            return false;
        }
        if (!onceEver && !subject.isEmpty() && jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM booking.notices WHERE request_id = ? AND kind = ? AND subject_key = ?)",
                Boolean.class, booking.getId(), kind.name(), subject)) {
            return false;
        }
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        return jdbc.update("""
                INSERT INTO booking.notices (id, request_id, kind, notice_date, subject_key, sent_at, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
                ON CONFLICT ON CONSTRAINT uq_booking_notices DO NOTHING
                """, UUID.randomUUID(), booking.getId(), kind.name(),
                LocalDate.now(clock.withZone(BookingPolicy.ZONE)), subject, Timestamp.from(now), Timestamp.from(now),
                Timestamp.from(now)) == 1;
    }

    private static String cancelledLine(BookingRequest booking) {
        return booking.getCancelledBy() == com.khatiyan.d_modules.booking.model.BookingParty.TENANT
                ? "You cancelled your booking at " + booking.getPropertyName() + "."
                : "Your booking at " + booking.getPropertyName() + " was cancelled.";
    }

    private static Map<String, String> dataFor(BookingRequest booking) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("bookingRequestId", booking.getId().toString());
        data.put("bookingReferenceCode", booking.getReferenceCode());
        data.put("propertyId", booking.getPropertyId().toString());
        data.put("propertyName", booking.getPropertyName());
        data.put("roomNumber", booking.getRoomNumber());
        if (booking.getMoveInDate() != null) {
            data.put("moveInDate", booking.getMoveInDate().toString());
        }
        if (booking.getOriginalMoveInDate() != null && booking.getMoveInPushedAt() != null) {
            data.put("originalMoveInDate", booking.getOriginalMoveInDate().toString());
        }
        return data;
    }

    private static long rentOf(BookingRequest booking) {
        return booking.getAgreedRentPaise() != null ? booking.getAgreedRentPaise() : booking.getCurrentRentPaise();
    }

    private static long tokenDue(BookingRequest booking) {
        return booking.getTokenDuePaise() != null ? booking.getTokenDuePaise() : booking.getTokenAmountPaise();
    }

    private boolean tokenReceived(UUID requestId) {
        BookingTokenStatus status = tokenStatus(requestId);
        return status == BookingTokenStatus.RECEIVED || status == BookingTokenStatus.ADJUSTED;
    }

    private BookingTokenStatus tokenStatus(UUID requestId) {
        return tokens.findByRequestId(requestId).map(BookingToken::getStatus).orElse(null);
    }

    /** "12 Lake Road, Salt Lake, Kolkata", or nothing when the property is gone. */
    private String addressOf(UUID propertyId) {
        try {
            PropertyResponse property = propertyModule.getActiveProperty(propertyId);
            return Stream.of(property.address(), property.area(), property.city())
                    .filter(part -> part != null && !part.isBlank())
                    .map(String::trim)
                    .distinct()
                    .collect(Collectors.joining(", "));
        } catch (RuntimeException gone) {
            return null;
        }
    }
}
