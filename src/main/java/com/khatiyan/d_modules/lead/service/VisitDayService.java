package com.khatiyan.d_modules.lead.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.lead.api.dto.CheckInVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.MyVisitResponse;
import com.khatiyan.d_modules.lead.api.dto.PropertyVisitsResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitCardResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitCardState;
import com.khatiyan.d_modules.lead.api.dto.VisitFormRequest;
import com.khatiyan.d_modules.lead.api.dto.VisitPassResponse;
import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadActivity;
import com.khatiyan.d_modules.lead.model.LeadActivityType;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitCheckInMethod;
import com.khatiyan.d_modules.lead.model.VisitStatus;
import com.khatiyan.d_modules.lead.repository.LeadActivityRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository;
import com.khatiyan.d_modules.lead.repository.VisitRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyVisitSlotsResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * The visit day (user, 2026-10-04): the Manage Visits screen, the visitor's
 * pass, marking attendance, the visit form, and what follows a No visit.
 *
 * <ul>
 * <li>Attendance is marked at the property. The visitor shows a pass, a QR
 * with a six digit code under it, that opens an hour before their slot.
 * Anyone managing the property scans it or types the code, during the slot.
 * Whoever does is in charge of the visit form: the visitor is the property's
 * to receive, not the enquiry handler's alone.</li>
 * <li>A visitor nobody scanned is marked by the owner only, after the slot and
 * before midnight.</li>
 * <li>Not checked in by midnight, it is No visit. The visitor has a week to
 * say they are still interested, by moving it. They may say no, which expires
 * the enquiry at once. Left unanswered for the week, it expires by itself.</li>
 * </ul>
 */
@Slf4j
@Service
public class VisitDayService {

    private static final ZoneId IST = LeadVisitService.IST;
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final VisitRepository visitRepository;
    private final LeadRepository leadRepository;
    private final LeadActivityRepository leadActivityRepository;
    private final EnquiryModule enquiryModule;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;
    private final VisitNotificationService notifier;

