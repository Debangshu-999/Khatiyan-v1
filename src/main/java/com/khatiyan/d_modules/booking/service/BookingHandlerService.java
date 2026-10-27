package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingAssignmentMode;
import com.khatiyan.d_modules.booking.model.BookingHandlerAssignment;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingRequestAction;
import com.khatiyan.d_modules.booking.model.BookingSettings;
import com.khatiyan.d_modules.booking.repository.BookingRequestActionRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;
import com.khatiyan.d_modules.booking.repository.BookingSettingsRepository;
import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

import lombok.extern.slf4j.Slf4j;

/**
 * Who handles a booking request (user's rules, 2026-10-09).
 *
 * <p>The owner chooses between two ways. <b>First to open</b>: a request has no
 * handler until a manager opens its details, and that manager takes it.
 * <b>Turns</b>: each new request goes to the next manager in turn as it
 * arrives. Either way the owner may act on any request, and only managers on
 * the bookings access list are ever in the running.
 *
 * <p>Grants change without telling this module, so a stored handler counts only
 * while they still hold the grant. One who lost it is replaced the next time
 * anybody opens the request, and one who left the property is replaced at once.
 *
 * <p><b>Locks.</b> Callers hold the request's row. The settings row is locked
 * here, after it, to take a turn. Never the other way round.
 */
@Slf4j
@Service
public class BookingHandlerService {

    private final BookingSettingsRepository settingsRepository;
    private final BookingRequestRepository requests;
    private final BookingRequestActionRepository actions;
    private final PropertyModule properties;
    private final Clock clock;
    private final BookingAnnouncer announcer;

    public BookingHandlerService(BookingSettingsRepository settingsRepository, BookingRequestRepository requests,
            BookingRequestActionRepository actions, PropertyModule properties, Clock clock,
            BookingAnnouncer announcer) {
        this.settingsRepository = settingsRepository;
        this.requests = requests;
        this.actions = actions;
        this.properties = properties;
        this.clock = clock;
        this.announcer = announcer;
    }

    /**
     * The people who can handle a property's bookings today, and how a new
     * request finds one of them: read once per call and passed around.
     */
    public record Team(UUID ownerUserId, List<UUID> managersWithGrant, BookingAssignmentMode mode) {

        public UUID effectiveHandler(UUID storedHandler) {
            return BookingHandlerRules.effectiveHandler(storedHandler, ownerUserId, managersWithGrant);
        }

        /**
         * Whether this person may answer the request now. Its handler and the
         * owner may. So may anyone who could take it by answering, where the
         * first to respond handles it and nobody does yet.
         */
        public boolean mayAct(UUID actorUserId, UUID storedHandler) {
            return BookingHandlerRules.mayRespond(mode, actorUserId, ownerUserId, storedHandler, managersWithGrant);
        }

        /** Everyone a request can be handled by today: the owner and the managers with the grant. Never empty. */
        public List<UUID> canHandle() {
            List<UUID> everyone = new java.util.ArrayList<>(managersWithGrant);
            // A property switched off has nobody. An id nobody has keeps the list from being empty in a query.
            everyone.add(ownerUserId != null ? ownerUserId : new UUID(0L, 0L));
            return everyone;
        }
    }

    /**
     * A property that has since been switched off has no team: its old
     * requests still read, with no handler and nobody on its side to act.
     */
    @Transactional(readOnly = true)
    public Team teamOf(UUID propertyId) {
        UUID owner = properties.findActiveProperties(List.of(propertyId)).stream()
                .map(property -> property.ownerId())
                .findFirst()
                .orElse(null);
        if (owner == null) {
            return new Team(null, List.of(), BookingAssignmentMode.FIRST_VIEW);
        }
        // A property that has saved no settings takes the default: the first to respond handles it.
        BookingAssignmentMode mode = settingsRepository.findById(propertyId)
                .map(BookingSettings::getAssignmentMode)
                .orElse(BookingAssignmentMode.FIRST_VIEW);
        return new Team(owner, properties.findActiveManagerUserIdsWhoManage(propertyId, ManagerResource.BOOKINGS),
                mode);
    }

    /**
     * A request that has just been sent. Where the system takes turns it gets
     * its handler now. Where the first to open handles it, it waits for them.
     */
    @Transactional
    public void assignOnArrival(BookingRequest request, Instant now) {
        BookingSettings settings = settingsRepository.findByPropertyIdForUpdate(request.getPropertyId()).orElse(null);
        if (settings == null || settings.getAssignmentMode() != BookingAssignmentMode.SYSTEM_TURNS) {
            return;
        }
        giveNextTurn(request, settings, teamOf(request.getPropertyId()), now);
    }

