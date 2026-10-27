package com.khatiyan.d_modules.lead.service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.booking.BookingModule;
import com.khatiyan.d_modules.booking.api.dto.BookingSnapshot;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.service.BookingExternalService;
import com.khatiyan.d_modules.enquiry.PostVisitBookingWindow;
import com.khatiyan.d_modules.lead.api.dto.CreateExternalBookingRequest;
import com.khatiyan.d_modules.lead.api.dto.ExternalRecordResponse;
import com.khatiyan.d_modules.lead.api.dto.RecordExternalVisitRequest;
import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadActivity;
import com.khatiyan.d_modules.lead.model.LeadActivityType;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadHandlerSource;
import com.khatiyan.d_modules.lead.model.LeadState;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitImpression;
import com.khatiyan.d_modules.lead.model.VisitInterest;
import com.khatiyan.d_modules.lead.repository.LeadActivityRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository;
import com.khatiyan.d_modules.lead.repository.VisitRepository;
import com.khatiyan.d_modules.property.PropertyModule;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * People who reached a property outside the app become leads (2026-10-19):
 * someone who walked in and saw the place, or booked in person or by phone.
 * Spec: {@code docs/superpowers/specs/2026-10-19-external-visits-and-bookings-design.md}.
 *
 * <p>The person is a record in {@code lead.external_prospects}, one per
 * property and phone, not an account. Their open lead there is joined when
 * there is one, and a new one opened otherwise. Whoever records it handles it.
 *
 * <ul>
 *   <li>An external visit is a strong lead, as an attended app visit is.
 *       "Interested? No" closes it as not interested.</li>
 *   <li>An external booking is Booked, through the booking module, in the same
 *       transaction. Its later changes come back through {@link #syncFromBooking}.</li>
 *   <li>A strong external lead with nothing booked closes 30 days after its
 *       visit, the same window an app visit gives.</li>
 * </ul>
 */
@Slf4j
@Service
public class ExternalLeadService {

    private final LeadRepository leads;
    private final VisitRepository visits;
    private final LeadActivityRepository activities;
    private final BookingModule bookingModule;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final ReferenceCodeGenerator referenceCodes;
    private final RecordByRecord recordByRecord;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public ExternalLeadService(LeadRepository leads, VisitRepository visits, LeadActivityRepository activities,
            BookingModule bookingModule, PropertyModule propertyModule, AuthModule authModule,
            ReferenceCodeGenerator referenceCodes, RecordByRecord recordByRecord, JdbcTemplate jdbc, Clock clock) {
        this.leads = leads;
        this.visits = visits;
        this.activities = activities;
        this.bookingModule = bookingModule;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.referenceCodes = referenceCodes;
        this.recordByRecord = recordByRecord;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    // ---- An external visit ----------------------------------------------------

    @Transactional
    public ExternalRecordResponse recordVisit(UUID actorUserId, UUID propertyId, RecordExternalVisitRequest input) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        Instant now = clock.instant();
        LocalDate today = LocalDate.now(clock.withZone(LeadVisitService.IST));
        LocalDate visitedOn = input.visitedOn() != null ? input.visitedOn() : today;
        if (visitedOn.isAfter(today)) {
            throw new ValidationException("Record a visit once they have come. Pick today or an earlier day.");
        }
        if (visitedOn.isBefore(today.minusDays(PostVisitBookingWindow.DAYS))) {
            throw new ValidationException("Pick a day in the last " + PostVisitBookingWindow.DAYS + " days.");
        }
        if ((input.slotStart() == null) != (input.slotEnd() == null)
                || (input.slotStart() != null && !input.slotStart().isBefore(input.slotEnd()))) {
            throw new ValidationException("Choose the slot they came in.");
        }
        if (input.impression() == null) {
            throw new ValidationException("Choose how they found the place.");
        }
        if (input.impression() == VisitImpression.DISLIKED
                && (input.dislikedReason() == null || input.dislikedReason().isBlank())) {
            throw new ValidationException("Say why they did not like it.");
        }
        if (input.interest() == null) {
            throw new ValidationException("Choose whether they are interested.");
        }
        // Sharing and budget only for someone interested, and asked then (user, 2026-10-19).
        boolean interested = input.interest() == VisitInterest.YES;
        if (interested && input.wantedSharing() == null) {
            throw new ValidationException("Choose the sharing they want.");
        }
        if (interested && input.budgetPaise() == null) {
            throw new ValidationException("Enter a budget above zero.");
        }
        String name = name(input.name());
        UUID person = person(propertyId, name, authModule.normalizePhone(input.phone()), actorUserId);

        Lead lead = leadFor(propertyId, person, name, actorUserId, now);
        lead.reachAdvancedLead(now);
        lead = leads.saveAndFlush(lead);
        Visit visit = visits.save(Visit.recordExternal(referenceCodes.nextCode("VIS"), lead.getId(), propertyId,
                person, visitedOn, input.slotStart(), input.slotEnd(), actorUserId, now, input.impression(), input.dislikedReason(), input.interest(),
                interested ? input.wantedSharing().name() : null, interested ? input.budgetPaise() : null,
                input.note()));
        activities.save(LeadActivity.by(actorUserId, lead.getId(), LeadActivityType.VISIT_ATTENDED, null,
                "Walked in", now));
        if (input.interest() == VisitInterest.NO && lead.close(LeadCloseReason.NOT_INTERESTED, now, true)) {
            activities.save(LeadActivity.by(actorUserId, lead.getId(), LeadActivityType.CLOSED, null,
                    "Not interested", now));
        }
        log.info("External visit recorded visitId={} code={} leadId={} propertyId={} interest={}",
                visit.getId(), visit.getReferenceCode(), lead.getId(), propertyId, input.interest());
        return new ExternalRecordResponse(lead.getId(), lead.getReferenceCode(), lead.getStage().name(),
                lead.getState().name(), visit.getId(), visit.getReferenceCode(), null);
    }

    // ---- An external booking --------------------------------------------------

    @Transactional
    public ExternalRecordResponse createBooking(UUID actorUserId, UUID propertyId, CreateExternalBookingRequest input) {
        Instant now = clock.instant();
        String name = name(input.name());
        String phone = authModule.normalizePhone(input.phone());
        UUID person = person(propertyId, name, phone, actorUserId);
        UUID bookingId = bookingModule.createExternalBooking(actorUserId, propertyId, person,
                new BookingExternalService.Command(name, phone, input.gender(), input.dateOfBirth(), input.reachedVia(),
                        input.roomId(), input.moveInDate(), input.monthlyRentPaise(), input.depositPaise(),
                        input.agreementMonths(), input.tokenPaise(), input.tokenMethod(), input.tokenReference()));
        BookingSnapshot booking = bookingModule.snapshot(bookingId).orElseThrow();

        Lead lead = leadFor(propertyId, person, name, actorUserId, now);
        lead.reachBooked(now);
        lead = leads.saveAndFlush(lead);
        activities.save(LeadActivity.ofBooking(lead.getId(), LeadActivityType.BOOKING_CONFIRMED, bookingId, null,
                input.reachedVia() == com.khatiyan.d_modules.booking.model.BookingReachedVia.PHONE_CALL
                        ? "Booked by phone" : "Booked in person", now));
        log.info("External booking joined its lead bookingId={} reference={} leadId={} propertyId={}",
                bookingId, booking.referenceCode(), lead.getId(), propertyId);
        return new ExternalRecordResponse(lead.getId(), lead.getReferenceCode(), lead.getStage().name(),
                lead.getState().name(), null, null, bookingId);
    }

    @Transactional(readOnly = true)
    public BookingExternalService.Options bookingOptions(UUID actorUserId, UUID propertyId) {
        return bookingModule.externalBookingOptions(actorUserId, propertyId);
    }

    /**
     * A later change to an external booking reaches its lead (2026-10-19):
     * moved in, or ended without a move-in. Read from the booking as it stands,
     * so a repeated or late event leaves the lead right.
     */
    @Transactional
    public void syncFromBooking(UUID requestId) {
        BookingSnapshot booking = bookingModule.snapshot(requestId).orElse(null);
        if (booking == null || booking.externalProspectId() == null) {
            return;
        }
        Lead lead = leads.findFirstByPropertyIdAndExternalProspectIdAndState(
                        booking.propertyId(), booking.externalProspectId(), LeadState.OPEN)
                .orElse(null);
        if (lead == null) {
            return;
        }
        Instant now = clock.instant();
        if (booking.tenancyId() != null) {
            if (lead.moveIn(booking.tenancyId(), booking.convertedAt() != null ? booking.convertedAt() : now)) {
                activities.save(LeadActivity.ofBooking(lead.getId(), LeadActivityType.MOVED_IN, requestId, null, null, now));
            }
            return;
        }
        if (booking.status() == BookingStatus.CANCELLED || booking.status() == BookingStatus.EXPIRED) {
            LeadCloseReason reason = closeReasonOf(booking.endCause());
            if (lead.close(reason, now, reason == LeadCloseReason.BOOKING_CANCELLED_BY_TENANT)) {
                activities.save(LeadActivity.ofBooking(lead.getId(), LeadActivityType.BOOKING_ENDED, requestId, null,
                        null, now));
            }
        }
    }

    private static LeadCloseReason closeReasonOf(BookingEndCause cause) {
        if (cause == null) {
            return LeadCloseReason.BOOKING_CANCELLED_BY_PROPERTY;
        }
        return switch (cause) {
            case TENANT_CANCELLED -> LeadCloseReason.BOOKING_CANCELLED_BY_TENANT;
            case TENANT_DID_NOT_SIGN -> LeadCloseReason.DID_NOT_SIGN;
            case TENANT_DID_NOT_ARRIVE -> LeadCloseReason.DID_NOT_ARRIVE;
            case BED_NOT_READY -> LeadCloseReason.BED_NOT_READY;
            case BOOKED_ELSEWHERE -> LeadCloseReason.BOOKED_ELSEWHERE;
            case PROPERTY_CANNOT_HOST -> LeadCloseReason.PROPERTY_COULD_NOT_HOST;
            case MANAGEMENT_CANCELLED, MOVED_IN -> LeadCloseReason.BOOKING_CANCELLED_BY_PROPERTY;
        };
    }

    // ---- The 30 days after an external visit ----------------------------------

    @Scheduled(cron = "0 25 * * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "external-lead-expiry", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void sweep() {
        int closed = closeExpired();
        if (closed > 0) {
            log.info("External leads closed after their booking window {}", closed);
        }
    }

    /** Strong external leads with nothing booked, 30 days past their visit. */
    public int closeExpired() {
        List<UUID> due = jdbc.queryForList("""
                SELECT id FROM lead.leads
                WHERE state = 'OPEN' AND stage = 'ADVANCED_LEAD' AND external_prospect_id IS NOT NULL
                  AND advanced_lead_at < ?
                """, UUID.class,
                Timestamp.from(clock.instant().minus(Duration.ofDays(PostVisitBookingWindow.DAYS))));
        return recordByRecord.run("external-lead-expiry", due, id -> id, this::closeIfExpired);
    }

    @Transactional
    public boolean closeIfExpired(UUID leadId) {
        Lead lead = leads.findById(leadId).orElse(null);
        Instant now = clock.instant();
        if (lead == null || !lead.isOpen() || !lead.isExternal() || lead.getAdvancedLeadAt() == null
                || lead.getStage() != com.khatiyan.d_modules.lead.model.LeadStage.ADVANCED_LEAD
                || lead.getAdvancedLeadAt().plus(Duration.ofDays(PostVisitBookingWindow.DAYS)).isAfter(now)) {
            return false;
        }
        lead.close(LeadCloseReason.BOOKING_WINDOW_EXPIRED, now);
        activities.save(LeadActivity.bySystem(lead.getId(), LeadActivityType.CLOSED, null, null,
                "Nothing booked within 30 days of the visit", now));
        return true;
    }

    // ---- The person and their lead ---------------------------------------------

    /** Their record at this property, made the first time their phone is recorded here. */
    private UUID person(UUID propertyId, String name, String phone, UUID actorUserId) {
        return jdbc.queryForObject("""
                INSERT INTO lead.external_prospects (id, property_id, full_name, phone, created_by_user_id)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (property_id, phone) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()
                RETURNING id
                """, UUID.class, UUID.randomUUID(), propertyId, name, phone, actorUserId);
    }

    /** Their open lead here, or a new one handled by whoever records it. */
    private Lead leadFor(UUID propertyId, UUID person, String name, UUID actorUserId, Instant now) {
        return leads.findFirstByPropertyIdAndExternalProspectIdAndState(propertyId, person, LeadState.OPEN)
                .orElseGet(() -> {
                    Lead lead = Lead.openedExternally(referenceCodes.nextCode("LEAD"), propertyId, person, name, now);
                    lead.takeHandler(actorUserId, LeadHandlerSource.FIRST_RESPONSE, now);
                    return lead;
                });
    }

    private static String name(String raw) {
        String name = raw == null ? "" : raw.strip();
        if (name.isEmpty()) {
            throw new ValidationException("Enter their name.");
        }
        if (name.length() > 120) {
            throw new ValidationException("Keep the name under 120 characters.");
        }
        return name;
    }
}
