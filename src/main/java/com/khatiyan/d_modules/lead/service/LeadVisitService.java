package com.khatiyan.d_modules.lead.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryParty;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.enquiry.model.EnquirySentiment;
import com.khatiyan.d_modules.lead.api.dto.BookedVisitResponse;
import com.khatiyan.d_modules.lead.api.dto.CancelVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.EnquiryChatActionsResponse;
import com.khatiyan.d_modules.lead.api.dto.RescheduleVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.ScheduleVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.VisitAvailabilityResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitMoveOptionsResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitResponse;
import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadActivity;
import com.khatiyan.d_modules.lead.model.LeadActivityType;
import com.khatiyan.d_modules.lead.model.LeadEnquiry;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitBookedBy;
import com.khatiyan.d_modules.lead.model.VisitStatus;
import com.khatiyan.d_modules.lead.model.VisitWindow;
import com.khatiyan.d_modules.lead.repository.LeadActivityRepository;
import com.khatiyan.d_modules.lead.repository.LeadEnquiryRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository;
import com.khatiyan.d_modules.lead.repository.VisitRepository;
import com.khatiyan.d_modules.lead.repository.VisitRepository.SlotTaken;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyVisitSlotsResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Booking and moving visits, and what the enquiry chat's action bar shows.
 *
 * <p>The owner's rules (2026-10-03):
 * <ul>
 * <li>Either side books: the prospect from their side of the chat, the handler
 * (or the owner) from theirs. Either way the lead becomes an early lead.</li>
 * <li>A visit is a date, from tomorrow to 30 days ahead, and one of the
 * property's slots for that weekday.</li>
 * <li>A slot takes as many visits as the owner set for it. Each booking takes
 * one place, and a slot with none left cannot be booked.</li>
 * <li>One visit per enquiry. A person cannot book another at the property
 * while one is still to happen, or until the enquiry it was booked on has
 * expired. Missing the visit does not earn a second one.</li>
 * <li>The property moves or cancels a visit until two hours before its slot
 * (user, 2026-10-04). After that, and for a missed one, only the visitor can.</li>
 * <li>The prospect moves theirs twice before its day. On the day, before their
 * slot starts, another slot that day is free. Once the slot has started they
 * cannot move it, until half of it has gone with nobody checking them in: then
 * they are running late, and a later slot that day is free. Another day is
 * offered only when no slot is left, and is one of their two missed moves.</li>
 * <li>A No visit is moved by the visitor only, twice, on the missed count.</li>
 * <li>The visitor cancels any time before the visit is done. The person goes
 * back to Enquired and may book again before the enquiry expires. If it has
 * expired already, their record ends there.</li>
 * </ul>
 *
 * <p>Two people can go for the last place in a slot at the same moment. Each
 * booking takes a lock on the slot first, then counts, so the second sees the
 * first's place taken ({@link #takePlace}).
 */
@Slf4j
@Service
public class LeadVisitService {

    static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    /** How far ahead a visit can be booked. From tomorrow: there are no same-day visits. */
    static final int BOOK_AHEAD_DAYS = 30;