    /**
     * Somebody on the property's side opened the details of a request that is
     * still going. The caller holds the request's row.
     *
     * <p>Opening takes nothing where the first to respond handles a request
     * (user, 2026-10-11). It only tidies: a name left by a handler who lost
     * the grant is cleared, and where the system assigns, a request nobody
     * has is given its turn.
     *
     * @return true when the request's handler changed
     */
    @Transactional
    public boolean onOpen(BookingRequest request, UUID actorUserId, Instant now) {
        Team team = teamOf(request.getPropertyId());
        if (team.effectiveHandler(request.getHandlerUserId()) != null) {
            return false;
        }
        // Nobody handles it today: never assigned, or its handler lost the grant.
        BookingSettings settings = settingsRepository.findByPropertyIdForUpdate(request.getPropertyId()).orElse(null);
        BookingAssignmentMode mode = settings == null ? BookingAssignmentMode.FIRST_VIEW : settings.getAssignmentMode();
        if (mode == BookingAssignmentMode.SYSTEM_TURNS) {
            return giveNextTurn(request, settings, team, now);
        }
        // Whoever answers it first will take it. Until then a name left on it by a
        // handler who lost the grant is cleared, so the lists stop showing it.
        return unassign(request, now);
    }

    /**
     * Somebody on the property's side is answering a request: accepting,
     * countering, declining, or acting on its token. Where the first to
     * respond handles a request and nobody does yet, this answer makes them
     * its handler (user, 2026-10-11). The caller holds the request's row, so
     * two people answering together are taken in turn and only one takes it.
     *
     * <p>The version the screen loaded is checked here, before the handler is
     * written. Writing it changes the row, and a check made afterwards would
     * find the request newer than the screen and refuse the very answer that
     * took it.
     *
     * @return true when this answer made them its handler
     */
    @Transactional
    public boolean onRespond(BookingRequest request, UUID actorUserId, Team team) {
        if (!BookingHandlerRules.claimsOnResponse(team.mode(), actorUserId, team.ownerUserId(),
                request.getHandlerUserId(), team.managersWithGrant())) {
            return false;
        }
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        VersionGuard.claim(request);
        request.assignHandler(actorUserId, BookingHandlerAssignment.FIRST_VIEW, now);
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.ASSIGNED, BookingParty.MANAGEMENT,
                actorUserId, null, request.getStatus(), null, now));
        log.info("Booking request taken by its first responder requestId={} handlerUserId={}",
                request.getId(), actorUserId);
        announcer.changed(request);
        return true;
    }

    /**
     * A manager left the property. What they were handling is handed on: to
     * the next in turn, or back to whoever opens it first. Safe to run twice:
     * the second run finds nothing in their name.
     *
     * @return how many requests were handed on
     */
    @Transactional
    public int handOn(UUID propertyId, UUID managerUserId) {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        int handedOn = 0;
        for (UUID requestId : requests.findStoredOpenIdsHandledBy(propertyId, managerUserId)) {
            BookingRequest request = requests.findByIdForUpdate(requestId).orElse(null);
            if (request == null || !managerUserId.equals(request.getHandlerUserId()) || !request.isOpenAt(now)) {
                continue;
            }
            BookingSettings settings = settingsRepository.findByPropertyIdForUpdate(propertyId).orElse(null);
            boolean turns = settings != null && settings.getAssignmentMode() == BookingAssignmentMode.SYSTEM_TURNS;
            if (turns ? giveNextTurn(request, settings, teamOf(propertyId), now) : unassign(request, now)) {
                handedOn++;
            }
        }
        if (handedOn > 0) {
            log.info("Booking requests handed on propertyId={} fromManagerUserId={} count={}",
                    propertyId, managerUserId, handedOn);
        }
        return handedOn;
    }

    private boolean giveNextTurn(BookingRequest request, BookingSettings settings, Team team, Instant now) {
        UUID next = settings.takeNextTurn(BookingHandlerRules.turnOrder(
                team.managersWithGrant(), team.ownerUserId(), settings.isIncludeOwnerInTurns()));
        if (next == null || next.equals(request.getHandlerUserId())) {
            return false;
        }
        request.assignHandler(next, BookingHandlerAssignment.SYSTEM, now);
        actions.save(BookingRequestAction.bySystem(request.getId(), BookingActionType.ASSIGNED,
                request.getStatus(), null, now));
        log.info("Booking request given its turn requestId={} handlerUserId={}", request.getId(), next);
        announcer.changed(request);
        return true;
    }

    private boolean unassign(BookingRequest request, Instant now) {
        if (request.getHandlerUserId() == null) {
            return false;
        }
        request.clearHandler();
        actions.save(BookingRequestAction.bySystem(request.getId(), BookingActionType.UNASSIGNED,
                request.getStatus(), null, now));
        log.info("Booking request back to its first viewer requestId={}", request.getId());
        announcer.changed(request);
        return true;
    }
}
