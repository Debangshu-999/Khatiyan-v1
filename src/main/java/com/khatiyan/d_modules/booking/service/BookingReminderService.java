package com.khatiyan.d_modules.booking.service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.d_modules.booking.model.BookingNotice;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingToken;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;
import com.khatiyan.d_modules.booking.repository.BookingTokenRepository;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * The bookings plan's reminders (chunk 7, built 2026-10-19). A request holds a
 * bed, so one forgotten by either side locks it for up to seven days and then
 * loses the booking. These keep both sides moving:
 *
 * <ul>
 *   <li>Your turn: the request runs out within a day. Whoever's offer is
 *       waiting hears it, once per offer.</li>
 *   <li>Waiting: the tenant's offer has waited a day for the property's answer,
 *       once per offer.</li>
 *   <li>A token claim waiting a day for the property's answer, once per claim.</li>
 *   <li>The token's time running out within twelve hours, told to the tenant once.</li>
 * </ul>
 *
 * <p>The property side is the request's handler, or the owner and everyone on
 * the booking access list while nobody handles it. Each telling is recorded in
 * {@code booking.notices}, so a sweep that runs twice says nothing twice.
 */
@Slf4j
@Service
public class BookingReminderService {

    static final Duration TURN_REMINDER_BEFORE = Duration.ofHours(24);
    static final Duration WAITING_AFTER = Duration.ofHours(24);
    static final Duration CLAIM_WAITING_AFTER = Duration.ofHours(24);
    static final Duration TOKEN_LAPSING_BEFORE = Duration.ofHours(12);
    /** How long the property has to send a refund owed. */