    /** "5 Nov, 2:30 pm": when an enquiry ends, as the refusals say it. */
    private static final DateTimeFormatter ENQUIRY_END =
            DateTimeFormatter.ofPattern("d MMM, h:mm a", Locale.ENGLISH);

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);

    private final VisitRepository visitRepository;
    private final LeadRepository leadRepository;
    private final LeadEnquiryRepository leadEnquiryRepository;
    private final LeadActivityRepository leadActivityRepository;
    private final LeadPipelineService pipeline;
    private final EnquiryModule enquiryModule;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final NotificationModule notificationModule;
    private final ReferenceCodeGenerator referenceCodeGenerator;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public LeadVisitService(
            VisitRepository visitRepository,
            LeadRepository leadRepository,
            LeadEnquiryRepository leadEnquiryRepository,
            LeadActivityRepository leadActivityRepository,
            LeadPipelineService pipeline,
            EnquiryModule enquiryModule,
            PropertyModule propertyModule,
            AuthModule authModule,
            NotificationModule notificationModule,
            ReferenceCodeGenerator referenceCodeGenerator,
            JdbcTemplate jdbcTemplate,
            Clock clock) {
        this.visitRepository = visitRepository;
        this.leadRepository = leadRepository;
        this.leadEnquiryRepository = leadEnquiryRepository;
        this.leadActivityRepository = leadActivityRepository;
        this.pipeline = pipeline;
        this.enquiryModule = enquiryModule;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.notificationModule = notificationModule;
        this.referenceCodeGenerator = referenceCodeGenerator;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    /** The time in India. Every rule that turns on the hour reads it here, so a test can set it. */
    LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant(), IST);
    }

    /** One of the property's slots on one date, with how many visits it takes. */
    private record OfferedSlot(LocalTime start, LocalTime end, int capacity) {
    }

    // ---- Reading ---------------------------------------------------------

    /**
     * The dates and slots open for booking, with the places left in each.
     *
     * <p>Two reads however long the range: the property's slots, and the places
     * taken in every slot of the range in one grouped query.
     */
    @Transactional(readOnly = true)
    public VisitAvailabilityResponse availability(UUID propertyId) {
        return availability(propertyId, null);
    }

    /**
     * The slots open for a visit from an enquiry: no later than the enquiry's
     * own window (user, 2026-10-07). A visit is only booked while the enquiry
     * that asked for it is still live, so the day strip stops where it ends.
     * Asked by the enquirer or by management of the property; anyone else
     * sees nothing about the enquiry.
     */
    @Transactional(readOnly = true)
    public VisitAvailabilityResponse availabilityForEnquiry(UUID actorUserId, UUID propertyId, UUID enquiryId) {
        EnquirySnapshot enquiry = enquiryModule.findSnapshot(enquiryId)
                .filter(found -> found.propertyId().equals(propertyId))
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));
        if (enquiryModule.partyOf(enquiryId, actorUserId) == EnquiryParty.OUTSIDER) {
            throw new ForbiddenException("You are not part of this enquiry");
        }
        return availability(propertyId, enquiry.expiresAt());
    }

    /**
     * The slots open from tomorrow, up to 30 days ahead or, when {@code until}
     * is given, only those starting before it.
     */
    private VisitAvailabilityResponse availability(UUID propertyId, Instant until) {
        propertyModule.getActiveProperty(propertyId);
        PropertyVisitSlotsResponse offered = propertyModule.findVisitSlots(propertyId);
        if (!offered.configured()) {
            return new VisitAvailabilityResponse(propertyId, false, List.of());
        }

        LocalDate first = firstBookableDate();
        LocalDate last = lastBookableDate(until);
        Map<String, Long> taken = new HashMap<>();
        for (SlotTaken slot : visitRepository.countScheduledBySlot(propertyId, first, last)) {
            taken.put(slot.getVisitDate() + "@" + slot.getSlotStartMinute(), slot.getTaken());
        }
        Map<DayOfWeek, PropertyVisitSlotsResponse.VisitDay> byWeekday = new HashMap<>();
        offered.days().forEach(day -> byWeekday.put(day.day(), day));

        List<VisitAvailabilityResponse.Day> days = new ArrayList<>();
        for (LocalDate date = first; !date.isAfter(last); date = date.plusDays(1)) {
            PropertyVisitSlotsResponse.VisitDay day = byWeekday.get(date.getDayOfWeek());
            if (day == null || day.slots().isEmpty() || day.visitorsPerSlot() == null) {
                continue;
            }
            List<VisitAvailabilityResponse.Slot> slots = new ArrayList<>();
            for (PropertyVisitSlotsResponse.Slot slot : day.slots()) {
                if (!startsBefore(date, slot.startTime(), until)) {
                    continue;
                }
                long booked = taken.getOrDefault(date + "@" + minuteOf(slot.startTime()), 0L);
                slots.add(new VisitAvailabilityResponse.Slot(
                        slot.startTime(),
                        slot.endTime(),
                        day.visitorsPerSlot(),
                        (int) Math.max(0, day.visitorsPerSlot() - booked)));
            }
            if (!slots.isEmpty()) {
                days.add(new VisitAvailabilityResponse.Day(date, slots));
            }
        }
        return new VisitAvailabilityResponse(propertyId, true, days);
    }

    /**
     * Every visit that stands on the property's enquiries, booked, attended or
     * missed, for the Enquiries screen. One query, however many cards it serves.
     */
    @Transactional(readOnly = true)
    public List<BookedVisitResponse> bookedVisits(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        LocalDateTime now = now();
        return visitRepository
                .findByPropertyIdAndStatusNotAndEnquiryIdIsNotNull(propertyId, VisitStatus.CANCELLED)
                .stream()
                .map(visit -> BookedVisitResponse.of(visit, now, IST))
                .toList();
    }

    /**
     * Where a visit may be moved to right now, for whoever is asking. Today's
     * later slots come first when the visitor may take one for free. Another
     * day is on offer to them as long as a counted move is left, a later slot
     * being free today or not (user, 2026-10-04).
     */
    @Transactional(readOnly = true)
    public VisitMoveOptionsResponse moveOptions(UUID actorUserId, UUID visitId) {
        Visit visit = visitRepository.findById(visitId)
                .orElseThrow(() -> new NotFoundException("Visit", visitId));
        boolean byTenant = actorUserId.equals(visit.getProspectUserId());
        if (!byTenant) {
            ensureActingManagement(visit, actorUserId, "You cannot move this visit");
        }
        LocalDateTime now = now();
        VisitWindow window = visit.prospectWindow(now);
        int left = visit.tenantReschedulesLeft(now);
        String refusal = moveRefusal(visit, now, byTenant, !byTenant);
        if (refusal != null) {
            return new VisitMoveOptionsResponse(visitId, window, refusal, refusal, false, left, List.of());
        }

        boolean sameDay = byTenant && window.onTheDay();
        Instant enquiryEnds = enquiryEndsAt(visit);
        List<VisitAvailabilityResponse.Slot> laterToday = sameDay
                ? laterSlotsToday(visit, now).stream()
                        .filter(slot -> startsBefore(now.toLocalDate(), slot.startTime(), enquiryEnds))
                        .toList()
                : List.of();
        List<VisitAvailabilityResponse.Day> days = new ArrayList<>();
        if (!laterToday.isEmpty()) {
            days.add(new VisitAvailabilityResponse.Day(now.toLocalDate(), laterToday));
        }
        boolean anotherDay = !byTenant || left > 0;
        if (anotherDay) {
            days.addAll(availability(visit.getPropertyId(), enquiryEnds).days());
        }
        String limit = Visit.tenantLimitMessage(window == VisitWindow.RUNNING_LATE);
        return new VisitMoveOptionsResponse(
                visitId, window,
                days.isEmpty()
                        ? (left == 0 ? limit : noSlotLeftMessage(enquiryEnds))
                        : null,
                anotherDay ? null : limit,
                sameDay, left, days);
    }

    /** Today's slots that start after now and still have a place, other than the visit's own. */
    private List<VisitAvailabilityResponse.Slot> laterSlotsToday(Visit visit, LocalDateTime now) {
        LocalDate today = now.toLocalDate();
        PropertyVisitSlotsResponse offered = propertyModule.findVisitSlots(visit.getPropertyId());
        Map<Integer, Long> taken = new HashMap<>();
        for (SlotTaken slot : visitRepository.countScheduledBySlot(visit.getPropertyId(), today, today)) {
            taken.put(slot.getSlotStartMinute(), slot.getTaken());
        }
        List<VisitAvailabilityResponse.Slot> later = new ArrayList<>();
        for (PropertyVisitSlotsResponse.VisitDay day : offered.days()) {
            if (day.day() != today.getDayOfWeek() || day.visitorsPerSlot() == null) {
                continue;
            }
            for (PropertyVisitSlotsResponse.Slot slot : day.slots()) {
                int spotsLeft = (int) Math.max(
                        0, day.visitorsPerSlot() - taken.getOrDefault(minuteOf(slot.startTime()), 0L));
                if (today.atTime(slot.startTime()).isAfter(now) && spotsLeft > 0
                        && !visit.isIn(today, slot.startTime())) {
                    later.add(new VisitAvailabilityResponse.Slot(
                            slot.startTime(), slot.endTime(), day.visitorsPerSlot(), spotsLeft));
                }
            }
        }
        return later;
    }

    /** What the action bar above the enquiry's chat shows for the person reading it. */
    @Transactional(readOnly = true)
    public EnquiryChatActionsResponse chatActions(UUID actorUserId, UUID enquiryId) {
        EnquirySnapshot enquiry = enquiryModule.findSnapshot(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));
        EnquiryParty party = enquiryModule.partyOf(enquiryId, actorUserId);
        if (party == EnquiryParty.OUTSIDER) {
            throw new ForbiddenException("You are not part of this enquiry");
        }

        boolean over = enquiry.isOver(Instant.now());
        boolean answered = enquiry.respondedAt() != null;
        boolean acting = party == EnquiryParty.ACTING_MANAGEMENT;
        boolean enquirer = party == EnquiryParty.ENQUIRER;
        LocalDateTime clockNow = now();
        LocalDate today = clockNow.toLocalDate();
        Visit visit = leadEnquiryRepository.findById(enquiryId)
                .map(link -> blockingVisit(link.getLeadId(), today))
                .orElse(null);

        return new EnquiryChatActionsResponse(
                enquiryId,
                enquiry.propertyId(),
                party,
                answered,
                over,
                // The handler's reading is the handler's. The enquirer never sees it.
                enquirer ? null : enquiry.sentiment(),
                acting && answered && !over,
                // The prospect may book once they have replied, whatever the
                // handler made of them: people change their minds. The handler
                // books once they have marked them interested.
                !over && visit == null
                        && ((enquirer && answered) || (acting && enquiry.sentiment() == EnquirySentiment.INTERESTED)),
                // Ending is offered once they are marked not interested, and
                // never over a visit that is still to happen. A visit whose date
                // has passed does not hold the conversation open.
                acting && !over && (visit == null || !visit.isUpcoming(today))
                        && enquiry.sentiment() == EnquirySentiment.NOT_INTERESTED,
                // Both sides: the change of mind is the enquirer's own act, not
                // the handler's reading, so it is theirs to know about too.
                enquiry.tenantChangedMindAt() != null,
                visit == null
                        ? null
                        : VisitResponse.of(
                                visit, clockNow, moveRefusal(visit, clockNow, enquirer, acting),
                                mayCancel(visit, enquirer, acting, clockNow)),
                enquiry.version());
    }

    // ---- Booking ---------------------------------------------------------

    /** Books a visit from an enquiry, for whichever side is asking. */
    @Transactional
    public EnquiryChatActionsResponse schedule(UUID actorUserId, UUID enquiryId, ScheduleVisitRequest request) {
        EnquirySnapshot enquiry = enquiryModule.findSnapshot(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));
        VisitBookedBy bookedBy = switch (enquiryModule.partyOf(enquiryId, actorUserId)) {
            case ENQUIRER -> VisitBookedBy.TENANT;
            case ACTING_MANAGEMENT -> VisitBookedBy.HANDLER;
            case OTHER_MANAGEMENT -> throw new ValidationException("Someone else is handling this enquiry.");
            case OUTSIDER -> throw new ForbiddenException("You are not part of this enquiry");
        };
        Instant now = Instant.now();
        if (enquiry.isOver(now)) {
            throw new ValidationException("This conversation has ended, so a visit can no longer be booked from it.");
        }
        // Not before the enquiry has been answered with a successful attempt
        // (user, 2026-10-02): until someone has actually reached them there is
        // no conversation to book a visit out of. The screens grey the button
        // out too; this is the rule they mirror.
        if (enquiry.respondedAt() == null) {
            throw new ValidationException("A visit can be booked once this enquiry has been answered.");
        }

        // Makes sure the lead exists and is level with the enquiry, and holds
        // this person's turn at this property until the booking commits.
        pipeline.syncFromEnquiry(enquiryId, enquiry.propertyId(), enquiry.enquirerUserId());
        Lead lead = leadOf(enquiryId);
        if (!lead.isOpen()) {
            throw new ValidationException("This enquiry is closed, so a visit can no longer be booked from it.");
        }
        Visit standing = blockingVisit(lead.getId(), LocalDate.now(IST));
        if (standing != null) {
            throw new ValidationException(standing.isUpcoming(LocalDate.now(IST))
                    ? "A visit is already scheduled. Move it instead of booking another."
                    : bookedBy == VisitBookedBy.TENANT
                            ? "You have already booked a visit with this property."
                                    + " You can book another after this enquiry expires."
                            : "A visit was already booked for this enquiry."
                                    + " Another can be booked after it expires.");
        }

        OfferedSlot slot = requireOffered(enquiry.propertyId(), request.date(), request.slotStart());
        requireWithinEnquiry(request.date(), slot.start(), enquiry.expiresAt());
        takePlace(enquiry.propertyId(), request.date(), slot);

        Visit booked = Visit.schedule(
                referenceCodeGenerator.nextCode("VIS"),
                lead.getId(),
                enquiry.propertyId(),
                enquiry.enquirerUserId(),
                enquiryId,
                request.date(),
                slot.start(),
                slot.end(),
                bookedBy,
                actorUserId);
        // Booked again after the tenant cancelled on this enquiry: the
        // reschedules carry over, so cancelling cannot reset them. After the
        // property cancelled it starts fresh, that being the property's call.
        visitRepository.findFirstByEnquiryIdAndStatusOrderByCreatedAtDesc(enquiryId, VisitStatus.CANCELLED)
                .filter(cancelled -> cancelled.getCancelledBy() == VisitBookedBy.TENANT)
                .ifPresent(booked::carryTenantCountsFrom);
        Visit visit = visitRepository.save(booked);
        // A booked visit settles a call still waiting for its answer as
        // interested, and marks the enquiry so (owner's rule, 2026-10-03).
        enquiryModule.visitBooked(enquiryId, actorUserId);

        // A visit scheduled by either side is what makes it a lead the owner counts.
        lead.reachEarlyLead(now);
        leadActivityRepository.save(LeadActivity.by(
                actorUserId, lead.getId(), LeadActivityType.VISIT_SCHEDULED, enquiryId, when(visit), now));

        tellTheOtherSide(visit, lead, enquiry, bookedBy, NotificationSubtype.VISIT_SCHEDULED, "Visit scheduled");
        log.info("Visit scheduled visitId={} code={} leadId={} date={} slotStart={} bookedBy={}",
                visit.getId(), visit.getReferenceCode(), lead.getId(), visit.getVisitDate(),
                visit.getSlotStart(), bookedBy);

        return chatActions(actorUserId, enquiryId);
    }

    /**
     * Moves a visit to another date or slot.
     *
     * <p>The prospect by the rules of {@link Visit#moveByTenant}. The handler
     * and the owner until two hours before the slot, and theirs are not counted.
     */
    @Transactional
    public VisitResponse reschedule(UUID actorUserId, UUID visitId, RescheduleVisitRequest request) {
        Visit visit = visitRepository.findById(visitId)
                .orElseThrow(() -> new NotFoundException("Visit", visitId));
        VersionGuard.claim(visit);

        boolean byTenant = actorUserId.equals(visit.getProspectUserId());
        if (!byTenant) {
            ensureActingManagement(visit, actorUserId, "You cannot move this visit");
        }
        LocalDateTime clockNow = now();
        String refusal = moveRefusal(visit, clockNow, byTenant, !byTenant);
        if (refusal != null) {
            throw new ValidationException(refusal);
        }
        if (visit.isLive() && visit.isIn(request.date(), request.slotStart())) {
            throw new ValidationException("That is the slot it is already in. Pick another.");
        }

        OfferedSlot slot = byTenant
                ? requireOfferedToVisitor(visit, clockNow, request.date(), request.slotStart())
                : requireOffered(visit.getPropertyId(), request.date(), request.slotStart());
        requireWithinEnquiry(request.date(), slot.start(), enquiryEndsAt(visit));
        takePlace(visit.getPropertyId(), request.date(), slot);

        String from = when(visit);
        if (byTenant) {
            visit.moveByTenant(request.date(), slot.start(), slot.end(), clockNow);
        } else {
            visit.moveByHandler(request.date(), slot.start(), slot.end(), clockNow);
        }
        visit = visitRepository.saveAndFlush(visit);

        Instant now = Instant.now();
        String reason = request.reason() == null || request.reason().isBlank() ? "" : ". " + request.reason().trim();
        leadActivityRepository.save(LeadActivity.by(
                actorUserId, visit.getLeadId(), LeadActivityType.VISIT_RESCHEDULED, visit.getEnquiryId(),
                "From " + from + " to " + when(visit) + reason, now));

        Lead lead = leadRepository.findById(visit.getLeadId()).orElseThrow();
        EnquirySnapshot enquiry = visit.getEnquiryId() == null
                ? null
                : enquiryModule.findSnapshot(visit.getEnquiryId()).orElse(null);
        tellTheOtherSide(
                visit, lead, enquiry, byTenant ? VisitBookedBy.TENANT : VisitBookedBy.HANDLER,
                NotificationSubtype.VISIT_RESCHEDULED, "Visit moved");
        log.info("Visit moved visitId={} date={} slotStart={} byTenant={} tenantReschedulesLeft={}",
                visitId, visit.getVisitDate(), visit.getSlotStart(), byTenant, visit.tenantReschedulesLeft(clockNow));

        return VisitResponse.of(
                visit, clockNow, moveRefusal(visit, clockNow, byTenant, !byTenant),
                mayCancel(visit, byTenant, !byTenant, clockNow));
    }

    /**
     * Cancels a visit, from either side.
     *
     * <p>The place in the slot is freed and the person is back at Enquired, so
     * they may book again while the enquiry still runs. When it has already run
     * out (the visit was booked near its end), their record closes now: the
     * enquiry ends with the booking.
     */
    @Transactional
    public VisitResponse cancel(UUID actorUserId, UUID visitId, CancelVisitRequest request) {
        Visit visit = visitRepository.findById(visitId)
                .orElseThrow(() -> new NotFoundException("Visit", visitId));
        VersionGuard.claim(visit);

        boolean byTenant = actorUserId.equals(visit.getProspectUserId());
        if (!byTenant) {
            ensureActingManagement(visit, actorUserId, "You cannot cancel this visit");
        }
        if (!visit.isLive()) {
            throw new ValidationException("This visit can no longer be cancelled.");
        }
        LocalDateTime clockNow = now();
        if (!byTenant) {
            String refusal = visit.managementRefusal(clockNow, "cancelled");
            if (refusal != null) {
                throw new ValidationException(refusal);
            }
        }

        // The person's turn at this property, held to the end: the pipeline may
        // be bringing the same lead level with its enquiry at this moment.
        if (visit.getEnquiryId() != null) {
            pipeline.syncFromEnquiry(visit.getEnquiryId(), visit.getPropertyId(), visit.getProspectUserId());
        }

        visit.cancel(byTenant ? VisitBookedBy.TENANT : VisitBookedBy.HANDLER, Instant.now(), request.reason());
        visit = visitRepository.saveAndFlush(visit);
        Lead lead = leadRepository.findById(visit.getLeadId()).orElseThrow();
        lead.returnToEnquired();

        // Still interested, or not: the enquiry's intent follows the answer
        // (owner's design, 2026-10-03). Not interested starts its 7 days.
        if (visit.getEnquiryId() != null) {
            enquiryModule.visitCancelled(visit.getEnquiryId(), actorUserId, request.stillInterested());
        }

        Instant now = Instant.now();
        leadActivityRepository.save(LeadActivity.by(
                actorUserId, lead.getId(), LeadActivityType.VISIT_CANCELLED, visit.getEnquiryId(), when(visit), now));

        EnquirySnapshot enquiry = visit.getEnquiryId() == null
                ? null
                : enquiryModule.findSnapshot(visit.getEnquiryId()).orElse(null);
        tellTheOtherSide(
                visit, lead, enquiry, byTenant ? VisitBookedBy.TENANT : VisitBookedBy.HANDLER,
                NotificationSubtype.VISIT_CANCELLED, "Visit cancelled");

        // Back at Enquired with the enquiry already over: the record ends now.
        if (visit.getEnquiryId() != null) {
            pipeline.syncFromEnquiry(visit.getEnquiryId(), visit.getPropertyId(), visit.getProspectUserId());
        }
        log.info("Visit cancelled visitId={} byTenant={} leadId={} leadState={}",
                visitId, byTenant, lead.getId(), lead.getState());

        return VisitResponse.of(
                visit, clockNow, moveRefusal(visit, clockNow, byTenant, !byTenant),
                mayCancel(visit, byTenant, !byTenant, clockNow));
    }

    /** Refuses anyone in management who is not acting on the visit's enquiry, and anyone outside it. */
    private void ensureActingManagement(Visit visit, UUID actorUserId, String outsiderMessage) {
        EnquiryParty party = visit.getEnquiryId() == null
                ? EnquiryParty.OUTSIDER
                : enquiryModule.partyOf(visit.getEnquiryId(), actorUserId);
        if (party == EnquiryParty.OTHER_MANAGEMENT) {
            throw new ValidationException("Someone else is handling this enquiry.");
        }
        if (party != EnquiryParty.ACTING_MANAGEMENT) {
            throw new ForbiddenException(outsiderMessage);
        }
    }

    // ---- Rules -----------------------------------------------------------

    /**
     * Why this person may not move this visit now, in words to show them. Null
     * when they may.
     *
     * <p>One place decides it, for the bar and for the move itself, so the bar
     * never offers what the move would refuse.
     */
    static String moveRefusal(Visit visit, LocalDateTime now, boolean enquirer, boolean acting) {
        if (enquirer) {
            return switch (visit.prospectWindow(now)) {
                case CLOSED -> "This visit can no longer be moved.";
                // Another slot the same day costs nothing, so the count does not
                // refuse it. Their slot having started does not either (user, 2026-10-04).
                case DAY_BEFORE_SLOT, IN_SLOT, RUNNING_LATE -> null;
                case BEFORE_DAY -> visit.tenantReschedulesLeft(now) > 0 ? null : Visit.tenantLimitMessage(false);
                case MISSED -> visit.tenantReschedulesLeft(now) > 0 ? null : Visit.tenantLimitMessage(true);
            };
        }
        if (!acting) {
            return "Someone else is handling this enquiry.";
        }
        return visit.managementRefusal(now, "moved");
    }

    /** The visitor cancels any time before the visit is done. The property until two hours before its slot. */
    private static boolean mayCancel(Visit visit, boolean enquirer, boolean acting, LocalDateTime now) {
        return visit.isLive() && (enquirer || (acting && visit.managementMayChange(now)));
    }

    /**
     * The visit that stands in the way of booking another for this lead, or
     * null when nothing does.
     *
     * <p>Two things block. A visit still to happen: one at a time. And a visit,
     * whatever became of it, whose enquiry has not expired yet: one per
     * enquiry, so a visit that was missed is not simply booked again. The
     * person books again on their next enquiry, once this one has run out.
     */
    private Visit blockingVisit(UUID leadId, LocalDate today) {
        Instant now = Instant.now();
        for (Visit visit : visitRepository.findByLeadIdOrderByCreatedAtDesc(leadId)) {
            // A cancelled visit frees the enquiry: they may book again.
            if (visit.getStatus() == VisitStatus.CANCELLED) {
                continue;
            }
            if (visit.isUpcoming(today)) {
                return visit;
            }
            boolean enquiryStillRuns = visit.getEnquiryId() != null
                    && enquiryModule.findSnapshot(visit.getEnquiryId())
                            .map(enquiry -> !enquiry.isOver(now))
                            .orElse(false);
            if (enquiryStillRuns) {
                return visit;
            }
        }
        return null;
    }

    static LocalDate firstBookableDate() {
        return LocalDate.now(IST).plusDays(1);
    }

    static LocalDate lastBookableDate() {
        return LocalDate.now(IST).plusDays(BOOK_AHEAD_DAYS);
    }

    /** The last day a slot can be on: 30 days ahead, or the enquiry's last day if that comes sooner. */
    static LocalDate lastBookableDate(Instant until) {
        LocalDate last = lastBookableDate();
        if (until == null) {
            return last;
        }
        LocalDate enquiryLast = until.atZone(IST).toLocalDate();
        return enquiryLast.isBefore(last) ? enquiryLast : last;
    }

    /** Whether a slot on that date starts before {@code until}; always, when there is no limit. */
    static boolean startsBefore(LocalDate date, LocalTime slotStart, Instant until) {
        return until == null || date.atTime(slotStart).atZone(IST).toInstant().isBefore(until);
    }

    /**
     * Refuses a slot that starts once the enquiry has ended (user, 2026-10-07).
     * A visit is part of its enquiry, so it has to happen inside the enquiry's
     * 30 days: booked, or moved, by either side.
     */
    static void requireWithinEnquiry(LocalDate date, LocalTime slotStart, Instant enquiryEndsAt) {
        if (!startsBefore(date, slotStart, enquiryEndsAt)) {
            throw new ValidationException("A visit has to take place before this enquiry ends on "
                    + ENQUIRY_END.format(enquiryEndsAt.atZone(IST)) + ". Pick an earlier slot.");
        }
    }

    /** What moving a visit says when no slot is left: why, when it is the enquiry's end. */
    private static String noSlotLeftMessage(Instant enquiryEndsAt) {
        return enquiryEndsAt == null
                ? "The property has no slot left to move this visit to."
                : "The property has no slot left to move this visit to before this enquiry ends on "
                        + ENQUIRY_END.format(enquiryEndsAt.atZone(IST)) + ".";
    }

    /** When the visit's enquiry ends, or null for a visit that has none. */
    private Instant enquiryEndsAt(Visit visit) {
        if (visit.getEnquiryId() == null) {
            return null;
        }
        return enquiryModule.findSnapshot(visit.getEnquiryId()).map(EnquirySnapshot::expiresAt).orElse(null);
    }

    /** The slot the property offers at that start time on that date, or a refusal. */
    private OfferedSlot requireOffered(UUID propertyId, LocalDate date, LocalTime slotStart) {
        if (date.isBefore(firstBookableDate())) {
            throw new ValidationException("A visit can be booked from tomorrow onwards.");
        }
        if (date.isAfter(lastBookableDate())) {
            throw new ValidationException("A visit can be booked up to " + BOOK_AHEAD_DAYS + " days ahead.");
        }
        return offeredSlot(propertyId, date, slotStart);
    }

    /**
     * The slot a visitor may move to. Another slot on the visit day itself is
     * allowed for as long as the visit is still to happen, provided that slot
     * has not started. Another day is never refused for a later slot being
     * free today (user, 2026-10-04): the count is what limits it.
     */
    private OfferedSlot requireOfferedToVisitor(Visit visit, LocalDateTime now, LocalDate date, LocalTime slotStart) {
        VisitWindow window = visit.prospectWindow(now);
        if (date.equals(now.toLocalDate())) {
            if (!window.onTheDay()) {
                throw new ValidationException("A visit can be booked from tomorrow onwards.");
            }
            OfferedSlot slot = offeredSlot(visit.getPropertyId(), date, slotStart);
            if (!date.atTime(slot.start()).isAfter(now)) {
                throw new ValidationException("That slot has already started. Pick a later one.");
            }
            return slot;
        }
        return requireOffered(visit.getPropertyId(), date, slotStart);
    }

    private OfferedSlot offeredSlot(UUID propertyId, LocalDate date, LocalTime slotStart) {
        PropertyVisitSlotsResponse offered = propertyModule.findVisitSlots(propertyId);
        for (PropertyVisitSlotsResponse.VisitDay day : offered.days()) {
            if (day.day() != date.getDayOfWeek() || day.visitorsPerSlot() == null) {
                continue;
            }
            for (PropertyVisitSlotsResponse.Slot slot : day.slots()) {
                if (minuteOf(slot.startTime()) == minuteOf(slotStart)) {
                    return new OfferedSlot(slot.startTime(), slot.endTime(), day.visitorsPerSlot());
                }
            }
        }
        throw new ValidationException("The property does not offer that slot on that day. Pick another.");
    }

    /**
     * Takes one place in a slot, or refuses when none is left.
     *
     * <p>A lock on the slot, held until this transaction ends, then the count.
     * Two bookings for the last place take turns: the second waits, then counts
     * the first's visit and is refused. Counting without the lock would let
     * both through.
     */
    private void takePlace(UUID propertyId, LocalDate date, OfferedSlot slot) {
        int startMinute = minuteOf(slot.start());
        jdbcTemplate.query(
                "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                resultSet -> { },
                "visit-slot:" + propertyId + ":" + date + ":" + startMinute);
        if (visitRepository.countScheduled(propertyId, date, startMinute) >= slot.capacity()) {
            throw new ValidationException("That slot is full. Pick another.");
        }
    }

    private Lead leadOf(UUID enquiryId) {
        LeadEnquiry link = leadEnquiryRepository.findById(enquiryId)
                .orElseThrow(() -> new NotFoundException("Lead for enquiry", enquiryId));
        return leadRepository.findById(link.getLeadId()).orElseThrow();
    }

    // ---- Telling people --------------------------------------------------

    /**
     * Tells whichever side did not act. The prospect hears from the property.
     * The property's side is the lead's handler, or the owner while nobody
     * handles it.
     */
    private void tellTheOtherSide(
            Visit visit, Lead lead, EnquirySnapshot enquiry, VisitBookedBy actedAs,
            NotificationSubtype subtype, String title) {
        PropertyResponse property;
        try {
            property = propertyModule.getActiveProperty(visit.getPropertyId());
        } catch (NotFoundException gone) {
            return;
        }

        Map<String, String> data = new LinkedHashMap<>();
        data.put("visitId", visit.getId().toString());
        data.put("propertyId", visit.getPropertyId().toString());
        // What the notification row prints: where, when, and the short code,
        // never the id.
        data.put("propertyName", property.name());
        data.put("visitWhen", when(visit));
        data.put("visitReferenceCode", visit.getReferenceCode());
        if (visit.getEnquiryId() != null) {
            data.put("enquiryId", visit.getEnquiryId().toString());
        }
        if (enquiry != null && enquiry.chatThreadId() != null) {
            data.put("threadId", enquiry.chatThreadId().toString());
        }
        boolean moved = subtype == NotificationSubtype.VISIT_RESCHEDULED;
        boolean cancelled = subtype == NotificationSubtype.VISIT_CANCELLED;

        if (actedAs == VisitBookedBy.TENANT) {
            UUID recipient = lead.getHandlerUserId() != null ? lead.getHandlerUserId() : property.ownerId();
            String who = authModule.findById(visit.getProspectUserId())
                    .map(UserSummaryResponse::fullName)
                    .orElse("Someone");
            notificationModule.notifyUser(
                    recipient,
                    title,
                    cancelled
                            ? who + " cancelled their visit to " + property.name() + " on " + when(visit) + "."
                            : moved
                                    ? who + " moved their visit to " + property.name() + " to " + when(visit) + "."
                                    : who + " booked a visit to " + property.name() + " on " + when(visit) + ".",
                    NotificationCategory.ENQUIRY,
                    NotificationPriority.HIGH,
                    subtype,
                    visit.getId(),
                    data,
                    NotificationDeliveryMode.IN_APP_AND_PUSH,
                    NotificationAudience.MANAGEMENT);
        } else {
            notificationModule.notifyUser(
                    visit.getProspectUserId(),
                    title,
                    cancelled
                            ? property.name() + " cancelled your visit on " + when(visit) + "."
                            : moved
                                    ? property.name() + " moved your visit to " + when(visit) + "."
                                    : property.name() + " scheduled your visit for " + when(visit) + ".",
                    NotificationCategory.ENQUIRY,
                    NotificationPriority.HIGH,
                    subtype,
                    visit.getId(),
                    data,
                    NotificationDeliveryMode.IN_APP_AND_PUSH,
                    NotificationAudience.TENANT);
        }
    }

    /** "Sun 5 Oct, 4:00 pm": how a visit's date and slot are written for people. */
    static String when(Visit visit) {
        return DAY.format(visit.getVisitDate()) + ", " + TIME.format(visit.getSlotStart()).toLowerCase(Locale.ENGLISH);
    }

    private static int minuteOf(LocalTime time) {
        return time.getHour() * 60 + time.getMinute();
    }
}
