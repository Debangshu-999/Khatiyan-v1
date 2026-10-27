package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.booking.api.dto.BookingBedOptionResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingFormOptionsResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestCountsResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestListItemResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.CreateBookingRequest;
import com.khatiyan.d_modules.booking.model.BookingAction;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingBedOffer;
import com.khatiyan.d_modules.booking.model.BookingMoveInAction;
import com.khatiyan.d_modules.booking.model.BookingMoveInWindow;
import com.khatiyan.d_modules.booking.model.BookingOffer;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingRequestAction;
import com.khatiyan.d_modules.booking.model.BookingRequestOffer;
import com.khatiyan.d_modules.booking.model.BookingSettings;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTiming;
import com.khatiyan.d_modules.booking.model.BookingToken;
import com.khatiyan.d_modules.booking.model.BookingTokenAction;
import com.khatiyan.d_modules.booking.model.BookingTokenClaim;
import com.khatiyan.d_modules.booking.model.BookingTokenTerms;
import com.khatiyan.d_modules.booking.repository.BookingBedOfferRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestActionRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestOfferRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;
import com.khatiyan.d_modules.booking.repository.BookingTokenClaimRepository;
import com.khatiyan.d_modules.booking.repository.BookingTokenRepository;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.enquiry.api.dto.PostVisitBookingEligibility;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.ManagerResource;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.BookingFutureVacancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Booking requests: sending one, reading them, and ending the ones nobody
 * agreed in time (user's rules, 2026-10-09).
 *
 * <p><b>A request holds one bed from the moment it is sent</b> (user,
 * 2026-10-10), so a bed is asked for by one person at a time. The bed is
 * reserved in the transaction that creates the request, and freed in the
 * transaction that ends it, whatever ended it.
 *
 * <p><b>Locks, always in this order:</b> the person, then every request row
 * the write will touch, then the property's inventory. A room is read only
 * once that last one is held: read earlier, it is a copy another request may
 * already have changed. Every later booking write must keep to this order.
 *
 * <p><b>Nothing in the request body is trusted for who or where.</b> The person
 * is the signed-in account. The property and the attended visit are read from
 * the enquiry, which must be that person's own.
 *
 * <p>On the property's side, the owner and the managers on the bookings
 * access list may read. Only the owner and a request's handler may act on it,
 * see {@link BookingHandlerService}.
 */
@Slf4j
@Service
public class BookingRequestService {

    private static final int MAX_PAGE_SIZE = 50;

    private final BookingRequestRepository requests;
    private final BookingRequestOfferRepository offers;
    private final BookingRequestActionRepository actions;
    private final BookingTokenRepository tokens;
    private final BookingTokenClaimRepository tokenClaims;
    private final BookingBedOfferRepository bedOffers;
    private final BookingSettingsService settingsService;
    private final BookingProspectLock prospectLock;
    private final BookingHandlerService handlers;
    private final BookingInventoryService inventory;
    private final BookingPolicy policy;
    private final EnquiryModule enquiries;
    private final PropertyModule properties;
    private final TenancyModule tenancies;
    private final AuthModule auth;
    private final ReferenceCodeGenerator referenceCodes;
    private final Clock clock;
    private final BookingAnnouncer announcer;

    public BookingRequestService(
            BookingRequestRepository requests,
            BookingRequestOfferRepository offers,
            BookingRequestActionRepository actions,
            BookingTokenRepository tokens,
            BookingTokenClaimRepository tokenClaims,
            BookingBedOfferRepository bedOffers,
            BookingSettingsService settingsService,
            BookingProspectLock prospectLock,
            BookingHandlerService handlers,
            BookingInventoryService inventory,
            BookingPolicy policy,
            EnquiryModule enquiries,
            PropertyModule properties,
            TenancyModule tenancies,
            AuthModule auth,
            ReferenceCodeGenerator referenceCodes,
            Clock clock,
            BookingAnnouncer announcer) {
        this.requests = requests;
        this.offers = offers;
        this.actions = actions;
        this.tokens = tokens;
        this.tokenClaims = tokenClaims;
        this.bedOffers = bedOffers;
        this.settingsService = settingsService;
        this.prospectLock = prospectLock;
        this.handlers = handlers;
        this.inventory = inventory;
        this.policy = policy;
        this.enquiries = enquiries;
        this.properties = properties;
        this.tenancies = tenancies;
        this.auth = auth;
        this.referenceCodes = referenceCodes;
        this.clock = clock;
        this.announcer = announcer;
    }

    // ---- Sending a request ---------------------------------------------------

    @Transactional
    public BookingRequestResponse create(UUID tenantUserId, CreateBookingRequest input) {
        if (input == null || input.enquiryId() == null || input.roomId() == null || input.moveInDate() == null
                || input.idempotencyKey() == null || input.idempotencyKey().isBlank()) {
            throw new ValidationException("Choose a room and a move-in date.");
        }
        // Before any count is read: two taps at once must not both pass the same check.
        prospectLock.acquire(tenantUserId);
        Instant now = now();

        BookingRequest retried = requests
                .findByProspectUserIdAndIdempotencyKey(tenantUserId, input.idempotencyKey().strip())
                .orElse(null);
        if (retried != null) {
            // The same tap of Send, arriving twice. Nothing new is written.
            return detail(retried, BookingParty.TENANT, tenantUserId, now);
        }

        PostVisitBookingEligibility eligibility = enquiries.bookingEligibilityFor(tenantUserId, input.enquiryId());
        if (!eligibility.eligible()) {
            throw new ValidationException(whyNotEligible(eligibility.reason()));
        }
        UUID propertyId = eligibility.propertyId();
        PropertyResponse property = properties.getActiveProperty(propertyId);
        BookingSettings settings = settingsService.find(propertyId)
                .orElseThrow(() -> new ValidationException("This property is not available for booking yet."));

        clearTheWay(tenantUserId, propertyId, input.roomId(), now);
        // Every request row this write touches is locked. Now the property's
        // inventory, held to the end, so the room read below is the room as it is.
        properties.lockRoomInventory(propertyId);
        requireFreeToAsk(tenantUserId, propertyId, now);
        int visitSlot = nextVisitSlot(eligibility.visitId(), eligibility.enquiryId());

        BookingTiming open = policy.timingFor(now, settings.getMaximumAdvanceDays());
        String name = input.name() == null ? "" : input.name().strip();
        if (name.isEmpty()) {
            throw new ValidationException("Enter your name.");
        }
        String phone = auth.normalizePhone(input.phone());
        String email = input.email() == null || input.email().isBlank() ? null : input.email().strip();
        BookingPolicy.requireGenderFits(property.pgFor(), input.gender());
        policy.requireAdult(input.dateOfBirth(), open);
        policy.requireAgreementValidity(input.agreementMonths());

        RoomResponse room = properties.getActiveRoom(propertyId, input.roomId());
        BookingMoveInWindow selectable = selectableDates(settings, room, input.exitRequestId(), open);
        policy.requireMoveInDate(selectable, input.moveInDate());
        requireCurrentStayEndsFirst(tenantUserId, propertyId, input.moveInDate());
        BookingTiming timing = policy.timingFor(now, settings.getMaximumAdvanceDays(), input.moveInDate());

        BookingOffer firstOffer = BookingOffer.tenantProposal(
                input.proposedRentPaise() != null ? input.proposedRentPaise() : room.baseRentPaise());

        BookingRequest request = BookingRequest.submit(new BookingRequest.Submission(
                referenceCodes.nextCode("BKG"), propertyId, tenantUserId, eligibility.enquiryId(),
                eligibility.visitId(), visitSlot, input.idempotencyKey().strip(), property.name(), room.id(),
                room.roomNumber(), input.exitRequestId(), room.baseRentPaise(), property.standardDepositPaise(),
                settings.tokenTerms(), name, phone, email, input.gender(), input.dateOfBirth(), timing,
                input.moveInDate(), input.agreementMonths(), firstOffer));
        try {
            // The bed is held from here.
            inventory.reserve(request.getId(), propertyId, room.id(), timing, input.moveInDate(),
                    input.exitRequestId());
        } catch (ValidationException | NotFoundException taken) {
            throw new ValidationException("That bed is no longer free. Choose another bed or room.");
        }
        try {
            request = requests.saveAndFlush(request);
        } catch (DataIntegrityViolationException raced) {
            // The unique indexes are the backstop behind the checks above.
            throw new ValidationException("You already have a booking request here. Refresh to see it.");
        }
        announcer.changed(request);
        offers.save(BookingRequestOffer.of(request.getId(), 1, firstOffer, tenantUserId, now));
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.SUBMITTED, BookingParty.TENANT,
                tenantUserId, 1, BookingStatus.AWAITING_HANDLER, null, now));
        // Where the system takes turns it has its handler from the start.
        handlers.assignOnArrival(request, now);

        log.info("Booking request sent requestId={} reference={} propertyId={} roomId={} prospectUserId={}"
                + " moveInDate={} futureBed={} visitSlot={}",
                request.getId(), request.getReferenceCode(), propertyId, room.id(), tenantUserId,
                request.getMoveInDate(), request.isFutureBed(), visitSlot);
        return detail(request, BookingParty.TENANT, tenantUserId, now);
    }

    /**
     * The requests that stand between this person and the bed: their own open
     * one at the property, and any on this room that has run out of time and
     * still holds a bed. A request out of time is over, but it keeps its bed
     * and its place in the unique index until something writes that down. It
     * is written here, so the bed is the next person's the moment the last one
     * ran out, and not an hour later when the sweep comes round.
     */
    private void clearTheWay(UUID tenantUserId, UUID propertyId, UUID roomId, Instant now) {
        boolean sweptOne = false;
        for (BookingRequest inTheWay : requests.findInTheWayForUpdate(tenantUserId, propertyId, roomId, now)) {
            if (expire(inTheWay, now)) {
                sweptOne = true;
            } else if (tenantUserId.equals(inTheWay.getProspectUserId())) {
                throw new ValidationException(
                        "You already have a booking request at this property. Open it to see where it stands.");
            }
        }
        if (sweptOne) {
            // Hibernate writes inserts before updates. The expiry has to reach
            // the database before the new row meets the unique index.
            requests.flush();
        }
    }

    /**
     * What turns on who is asking, before any room or date is looked at, so
     * the person is told the reason that actually stops them.
     */
    private void requireFreeToAsk(UUID tenantUserId, UUID propertyId, Instant now) {
        if (requests.existsByProspectUserIdAndStatus(tenantUserId, BookingStatus.CONFIRMED)) {
            throw new ValidationException("You already have a confirmed booking. You can send a new request"
                    + " once that stay is over or the booking is cancelled.");
        }
        if (requests.existsByProspectUserIdAndPropertyIdAndCooldownUntilAfter(tenantUserId, propertyId, now)) {
            throw new ValidationException("You cancelled a confirmed booking at this property recently,"
                    + " so you cannot send a new request here yet.");
        }
    }

    /** A visit gives two requests. A slot comes back when the property never answered or cancelled after agreeing. */
    /**
     * The next of the two requests a visit allows. A stay booked straight from
     * the property profile has no visit, and its two are counted by its
     * enquiry (user, 2026-10-17).
     */
    private int nextVisitSlot(UUID visitId, UUID enquiryId) {
        List<Integer> used = visitId != null ? requests.findUsedVisitSlots(visitId) : requests.findUsedDirectSlots(enquiryId);
        for (int slot = 1; slot <= BookingPolicy.MAX_REQUESTS_PER_VISIT; slot++) {
            if (!used.contains(slot)) {
                return slot;
            }
        }
        throw new ValidationException(visitId != null
                ? "You have used both booking requests for this visit."
                : "You have used both booking requests. Book a visit to ask again.");
    }

    /**
     * The dates this bed can be asked for. A bed that is free today takes any
     * date inside the bounds. One being vacated starts the day after the
     * approved checkout, and is offered only where the owner shows such beds.
     * A bed somebody else has asked for is not free, and is not listed.
     */
    private BookingMoveInWindow selectableDates(
            BookingSettings settings, RoomResponse room, UUID exitRequestId, BookingTiming open) {
        if (room.status() == RoomStatus.MAINTENANCE) {
            throw new ValidationException("This room is under maintenance and cannot be booked right now.");
        }
        if (exitRequestId == null) {
            if (room.availableVacancies() <= 0) {
                throw new ValidationException(
                        "No bed in this room is free. Choose a bed that is becoming free, or another room.");
            }
            return policy.liveMoveInWindow(open);
        }
        if (!settings.isShowFutureVacancies()) {
            throw new ValidationException("This property takes requests only for beds that are free today.");
        }
        BookingFutureVacancyResponse vacating = tenancies
                .bookingFutureVacancies(room.propertyId(), open.earliestMoveInDate(), open.latestMoveInDate())
                .stream()
                .filter(option -> option.exitRequestId().equals(exitRequestId) && option.roomId().equals(room.id()))
                .findFirst()
                .orElseThrow(() -> new ValidationException("That bed is no longer becoming free. Choose another."));
        return new BookingMoveInWindow(vacating.earliestMoveInDate(), vacating.latestMoveInDate());
    }

    /**
     * Someone already staying somewhere on the app may ask only for after
     * their approved checkout. One stay per person is an app-wide rule, so a
     * move-in before the old stay ends could never be honoured.
     */
    private void requireCurrentStayEndsFirst(UUID tenantUserId, UUID propertyId, LocalDate moveInDate) {
        CurrentStay stay = currentStayOf(tenantUserId, propertyId);
        if (stay.refusal() != null) {
            throw new ValidationException(stay.refusal());
        }
        if (stay.endsOn() != null && !moveInDate.isAfter(stay.endsOn())) {
            throw new ValidationException("Choose a move-in date after " + stay.endsOn()
                    + ", when your current stay ends.");
        }
    }

    /**
     * What a person's stay, anywhere on the app, allows them to book. Sending
     * a request and the form's own read both ask here, so the form never
     * offers what sending would refuse.
     *
     * @param refusal why they cannot book at this property at all, or null
     * @param endsOn  the last day of a stay elsewhere, which a move-in must
     *                come after: an approved notice's date, or a fixed term's
     *                own end. Null where there is no stay
     */
    private record CurrentStay(String refusal, LocalDate endsOn) {
    }

    private CurrentStay currentStayOf(UUID tenantUserId, UUID propertyId) {
        TenancyResponse stay = tenancies.findActiveByUserId(tenantUserId).orElse(null);
        if (stay == null) {
            return new CurrentStay(null, null);
        }
        if (propertyId.equals(stay.propertyId())) {
            return new CurrentStay("You already stay at this property.", null);
        }
        // The stay's own one rule for when it ends: a notice's date, else its
        // planned end. A fixed term carries its last day as the planned end from
        // the day it begins, with no exit to approve. Reading the notice's date
        // alone told a tenant on a fixed term that their stay had no end (found
        // by the user, 2026-10-10), the mistake the tenancy module's rule exists
        // to stop.
        LocalDate endsOn = stay.checkoutDate();
        if (endsOn == null) {
            return new CurrentStay("Your current stay has no approved move-out date yet."
                    + " Ask that property to approve your exit, then send this request.", null);
        }
        return new CurrentStay(null, endsOn);
    }

    /**
     * How many of a visit's two requests are used, counted as sending one
     * would count them. A request that ran out of time on the property's turn
     * gives its slot back, and it does so whether or not that has been
     * written down yet.
     */
    private int visitSlotsInUse(UUID visitId, UUID enquiryId, Instant now) {
        List<BookingRequest> slotted = visitId != null
                ? requests.findByVisitIdAndVisitSlotIsNotNull(visitId)
                : requests.findByEnquiryIdAndVisitIdIsNullAndVisitSlotIsNotNull(enquiryId);
        return (int) slotted.stream()
                .filter(held -> !(held.getStatus() == BookingStatus.AWAITING_HANDLER && held.isOutOfTime(now)))
                .count();
    }

    private static String whyNotEligible(String reason) {
        return switch (reason == null ? "" : reason) {
            case "ATTENDED_VISIT_REQUIRED", "VISIT_NOT_YET_ATTENDED" ->
                    "You can ask for a booking after you have visited this property.";
            case "BOOKING_WINDOW_EXPIRED" -> "The 30 days to book after your visit have passed.";
            case "BOOKING_WINDOW_CLOSED" -> "Booking is closed for this visit.";
            default -> "This enquiry can no longer be used to ask for a booking.";
        };
    }

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM uuuu", Locale.ENGLISH);

    /**
     * For someone whose stay elsewhere ends after the last day a request sent
     * today may ask for. It says the day the request can be sent from, which
     * is what they need to know, or that this visit's booking window ends
     * before that day comes.
     *
     * <p>It used to read "This property takes bookings only up to" a date. That
     * blamed the property for a limit that is the app's own, gave both dates
     * as 2026-11-15, and left the person asking what to do (the user did,
     * 2026-10-10).
     */
    private static String stayEndsTooLate(LocalDate endsOn, int maximumAdvanceDays, LocalDate windowEndsOn) {
        // The first day a request may ask for the day after the stay ends.
        LocalDate opensOn = endsOn.plusDays(1).minusDays(maximumAdvanceDays);
        String ends = "Your current stay ends on " + DAY.format(endsOn) + ". ";
        if (windowEndsOn != null && opensOn.isAfter(windowEndsOn)) {
            return ends + "That is too far ahead to book from this visit, whose booking window ends on "
                    + DAY.format(windowEndsOn) + ".";
        }
        return ends + "Move-in can be at most " + maximumAdvanceDays + " days ahead, so you can send this request from "
                + DAY.format(opensOn) + ".";
    }

    // ---- The form ------------------------------------------------------------

    /**
     * What the booking form shows for one of the person's own attended
     * visits: whether a request can be sent, the dates it may ask for, the
     * terms a request will freeze, and the beds that can be asked for.
     *
     * <p>Reading it holds nothing. A bed listed here is taken when the request
     * is sent, if it is still free, and every rule is checked again then.
     *
     * <p>A bed being vacated is listed only where the owner shows such beds,
     * and only by its dates. Who is leaving is never sent.
     */
    @Transactional(readOnly = true)
    public BookingFormOptionsResponse formOptions(UUID tenantUserId, UUID enquiryId) {
        Instant now = now();
        PostVisitBookingEligibility eligibility = enquiries.bookingEligibilityFor(tenantUserId, enquiryId);
        if (!eligibility.eligible()) {
            return BookingFormOptionsResponse.closed(eligibility.enquiryId(), eligibility.propertyId(),
                    eligibility.windowEndsOn(), whyNotEligible(eligibility.reason()));
        }
        UUID propertyId = eligibility.propertyId();
        BookingSettings settings = settingsService.find(propertyId).orElse(null);
        if (settings == null) {
            return BookingFormOptionsResponse.closed(eligibility.enquiryId(), propertyId,
                    eligibility.windowEndsOn(), "This property is not available for booking yet.");
        }
        PropertyResponse property = properties.getActiveProperty(propertyId);
        // The owner's own limit, as a request sent now would be given.
        BookingTiming open = policy.timingFor(now, settings.getMaximumAdvanceDays());
        CurrentStay stay = currentStayOf(tenantUserId, propertyId);
        // Someone leaving a stay elsewhere books only for after it ends.
        LocalDate earliest = stay.endsOn() != null && !open.earliestMoveInDate().isAfter(stay.endsOn())
                ? stay.endsOn().plusDays(1) : open.earliestMoveInDate();
        LocalDate latest = open.latestMoveInDate();
        boolean anyDate = !earliest.isAfter(latest);

        int requestsLeft = Math.max(
                BookingPolicy.MAX_REQUESTS_PER_VISIT - visitSlotsInUse(eligibility.visitId(), eligibility.enquiryId(), now), 0);
        UUID existing = requests
                .findFirstByProspectUserIdAndPropertyIdAndStatusInAndTenancyIdIsNullOrderBySubmittedAtDesc(
                        tenantUserId, propertyId, List.of(BookingStatus.AWAITING_HANDLER,
                                BookingStatus.AWAITING_TENANT, BookingStatus.AWAITING_TOKEN, BookingStatus.TOKEN_RECEIVED, BookingStatus.CONFIRMED))
                .filter(found -> found.isOpenAt(now))
                .map(BookingRequest::getId)
                .orElse(null);

        // Beds being vacated, inside the same bounds a request for one would be checked against.
        Map<UUID, List<BookingFormOptionsResponse.FutureBed>> vacating = new HashMap<>();
        if (settings.isShowFutureVacancies() && anyDate) {
            for (BookingFutureVacancyResponse bed : tenancies.bookingFutureVacancies(propertyId, earliest, latest)) {
                vacating.computeIfAbsent(bed.roomId(), room -> new ArrayList<>()).add(
                        new BookingFormOptionsResponse.FutureBed(bed.exitRequestId(), bed.checkoutDate(),
                                bed.earliestMoveInDate(), bed.latestMoveInDate()));
            }
        }
        // One read of the property's rooms, however many it has. Every active room is listed,
        // so one that cannot be booked is shown as such.
        List<BookingFormOptionsResponse.Room> rooms = new ArrayList<>();
        boolean anyBed = false;
        // Each room type's photos, read once for the property and not once for each room.
        Map<UUID, List<String>> photos = properties.roomTypeImageUrls(propertyId);
        for (RoomResponse room : properties.listActiveRoomsForProperty(propertyId)) {
            boolean maintenance = room.status() == RoomStatus.MAINTENANCE;
            int freeBeds = maintenance ? 0 : Math.max(room.availableVacancies(), 0);
            List<BookingFormOptionsResponse.FutureBed> future =
                    maintenance ? List.of() : List.copyOf(vacating.getOrDefault(room.id(), List.of()));
            boolean available = freeBeds > 0 || !future.isEmpty();
            anyBed = anyBed || available;
            rooms.add(new BookingFormOptionsResponse.Room(room.id(), room.roomNumber(), room.floor(),
                    room.roomType(), room.conditioning(), room.capacity(), room.baseRentPaise(),
                    room.amenities().stream().map(Enum::name).sorted().toList(),
                    room.customAmenities().stream().sorted().toList(), freeBeds, future, available,
                    available ? null : maintenance ? "MAINTENANCE" : "FULL",
                    room.moldId() == null ? List.of() : photos.getOrDefault(room.moldId(), List.of())));
        }

        // The checks a request meets when it is sent, in the order it meets them.
        String whyNot;
        if (existing != null) {
            whyNot = "You already have a booking request at this property. Open it to see where it stands.";
        } else if (requests.existsByProspectUserIdAndStatus(tenantUserId, BookingStatus.CONFIRMED)) {
            whyNot = "You already have a confirmed booking. You can send a new request once that stay is over"
                    + " or the booking is cancelled.";
        } else if (requests.existsByProspectUserIdAndPropertyIdAndCooldownUntilAfter(tenantUserId, propertyId, now)) {
            whyNot = "You cancelled a confirmed booking at this property recently,"
                    + " so you cannot send a new request here yet.";
        } else if (requestsLeft == 0) {
            whyNot = "You have used both booking requests for this visit.";
        } else if (stay.refusal() != null) {
            whyNot = stay.refusal();
        } else if (!anyDate) {
            whyNot = stayEndsTooLate(stay.endsOn(), settings.getMaximumAdvanceDays(), eligibility.windowEndsOn());
        } else if (!anyBed) {
            whyNot = "No bed is free to book here right now.";
        } else {
            whyNot = null;
        }
        BookingTokenTerms token = settings.tokenTerms();
        return new BookingFormOptionsResponse(whyNot == null, whyNot, eligibility.enquiryId(), propertyId,
                property.name(), property.area(), property.city(), eligibility.visitedOn(),
                eligibility.windowEndsOn(), requestsLeft, existing, earliest, latest, stay.endsOn(),
                property.standardDepositPaise(), token.required(), token.amountPaise(),
                token.refundableOnTenantCancel(), property.pgFor(), rooms);
    }

    /**
     * Rooms with a bed free today, for whoever is offering a tenant another
     * bed. For the owner or the booking's handler, the two who may offer one.
     * It is a booking read on purpose: handling bookings does not come with
     * the property's rooms screen, which is a grant of its own.
     */
    @Transactional(readOnly = true)
    public List<BookingBedOptionResponse> anotherBedOptions(UUID actorUserId, UUID propertyId, UUID requestId) {
        properties.ensureCanView(actorUserId, propertyId, ManagerResource.BOOKINGS);
        BookingRequest request = requests.findById(requestId)
                .filter(found -> found.getPropertyId().equals(propertyId))
                .orElseThrow(() -> new NotFoundException("Booking request", requestId));
        if (!handlers.teamOf(propertyId).mayAct(actorUserId, request.getHandlerUserId())) {
            throw new ValidationException("Only the owner or whoever handles this booking can offer another bed.");
        }
        List<RoomResponse> rooms = properties.listActiveRoomsForProperty(propertyId);
        // The kind of room they booked, so the same kind can be offered first (user, 2026-10-27).
        RoomResponse booked = rooms.stream().filter(room -> room.id().equals(request.getRoomId())).findFirst()
                .orElse(null);
        List<BookingBedOptionResponse> options = new ArrayList<>();
        for (RoomResponse room : rooms) {
            if (room.id().equals(request.getRoomId()) || room.status() == RoomStatus.MAINTENANCE
                    || room.availableVacancies() <= 0) {
                continue;
            }
            boolean sameKind = booked != null && room.roomType() == booked.roomType()
                    && room.conditioning() == booked.conditioning();
            options.add(new BookingBedOptionResponse(room.id(), room.roomNumber(), room.floor(), room.roomType(),
                    room.conditioning(), room.capacity(), room.baseRentPaise(), room.availableVacancies(), sameKind));
        }
        return options;
    }

    // ---- Ending the ones nobody agreed in time -------------------------------

    /**
     * One request, read fresh and locked, for the hourly sweep.
     *
     * @return true when it expired now
     */
    @Transactional
    public boolean expireIfDue(UUID requestId) {
        BookingRequest request = requests.findByIdForUpdate(requestId).orElse(null);
        return request != null && expire(request, now());
    }

    /**
     * Writes the expiry of a request or booking a clock has run out on, and
     * frees its bed. The caller holds its row.
     *
     * @return true when it expired now, false when no clock had run out
     */
    boolean expire(BookingRequest request, Instant now) {
        BookingStatus before = request.getStatus();
        if (!request.expire(now)) {
            return false;
        }
        boolean tokenLapsed = before == BookingStatus.AWAITING_TOKEN;
        actions.save(BookingRequestAction.bySystem(request.getId(),
                tokenLapsed ? BookingActionType.TOKEN_LAPSED : BookingActionType.EXPIRED,
                BookingStatus.EXPIRED, null, now));
        // Over means the bed goes back, in the same transaction.
        inventory.release(request.getId(), request.getPropertyId());
        log.info("Booking expired requestId={} reference={} was={} visitSlotGivenBack={}",
                request.getId(), request.getReferenceCode(), before, !request.usesVisitSlot());
        announcer.changed(request);
        return true;
    }

    // ---- The tenant's own ----------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<BookingRequestListItemResponse> pageForTenant(UUID tenantUserId, int page, int size) {
        Instant now = now();
        // No handler on these rows: a person's requests span properties, and who handles each is on its detail.
        return page(requests.pageForProspect(tenantUserId, pageRequest(page, size)),
                // The booker can always chat about a booking made in the app (user, 2026-10-27).
                request -> BookingRequestListItemResponse.of(request, now, null, null, false,
                        request.getProspectUserId() != null, null));
    }

    @Transactional(readOnly = true)
    public BookingRequestResponse forTenant(UUID tenantUserId, UUID requestId) {
        // Not found, rather than forbidden: nobody learns that another person's request exists.
        BookingRequest request = requests.findById(requestId)
                .filter(found -> tenantUserId.equals(found.getProspectUserId()))
                .orElseThrow(() -> new NotFoundException("Booking request", requestId));
        return detail(request, BookingParty.TENANT, tenantUserId, now());
    }

    // ---- The property's ------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<BookingRequestListItemResponse> pageForProperty(
            UUID actorUserId, UUID propertyId, BookingListFilter filter, int page, int size) {
        return pageForProperty(actorUserId, propertyId, filter, null, false, null, page, size);
    }

    /**
     * A page of the property's bookings, narrowed on the server so the count
     * and the pages are of what was asked for, never of one fetched page.
     *
     * @param status only the ones that read as this status now. In the
     *               history, EXPIRED includes those out of time and not yet
     *               written down
     * @param mine   only the ones the reader handles
     * @param search part of a tenant's name, a booking's short code or a room
     *               number, in any case
     */
    @Transactional(readOnly = true)
    public PageResponse<BookingRequestListItemResponse> pageForProperty(
            UUID actorUserId, UUID propertyId, BookingListFilter filter, BookingStatus status, boolean mine,
            String search, int page, int size) {
        return pageForProperty(actorUserId, propertyId, filter, status, mine, false, search, page, size);
    }

    /**
     * The same page, with the working list's first tab (user, 2026-10-11:
     * "Assignment should remove the booking from All requests").
     *
     * @param unassigned only the bookings still going that nobody handles
     *                   today: never given to anyone, or left by a handler who
     *                   lost the grant. The history has no such list
     */
    @Transactional(readOnly = true)
    public PageResponse<BookingRequestListItemResponse> pageForProperty(
            UUID actorUserId, UUID propertyId, BookingListFilter filter, BookingStatus status, boolean mine,
            boolean unassigned, String search, int page, int size) {
        return pageForProperty(actorUserId, propertyId, filter, status, mine, unassigned, null, search, page, size);
    }

    /** Action center queues span handlers, unlike the unassigned-only first tab. Still a server-paged read. */
    @Transactional(readOnly = true)
    public PageResponse<BookingRequestListItemResponse> pageForProperty(
            UUID actorUserId, UUID propertyId, BookingListFilter filter, BookingStatus status, boolean mine,
            boolean unassigned, com.khatiyan.d_modules.booking.api.dto.BookingAttentionFilter attention,
            String search, int page, int size) {
        properties.ensureCanView(actorUserId, propertyId, ManagerResource.BOOKINGS);
        Instant now = now();
        String action = attention == null ? "ALL" : attention.name();
        if (!action.equals("ALL")) {
            filter = BookingListFilter.OPEN;
            status = null;
            mine = false;
            unassigned = false;
        }
        // One read of who can handle bookings and one of their names, however long the page.
        BookingHandlerService.Team team = handlers.teamOf(propertyId);
        // A stored handler counts only while they may still handle, so someone who may not handles none.
        if (mine && !actorUserId.equals(team.ownerUserId()) && !team.managersWithGrant().contains(actorUserId)) {
            return page(Page.empty(pageRequest(page, size)), request -> null);
        }
        String like = search == null || search.isBlank() ? ""
                : "%" + search.strip().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "").strip() + "%";
        if (like.equals("%%")) {
            like = "";
        }
        // The flags say whether a filter applies. The values beside them are never null, so the query never
        // has to guess a type from nothing.
        BookingStatus only = status == null ? BookingStatus.CONFIRMED : status;
        Page<BookingRequest> found = filter == BookingListFilter.HISTORY
                ? requests.pageHistoryForProperty(propertyId, now, status == null, only, !mine, actorUserId, like,
                        pageRequest(page, size))
                : requests.pageOpenForProperty(propertyId, now, status == null, only, !mine, actorUserId,
                        unassigned, team.canHandle(), action, now.atZone(java.time.ZoneId.of("Asia/Kolkata")).toLocalDate(),
                        like, pageRequest(page, size));
        Map<UUID, UUID> handlerOf = new HashMap<>();
        for (BookingRequest request : found.getContent()) {
            UUID handler = team.effectiveHandler(request.getHandlerUserId());
            if (handler != null) {
                handlerOf.put(request.getId(), handler);
            }
        }
        Map<UUID, UserSummaryResponse> people = handlerOf.isEmpty()
                ? Map.of() : auth.findByIds(new HashSet<>(handlerOf.values()));
        // Whether each confirmed booking's bed is free, for the onboarding cards. One read for the page.
        java.util.Set<UUID> ready = inventory.readyAmong(found.getContent().stream()
                .filter(request -> request.getStatus() == BookingStatus.CONFIRMED && !request.isConverted())
                .map(BookingRequest::getId).toList());
        return page(found, request -> {
            UUID handler = handlerOf.get(request.getId());
            // The chat is with whoever is on the property's side: the handler, or the owner while nobody is.
            UUID side = handler != null ? handler : team.ownerUserId();
            return BookingRequestListItemResponse.of(request, now, handler, nameOf(people, handler),
                    handler != null && handler.equals(actorUserId),
                    request.getProspectUserId() != null && actorUserId.equals(side),
                    request.getStatus() == BookingStatus.CONFIRMED && !request.isConverted()
                            ? ready.contains(request.getId()) : null);
        });
    }

    @Transactional(readOnly = true)
    public BookingRequestCountsResponse countsForProperty(UUID actorUserId, UUID propertyId) {
        properties.ensureCanView(actorUserId, propertyId, ManagerResource.BOOKINGS);
        Map<BookingStatus, Long> counts = new EnumMap<>(BookingStatus.class);
        for (Object[] row : requests.countOpenByStatus(propertyId, now())) {
            counts.put((BookingStatus) row[0], (Long) row[1]);
        }
        return new BookingRequestCountsResponse(
                counts.getOrDefault(BookingStatus.AWAITING_HANDLER, 0L),
                counts.getOrDefault(BookingStatus.AWAITING_TENANT, 0L),
                counts.getOrDefault(BookingStatus.AWAITING_TOKEN, 0L),
                counts.getOrDefault(BookingStatus.CONFIRMED, 0L),
                counts.getOrDefault(BookingStatus.TOKEN_RECEIVED, 0L));
    }

    /** Reading a request changes nothing. Taking it is {@link #open}, a deliberate act. */
    @Transactional(readOnly = true)
    public BookingRequestResponse forProperty(UUID actorUserId, UUID propertyId, UUID requestId) {
        properties.ensureCanView(actorUserId, propertyId, ManagerResource.BOOKINGS);
        BookingRequest request = requests.findById(requestId)
                .filter(found -> found.getPropertyId().equals(propertyId))
                .orElseThrow(() -> new NotFoundException("Booking request", requestId));
        return detail(request, BookingParty.MANAGEMENT, actorUserId, now());
    }

    /**
     * Somebody on the property's side opens a request's details. This is the
     * one read that can change something: where the system assigns, a request
     * nobody has is given its turn, and a name left by a handler who lost the
     * grant is cleared. Where the first to respond handles a request, opening
     * takes nothing: answering it does (user, 2026-10-11).
     *
     * <p>Called when a person opens the screen, never when a list loads, a
     * badge counts or a notification previews. The request's row is locked.
     */
    @Transactional
    public BookingRequestResponse open(UUID actorUserId, UUID propertyId, UUID requestId) {
        properties.ensureCanView(actorUserId, propertyId, ManagerResource.BOOKINGS);
        BookingRequest request = requests.findByIdForUpdate(requestId)
                .filter(found -> found.getPropertyId().equals(propertyId))
                .orElseThrow(() -> new NotFoundException("Booking request", requestId));
        Instant now = now();
        if (request.isOpenAt(now)) {
            handlers.onOpen(request, actorUserId, now);
        }
        return detail(request, BookingParty.MANAGEMENT, actorUserId, now);
    }

    // ---- Shapes --------------------------------------------------------------

    private BookingRequestResponse detail(BookingRequest request, BookingParty viewer, UUID viewerUserId, Instant now) {
        BookingHandlerService.Team team = handlers.teamOf(request.getPropertyId());
        UUID handler = team.effectiveHandler(request.getHandlerUserId());
        // A tenant acts on their own request. On the property's side only the owner and its handler do.
        boolean mayAct = viewer == BookingParty.TENANT || team.mayAct(viewerUserId, request.getHandlerUserId());
        String handlerName = handler == null ? null : nameOf(auth.findByIds(Set.of(handler)), handler);
        // A token exists only once terms are agreed at a property that takes one.
        BookingToken token = request.isTokenRequired() && request.getAgreedAt() != null
                ? tokens.findByRequestId(request.getId()).orElse(null) : null;
        List<BookingTokenClaim> claims = token == null
                ? List.of() : tokenClaims.findByTokenIdOrderBySequenceAsc(token.getId());
        boolean owner = viewer == BookingParty.MANAGEMENT && viewerUserId.equals(team.ownerUserId());
        // Whether the bed is ready is asked only once a confirmed booking's day has come.
        LocalDate today = LocalDate.ofInstant(now, BookingPolicy.ZONE);
        boolean dueToMoveIn = request.getStatus() == BookingStatus.CONFIRMED && !request.isConverted()
                && !today.isBefore(request.getMoveInDate());
        Boolean bedReady = dueToMoveIn ? inventory.bedReady(request.getId(), request.getPropertyId()) : null;
        // Another bed is offered only where the booked one is not ready, so that is the only time it is read.
        BookingBedOffer bedOffer = Boolean.FALSE.equals(bedReady)
                ? bedOffers.findByRequestIdOrderBySequenceAsc(request.getId()).stream()
                        .filter(BookingBedOffer::isOpen).findFirst().orElse(null)
                : null;
        Set<BookingMoveInAction> moveInActions = BookingMoveInRules.allowedActions(
                new BookingMoveInRules.State(request.getStatus(), request.isConverted(), request.getMoveInDate(),
                        today, Boolean.TRUE.equals(bedReady), request.isDatePushed(), bedOffer != null),
                viewer, dueToMoveIn && viewer == BookingParty.MANAGEMENT
                        && mayOnboard(viewerUserId, request.getPropertyId()), mayAct);
        // Read display metadata through the property facade, after the booking
        // has scoped access. Never use another room type's photos as a fallback.
        RoomResponse room = properties.findRoomForDisplay(request.getPropertyId(), request.getRoomId()).orElse(null);
        List<String> roomImages = room == null || room.moldId() == null ? List.of()
                : properties.roomTypeImageUrls(request.getPropertyId()).getOrDefault(room.moldId(), List.of());
        return BookingRequestResponse.of(request, now, allowedActions(request, viewer, mayAct, now),
                offers.findByRequestIdOrderBySequenceAsc(request.getId()),
                actions.findByRequestIdOrderByOccurredAtAscSeqAsc(request.getId()),
                handler, handlerName, token, claims,
                allowedTokenActions(request, token, viewer, mayAct, owner, now), bedReady, moveInActions,
                bedOffer, roomImages, room);
    }

    /** Converting a booking is onboarding, so it turns on the right to onboard and not on handling the booking. */
    private boolean mayOnboard(UUID userId, UUID propertyId) {
        try {
            properties.ensureCanManage(userId, propertyId, ManagerResource.TENANCY_CREATE);
            return true;
        } catch (ForbiddenException refused) {
            return false;
        }
    }

    /**
     * What the reader may do about the token, by the same rules its actions
     * are checked against. Waiving is the owner's alone, so it is taken out
     * for a manager who handles the booking.
     */
    private static Set<BookingTokenAction> allowedTokenActions(BookingRequest request, BookingToken token,
            BookingParty viewer, boolean mayAct, boolean owner, Instant now) {
        if (token == null) {
            return Set.of();
        }
        Set<BookingTokenAction> allowed = BookingTokenRules.allowedActions(
                request.statusAt(now), token.getStatus(), viewer, mayAct);
        if (owner || !allowed.contains(BookingTokenAction.WAIVE)) {
            return allowed;
        }
        Set<BookingTokenAction> withoutWaive = new HashSet<>(allowed);
        withoutWaive.remove(BookingTokenAction.WAIVE);
        return Set.copyOf(withoutWaive);
    }

    private static String nameOf(Map<UUID, UserSummaryResponse> people, UUID userId) {
        UserSummaryResponse person = userId == null ? null : people.get(userId);
        return person == null ? null : person.fullName();
    }

    /**
     * What the reader may do next, worked out by the same rules the actions
     * themselves are checked against.
     *
     * @param managementMayAct whether this reader, on the property's side, is
     *                         the owner or the request's handler
     */
    private static Set<BookingAction> allowedActions(
            BookingRequest request, BookingParty viewer, boolean managementMayAct, Instant now) {
        return BookingActionRules.allowedActions(request.getStatus(), request.timing(), request.currentOffer(),
                request.tokenHold(), viewer, managementMayAct, request.isConverted(), now,
                request.getListedRentPaise());
    }

    private static PageResponse<BookingRequestListItemResponse> page(
            Page<BookingRequest> found, Function<BookingRequest, BookingRequestListItemResponse> row) {
        return new PageResponse<>(
                found.getContent().stream().map(row).toList(),
                found.getNumber(),
                found.getSize(),
                found.getTotalElements(),
                found.getTotalPages(),
                found.hasNext(),
                found.hasPrevious());
    }

    /**
     * The database keeps microseconds. Cut the clock to that before anything
     * is stamped, so a time read back is the time that was returned.
     */
    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }

    private static PageRequest pageRequest(int page, int size) {
        return PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE));
    }
}