    public VisitDayService(
            VisitRepository visitRepository,
            LeadRepository leadRepository,
            LeadActivityRepository leadActivityRepository,
            EnquiryModule enquiryModule,
            PropertyModule propertyModule,
            AuthModule authModule,
            JdbcTemplate jdbcTemplate,
            Clock clock,
            VisitNotificationService notifier) {
        this.notifier = notifier;
        this.visitRepository = visitRepository;
        this.leadRepository = leadRepository;
        this.leadActivityRepository = leadActivityRepository;
        this.enquiryModule = enquiryModule;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    /** The time in India. Every rule that turns on the hour reads it here, so a test can set it. */
    LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant(), IST);
    }

    // ---- The screen ------------------------------------------------------

    /**
     * The Manage Visits screen for one property: today, upcoming and missed.
     *
     * <p>Five reads however many visits there are: the property, its slots,
     * its visits, their enquiries, and the people named on the cards.
     */
    @Transactional(readOnly = true)
    public PropertyVisitsResponse propertyVisits(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        LocalDate today = now().toLocalDate();

        List<Visit> visits = visitRepository.findForVisitsScreen(propertyId, today);
        Map<UUID, EnquirySnapshot> enquiries = enquiryModule.findSnapshots(
                visits.stream().map(Visit::getEnquiryId).collect(Collectors.toSet()));
        Map<UUID, UserSummaryResponse> users = authModule.findByIds(peopleOn(visits, enquiries));

        Instant instant = Instant.now();
        List<VisitCardResponse> todays = new ArrayList<>();
        List<VisitCardResponse> upcoming = new ArrayList<>();
        List<VisitCardResponse> missed = new ArrayList<>();
        for (Visit visit : visits) {
            EnquirySnapshot enquiry = enquiries.get(visit.getEnquiryId());
            VisitCardResponse card = card(visit, enquiry, users, actorUserId, property.ownerId(), today);
            if (card.state() == VisitCardState.MISSED) {
                // Listed while its enquiry is still open: once that ends, nothing can come of it.
                if (enquiry != null && !enquiry.isOver(instant)) {
                    missed.add(card);
                }
            } else if (visit.getVisitDate().equals(today)) {
                todays.add(card);
            } else if (visit.getVisitDate().isAfter(today) && card.state() == VisitCardState.SCHEDULED) {
                upcoming.add(card);
                // Moved off today: today still lists it, under the slot it
                // left, as Rescheduled (user, 2026-10-04).
                if (visit.wasMovedOffDate(today)) {
                    todays.add(rescheduledCard(visit, card));
                }
            }
        }
        // By slot: the read is by date and slot, and the rescheduled ones were added out of turn.
        todays.sort(java.util.Comparator.comparing(VisitCardResponse::slotStart));
        // The read is oldest first. Missed reads newest first.
        Collections.reverse(missed);
        return new PropertyVisitsResponse(
                property.ownerId().equals(actorUserId), slotsOn(propertyId, today), todays, upcoming, missed);
    }

    /**
     * The visitor's own visits, at any property, latest first. Four reads
     * however many there are: the visits, their properties, their enquiries,
     * and whoever checked them in.
     */
    @Transactional(readOnly = true)
    public List<MyVisitResponse> myVisits(UUID actorUserId) {
        List<Visit> visits = visitRepository.findByProspectUserIdAndStatusNotOrderByVisitDateDescSlotStartMinuteDesc(
                actorUserId, VisitStatus.CANCELLED);
        if (visits.isEmpty()) {
            return List.of();
        }
        Map<UUID, PropertyResponse> properties = propertyModule
                .findActiveProperties(visits.stream().map(Visit::getPropertyId).collect(Collectors.toSet()))
                .stream()
                .collect(Collectors.toMap(PropertyResponse::id, property -> property));
        Map<UUID, EnquirySnapshot> enquiries = enquiryModule.findSnapshots(visits.stream()
                .map(Visit::getEnquiryId)
                .filter(id -> id != null)
                .collect(Collectors.toSet()));
        Set<UUID> receivers = visits.stream()
                .map(Visit::getCheckedInByUserId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        Map<UUID, UserSummaryResponse> users = receivers.isEmpty() ? Map.of() : authModule.findByIds(receivers);
        LocalDate today = now().toLocalDate();
        Instant instant = Instant.now();
        return visits.stream()
                // A property that is gone takes its visits off the list.
                .filter(visit -> properties.containsKey(visit.getPropertyId()))
                .map(visit -> {
                    EnquirySnapshot enquiry = enquiries.get(visit.getEnquiryId());
                    PropertyResponse property = properties.get(visit.getPropertyId());
                    return new MyVisitResponse(
                            visit.getId(),
                            visit.getReferenceCode(),
                            visit.getEnquiryId(),
                            visit.getPropertyId(),
                            property.name(),
                            directionsTo(property),
                            visit.getVisitDate(),
                            visit.getSlotStart(),
                            visit.getSlotEnd(),
                            VisitCardState.of(visit, today),
                            instantOf(visit.passOpensAt()),
                            instantOf(visit.passClosesAt()),
                            instantOf(visit.slotStartsAt()),
                            instantOf(visit.runningLateFrom()),
                            instantOf(visit.slotEndsAt()),
                            visit.getCheckedInAt(),
                            nameOf(users, visit.getCheckedInByUserId()),
                            visit.getCheckInMethod(),
                            visit.arrivedLate(),
                            visit.getNoVisitAt(),
                            visit.getNoVisitAt() == null ? null : visit.getNoVisitAt().plus(Visit.STILL_INTERESTED_FOR),
                            visit.getRunningLateAt(),
                            enquiry != null && !enquiry.isOver(instant),
                            visit.getVersion());
                })
                .toList();
    }

    /**
     * A Google Maps directions link to the property, with no origin: the app
     * starts from where the visitor is (user, 2026-10-04).
     *
     * <p>The destination is the listing's own, so both lead to the same door:
     * the address as filed when there is one, the pin otherwise. It is the
     * rule of discovery's {@code DiscoveryGeoSupport.propertyDirectionsUrl},
     * kept here because one module does not reach into another's internals.
     */
    static String directionsTo(PropertyResponse property) {
        String address = java.util.stream.Stream
                .of(property.address(), property.area(), property.city(), property.state(), property.pincode())
                .filter(part -> part != null && !part.isBlank())
                .map(String::trim)
                .collect(Collectors.joining(", "));
        String destination = !address.isEmpty()
                ? java.net.URLEncoder.encode(address, java.nio.charset.StandardCharsets.UTF_8)
                : property.latitude() != null && property.longitude() != null
                        ? property.latitude().toPlainString() + "," + property.longitude().toPlainString()
                        : null;
        return destination == null ? null : "https://www.google.com/maps/dir/?api=1&destination=" + destination;
    }

    /** The slots the property offers on this date, in order. Empty when it has set none for that weekday. */
    private List<PropertyVisitsResponse.TodaySlot> slotsOn(UUID propertyId, LocalDate date) {
        List<PropertyVisitsResponse.TodaySlot> slots = new ArrayList<>();
        for (PropertyVisitSlotsResponse.VisitDay day : propertyModule.findVisitSlots(propertyId).days()) {
            if (day.day() != date.getDayOfWeek()) {
                continue;
            }
            for (PropertyVisitSlotsResponse.Slot slot : day.slots()) {
                LocalDateTime startsAt = date.atTime(slot.startTime());
                // A slot can end at midnight, which is the start of the next day.
                LocalDateTime endsAt = slot.endTime().isAfter(slot.startTime())
                        ? date.atTime(slot.endTime())
                        : date.plusDays(1).atStartOfDay();
                slots.add(new PropertyVisitsResponse.TodaySlot(
                        slot.startTime(), slot.endTime(), instantOf(startsAt), instantOf(endsAt),
                        day.visitorsPerSlot()));
            }
        }
        slots.sort(java.util.Comparator.comparing(PropertyVisitsResponse.TodaySlot::start));
        return slots;
    }

    // ---- The pass ----------------------------------------------------------

    /**
     * The visitor's pass for their slot. It opens an hour before the slot and
     * is theirs alone to read.
     *
     * <p>Issued the first time it is opened, straight onto the row: reading a
     * pass must not move the visit's version, or the next person to act on the
     * visit would be refused as holding a stale copy.
     */
    @Transactional
    public VisitPassResponse pass(UUID actorUserId, UUID visitId) {
        Visit visit = find(visitId);
        if (!actorUserId.equals(visit.getProspectUserId())) {
            throw new ForbiddenException("This pass is not yours");
        }
        LocalDateTime now = now();
        if (visit.isCheckedIn()) {
            throw new ValidationException("You are already checked in.");
        }
        if (!visit.isPassOpen(now)) {
            throw new ValidationException(visit.isLive() && now.isBefore(visit.passOpensAt())
                    ? "Your pass opens at " + clockTime(visit.passOpensAt())
                            + (visit.getVisitDate().equals(now.toLocalDate()) ? "" : " on " + DAY.format(visit.getVisitDate()))
                            + "."
                    : "The day of this visit is over, so it has no pass.");
        }
        if (!visit.hasPass()) {
            jdbcTemplate.update(
                    "UPDATE lead.visits SET pass_token = ?, pass_code = ? WHERE id = ? AND pass_token IS NULL",
                    newToken(), newCode(), visitId);
        }
        Map<String, Object> pass = jdbcTemplate.queryForMap(
                "SELECT pass_token, pass_code FROM lead.visits WHERE id = ?", visitId);
        PropertyResponse property = propertyModule.getActiveProperty(visit.getPropertyId());
        return new VisitPassResponse(
                visit.getId(),
                visit.getReferenceCode(),
                property.name(),
                visit.getVisitDate(),
                visit.getSlotStart(),
                visit.getSlotEnd(),
                (String) pass.get("pass_token"),
                (String) pass.get("pass_code"),
                instantOf(visit.passClosesAt()));
    }

    // ---- Checking in -------------------------------------------------------

    /**
     * Marks attendance at the property, with the scanned pass or the code on
     * it. Anyone managing the property may, from the start of the slot until
     * the day is over. They take the visit form with it.
     *
     * <p>No version is asked for. The visitor opening their pass, or moving to
     * a later slot, is exactly when the person at the door holds an older copy,
     * and the pass itself already proves which slot it is for.
     */
    @Transactional
    public VisitCardResponse checkIn(UUID actorUserId, UUID visitId, CheckInVisitRequest request) {
        Visit visit = find(visitId);
        propertyModule.ensureCanManageProperty(actorUserId, visit.getPropertyId());
        boolean byToken = request.token() != null && !request.token().isBlank();
        boolean byCode = request.code() != null && !request.code().isBlank();
        if (!byToken && !byCode) {
            throw new ValidationException("Scan their pass or enter the code on it.");
        }
        LocalDateTime now = now();
        if (!visit.isCheckedIn() && visit.isCheckInOpen(now)) {
            boolean matches = byToken
                    ? request.token().trim().equals(visit.getPassToken())
                    : request.code().trim().equals(visit.getPassCode());
            if (!matches) {
                throw new ValidationException(byToken
                        ? "That pass does not match this visit."
                        : "That code does not match this visit's pass.");
            }
        }
        // Refuses by itself when they are already in, the slot has not started, or the day is over.
        visit.checkIn(actorUserId, byToken ? VisitCheckInMethod.QR : VisitCheckInMethod.CODE, Instant.now(), now);
        return attended(visit, actorUserId);
    }

    /** The owner marks a visitor who came and was never scanned: after the slot, before midnight. */
    @Transactional
    public VisitCardResponse missedCheckIn(UUID actorUserId, UUID visitId) {
        Visit visit = find(visitId);
        PropertyResponse property = propertyModule.getActiveProperty(visit.getPropertyId());
        if (!property.ownerId().equals(actorUserId)) {
            throw new ForbiddenException("Only the owner can mark a missed check-in");
        }
        visit.markMissedCheckIn(actorUserId, Instant.now(), now());
        return attended(visit, actorUserId);
    }

    private VisitCardResponse attended(Visit visit, UUID actorUserId) {
        Visit saved = visitRepository.saveAndFlush(visit);
        leadActivityRepository.save(LeadActivity.by(
                actorUserId, saved.getLeadId(), LeadActivityType.VISIT_ATTENDED, saved.getEnquiryId(),
                LeadVisitService.when(saved), saved.getCheckedInAt()));
        // The visitor, the owner and every manager are told (user, 2026-10-04).
        notifier.tellOfCheckIn(saved);
        log.info("Visit checked in visitId={} code={} method={} byUserId={}",
                saved.getId(), saved.getReferenceCode(), saved.getCheckInMethod(), actorUserId);
        return cardOf(saved, actorUserId);
    }

    /**
     * The visit form: when they left, how many came, what they made of the
     * place. Whoever checked them in fills it, or the owner.
     */
    @Transactional
    public VisitCardResponse completeForm(UUID actorUserId, UUID visitId, VisitFormRequest request) {
        Visit visit = find(visitId);
        propertyModule.ensureCanManageProperty(actorUserId, visit.getPropertyId());
        if (!visit.isCheckedIn()) {
            throw new ValidationException("Check them in before filling the visit form.");
        }
        PropertyResponse property = propertyModule.getActiveProperty(visit.getPropertyId());
        if (!actorUserId.equals(visit.getCheckedInByUserId()) && !actorUserId.equals(property.ownerId())) {
            String checker = authModule.findById(visit.getCheckedInByUserId())
                    .map(UserSummaryResponse::fullName)
                    .orElse("whoever checked them in");
            throw new ValidationException("Only " + checker + ", who checked them in, or the owner fills this in.");
        }
        visit.completeForm(
                actorUserId, request.departedAt(), request.partySize(), request.impression(), Instant.now());
        return cardOf(visitRepository.saveAndFlush(visit), actorUserId);
    }

    /**
     * "I'm on my way": the visitor says they are running late, once half their
     * slot has gone. The owner and every manager are told, once, and the visit
     * is left out of the notice that attendance was not marked.
     */
    @Transactional
    public void runningLate(UUID actorUserId, UUID visitId) {
        Visit visit = find(visitId);
        if (!actorUserId.equals(visit.getProspectUserId())) {
            throw new ForbiddenException("This visit is not yours");
        }
        if (visit.markRunningLate(Instant.now(), now())) {
            notifier.tellOfRunningLate(visitRepository.saveAndFlush(visit));
            log.info("Visitor running late visitId={} code={}", visit.getId(), visit.getReferenceCode());
        }
    }

    /**
     * One visit that happened and whose leaving nobody recorded, the day
     * after: they left when their slot ended. Called by the sweep.
     *
     * @return true when the time was taken now
     */
    @Transactional
    public boolean closeDeparture(UUID visitId, LocalDate today) {
        return visitRepository.findById(visitId).map(visit -> visit.assumeLeftAtSlotEnd(today)).orElse(false);
    }

    // ---- No visit ----------------------------------------------------------

    /**
     * One visit nobody checked in, the day after: No visit. Called by the
     * sweep, a visit per transaction.
     *
     * @return true when it was marked now
     */
    @Transactional
    public boolean markNoVisit(UUID visitId, LocalDate today) {
        Visit visit = visitRepository.findById(visitId).orElse(null);
        Instant now = Instant.now();
        if (visit == null || !visit.markNoVisit(now, today)) {
            return false;
        }
        leadActivityRepository.save(LeadActivity.bySystem(
                visit.getLeadId(), LeadActivityType.VISIT_MISSED, visit.getProspectUserId(), visit.getEnquiryId(),
                LeadVisitService.when(visit), now));
        return true;
    }

    /**
     * A No visit whose week has run out with the visitor saying nothing: the
     * enquiry expires and the record ends. Called by the sweep.
     *
     * @return true when it ended now
     */
    @Transactional
    public boolean expireUnanswered(UUID visitId) {
        Visit visit = visitRepository.findById(visitId).orElse(null);
        if (visit == null || visit.getStatus() != VisitStatus.NOT_VISITED || visit.getNoVisitAt() == null
                || visit.getNoVisitAt().plus(Visit.STILL_INTERESTED_FOR).isAfter(Instant.now())) {
            return false;
        }
        return endAfterNoVisit(visit, null);
    }

    /** "Are you still interested?" answered No, by the visitor: the enquiry expires at once. */
    @Transactional
    public void notInterested(UUID actorUserId, UUID visitId) {
        Visit visit = find(visitId);
        if (!actorUserId.equals(visit.getProspectUserId())) {
            throw new ForbiddenException("This visit is not yours");
        }
        if (!visit.isMissed(now().toLocalDate())) {
            throw new ValidationException("This visit was not missed.");
        }
        endAfterNoVisit(visit, actorUserId);
    }

    private boolean endAfterNoVisit(Visit visit, UUID byUserId) {
        if (visit.getEnquiryId() != null) {
            enquiryModule.expireForMissedVisit(visit.getEnquiryId());
        }
        Lead lead = leadRepository.findById(visit.getLeadId()).orElse(null);
        Instant now = Instant.now();
        if (lead == null || !lead.close(LeadCloseReason.NO_ANSWER_AFTER_MISSED_VISIT, now)) {
            return false;
        }
        String reason = LeadCloseReason.NO_ANSWER_AFTER_MISSED_VISIT.name();
        leadActivityRepository.save(byUserId == null
                ? LeadActivity.bySystem(lead.getId(), LeadActivityType.CLOSED, null, visit.getEnquiryId(), reason, now)
                : LeadActivity.by(byUserId, lead.getId(), LeadActivityType.CLOSED, visit.getEnquiryId(), reason, now));
        log.info("Lead closed after a missed visit leadId={} visitId={} answered={}",
                lead.getId(), visit.getId(), byUserId != null);
        return true;
    }

    // ---- Cards -------------------------------------------------------------

    private VisitCardResponse cardOf(Visit visit, UUID viewerUserId) {
        Map<UUID, EnquirySnapshot> enquiries = visit.getEnquiryId() == null
                ? Map.of()
                : enquiryModule.findSnapshots(List.of(visit.getEnquiryId()));
        PropertyResponse property = propertyModule.getActiveProperty(visit.getPropertyId());
        return card(
                visit, enquiries.get(visit.getEnquiryId()),
                authModule.findByIds(peopleOn(List.of(visit), enquiries)),
                viewerUserId, property.ownerId(), now().toLocalDate());
    }

    private static Set<UUID> peopleOn(List<Visit> visits, Map<UUID, EnquirySnapshot> enquiries) {
        Set<UUID> ids = new HashSet<>();
        for (Visit visit : visits) {
            ids.add(visit.getProspectUserId());
            if (visit.getCheckedInByUserId() != null) {
                ids.add(visit.getCheckedInByUserId());
            }
        }
        enquiries.values().stream()
                .map(EnquirySnapshot::handlerUserId)
                .filter(handler -> handler != null)
                .forEach(ids::add);
        return ids;
    }

    /** The card a visit leaves behind on the day it was moved off: the slot it left, and where it went. */
    private static VisitCardResponse rescheduledCard(Visit visit, VisitCardResponse now) {
        LocalDateTime leftStart = visit.getMovedFromDate().atStartOfDay().plusMinutes(visit.getMovedFromSlotStartMinute());
        LocalDateTime leftEnd = visit.getMovedFromDate().atStartOfDay().plusMinutes(visit.getMovedFromSlotEndMinute());
        return new VisitCardResponse(
                now.visitId(),
                now.referenceCode(),
                now.enquiryId(),
                now.prospectName(),
                visit.getMovedFromDate(),
                leftStart.toLocalTime(),
                visit.getMovedFromSlotEndMinute() >= 1440 ? java.time.LocalTime.MAX : leftEnd.toLocalTime(),
                instantOf(leftStart),
                instantOf(leftEnd),
                VisitCardState.RESCHEDULED,
                null, null, null, null, null, false, false, null, null, null,
                now.handlerUserId(),
                now.handlerName(),
                null,
                null,
                now.date(),
                now.slotStart(),
                now.placedAt(),
                now.version());
    }

    private static VisitCardResponse card(
            Visit visit, EnquirySnapshot enquiry, Map<UUID, UserSummaryResponse> users,
            UUID viewerUserId, UUID ownerUserId, LocalDate today) {
        UUID handler = enquiry == null ? null : enquiry.handlerUserId();
        return new VisitCardResponse(
                visit.getId(),
                visit.getReferenceCode(),
                visit.getEnquiryId(),
                nameOf(users, visit.getProspectUserId()),
                visit.getVisitDate(),
                visit.getSlotStart(),
                visit.getSlotEnd(),
                instantOf(visit.slotStartsAt()),
                instantOf(visit.slotEndsAt()),
                VisitCardState.of(visit, today),
                visit.getCheckedInAt(),
                visit.getCheckedInByUserId(),
                nameOf(users, visit.getCheckedInByUserId()),
                visit.getCheckInMethod(),
                visit.arrivedLate(),
                visit.isFormCompleted(),
                visit.isCheckedIn()
                        && (viewerUserId.equals(visit.getCheckedInByUserId()) || viewerUserId.equals(ownerUserId)),
                visit.getDepartedAt(),
                visit.getPartySize(),
                visit.getImpression(),
                handler,
                nameOf(users, handler),
                visit.getNoVisitAt(),
                visit.getRunningLateAt(),
                null,
                null,
                visit.getMovedAt() != null ? visit.getMovedAt() : visit.getCreatedAt(),
                visit.getVersion());
    }

    private Visit find(UUID visitId) {
        return visitRepository.findById(visitId).orElseThrow(() -> new NotFoundException("Visit", visitId));
    }

    private static String nameOf(Map<UUID, UserSummaryResponse> users, UUID userId) {
        return userId == null
                ? null
                : Optional.ofNullable(users.get(userId)).map(UserSummaryResponse::fullName).orElse(null);
    }

    private static Instant instantOf(LocalDateTime inIndia) {
        return inIndia.atZone(IST).toInstant();
    }

    private static String clockTime(LocalDateTime at) {
        return TIME.format(at).toLowerCase(Locale.ENGLISH);
    }

    private static String newToken() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        StringBuilder token = new StringBuilder(48);
        for (byte value : bytes) {
            token.append(String.format("%02x", value));
        }
        return token.toString();
    }

    /** Six digits, never starting with a zero, so it reads the same typed or spoken. */
    private static String newCode() {
        return String.valueOf(100_000 + RANDOM.nextInt(900_000));
    }
}