    private final BookingRequestRepository requests;
    private final BookingTokenRepository tokens;
    private final BookingHandlerService handlers;
    private final BookingTenantNotices notices;
    private final RecordByRecord recordByRecord;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public BookingReminderService(BookingRequestRepository requests, BookingTokenRepository tokens,
            BookingHandlerService handlers, BookingTenantNotices notices, RecordByRecord recordByRecord,
            JdbcTemplate jdbc, Clock clock) {
        this.requests = requests;
        this.tokens = tokens;
        this.handlers = handlers;
        this.notices = notices;
        this.recordByRecord = recordByRecord;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Scheduled(cron = "0 7 * * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "booking-reminders", lockAtMostFor = "PT20M", lockAtLeastFor = "PT30S")
    public void sweep() {
        int told = remindDue();
        if (told > 0) {
            log.info("Booking reminders sent {}", told);
        }
    }

    /** Everything due now, each request in its own transaction. Safe to run again. */
    public int remindDue() {
        Timestamp now = Timestamp.from(clock.instant());
        List<UUID> live = jdbc.queryForList("""
                SELECT id FROM booking.requests
                WHERE status IN ('AWAITING_HANDLER', 'AWAITING_TENANT', 'AWAITING_TOKEN', 'TOKEN_RECEIVED')
                  AND (expires_at IS NULL OR expires_at > ?)
                """, UUID.class, now);
        return recordByRecord.run("booking-reminder", live, id -> id, this::remind);
    }

    /** One request, read again in its own transaction: it may have moved on since the sweep looked. */
    @Transactional
    public boolean remind(UUID requestId) {
        BookingRequest booking = requests.findById(requestId).orElse(null);
        if (booking == null) {
            return false;
        }
        Instant now = clock.instant();
        BookingStatus status = booking.statusAt(now);
        boolean told = false;
        String offer = String.valueOf(booking.getCurrentOfferSequence());

        if (status.isPending() && booking.getExpiresAt() != null
                && !booking.getExpiresAt().isAfter(now.plus(TURN_REMINDER_BEFORE))) {
            String left = BookingMails.dayTime(booking.getExpiresAt());
            if (status == BookingStatus.AWAITING_TENANT) {
                told |= notices.tell(booking, BookingNotice.Kind.TENANT_YOUR_TURN, offer, "YOUR_TURN",
                        "Your booking request runs out soon",
                        booking.getPropertyName() + " is waiting for your answer on Room " + booking.getRoomNumber()
                                + ". Reply by " + left + ", or the request ends and the bed is let go.",
                        null);
            } else {
                told |= notices.tellProperty(booking, BookingNotice.Kind.PROPERTY_YOUR_TURN, offer, "REQUEST_YOUR_TURN",
                        propertySide(booking), "A booking request runs out soon",
                        booking.getTenantName() + "'s request " + booking.getReferenceCode() + " for Room "
                                + booking.getRoomNumber() + " needs your answer by " + left
                                + ", or it ends and the bed is let go.");
            }
        }

        if (status == BookingStatus.AWAITING_HANDLER && waitingSince(booking) != null
                && !waitingSince(booking).isAfter(now.minus(WAITING_AFTER))) {
            told |= notices.tellProperty(booking, BookingNotice.Kind.PROPERTY_WAITING, offer, "REQUEST_WAITING",
                    propertySide(booking), "A booking request is waiting",
                    booking.getTenantName() + "'s request " + booking.getReferenceCode() + " for Room "
                            + booking.getRoomNumber() + " has waited a day for your answer. The bed is held meanwhile.");
        }

        if (status == BookingStatus.AWAITING_TOKEN && booking.getTokenDueAt() != null
                && booking.getTokenDueAt().isAfter(now)
                && !booking.getTokenDueAt().isAfter(now.plus(TOKEN_LAPSING_BEFORE))) {
            told |= notices.tell(booking, BookingNotice.Kind.TENANT_TOKEN_LAPSING, "", "TOKEN_LAPSING",
                    "Token due soon",
                    "Pay the token for Room " + booking.getRoomNumber() + " at " + booking.getPropertyName() + " by "
                            + BookingMails.dayTime(booking.getTokenDueAt())
                            + ", or the booking ends. Already paid? Say so in your booking.",
                    null);
        }

        told |= remindClaim(booking, now);
        return told;
    }

    /** A token claim the property has not answered for a day. */
    private boolean remindClaim(BookingRequest booking, Instant now) {
        List<Object[]> waiting = jdbc.query("""
                SELECT c.sequence, c.claimed_at FROM booking.token_claims c
                JOIN booking.tokens t ON t.id = c.token_id
                WHERE t.request_id = ? AND t.status = 'CLAIMED' AND c.answer IS NULL AND c.claimed_at <= ?
                ORDER BY c.sequence DESC
                LIMIT 1
                """, (rs, row) -> new Object[] { rs.getInt("sequence"), rs.getTimestamp("claimed_at") },
                booking.getId(), Timestamp.from(now.minus(CLAIM_WAITING_AFTER)));
        if (waiting.isEmpty()) {
            return false;
        }
        return notices.tellProperty(booking, BookingNotice.Kind.PROPERTY_CLAIM_WAITING, String.valueOf(waiting.get(0)[0]),
                "TOKEN_CLAIM_WAITING", propertySide(booking), "A token payment to check",
                booking.getTenantName() + " says they paid the token for " + booking.getReferenceCode()
                        + " a day ago. Check and mark it received or not received.");
    }

    /** When the property's turn began: the tenant's latest offer. */
    private Instant waitingSince(BookingRequest booking) {
        if (booking.getCurrentOfferBy() != BookingParty.TENANT) {
            return null;
        }
        List<Timestamp> made = jdbc.queryForList(
                "SELECT made_at FROM booking.offers WHERE request_id = ? AND sequence = ?",
                Timestamp.class, booking.getId(), booking.getCurrentOfferSequence());
        return made.isEmpty() ? booking.getSubmittedAt() : made.get(0).toInstant();
    }

    /** The request's handler, or the owner and the booking access list while nobody handles it. */
    private List<UUID> propertySide(BookingRequest booking) {
        BookingHandlerService.Team team = handlers.teamOf(booking.getPropertyId());
        UUID handler = team.effectiveHandler(booking.getHandlerUserId());
        if (handler != null) {
            return List.of(handler);
        }
        List<UUID> everyone = new ArrayList<>(team.managersWithGrant());
        if (team.ownerUserId() != null && !everyone.contains(team.ownerUserId())) {
            everyone.add(team.ownerUserId());
        }
        return everyone;
    }
}
