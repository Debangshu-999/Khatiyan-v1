package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.api.dto.BookingConversionResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingConvertibleResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.ConvertBookingRequest;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingBedOffer;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingMoveInAction;
import com.khatiyan.d_modules.booking.model.BookingOffer;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingRequestAction;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.repository.BookingBedOfferRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestActionRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;
import com.khatiyan.d_modules.compliance.ComplianceModule;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.AgreementTermInput;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementResponse;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.ManagerResource;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.tenancy.event.TenancyCancellationRoute;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import lombok.extern.slf4j.Slf4j;

/**
 * A confirmed booking becomes a stay (user's rules, 2026-10-10).
 *
 * <p><b>A person converts it, when the tenant arrives.</b> Nothing here runs
 * on a timer. Converting is ordinary onboarding: the ID is checked and the
 * address taken in person, and the agreement is written and signed exactly as
 * for anyone else. What differs is where the terms come from and where the
 * bed comes from. The room, rent, deposit and term are the booking's own,
 * never the screen's. The bed is the one the booking has held since it was
 * sent, and it passes to the stay in the same transaction, so it is never
 * free for anyone else in between.
 *
 * <p><b>Anyone who may onboard at the property may convert</b>, not only the
 * booking's handler.
 *
 * <p><b>The stay starts the day they actually move in</b>, not the day they
 * booked for. Nothing is backdated.
 *
 * <p><b>The booking follows the stay.</b> When the tenant signs and the stay
 * starts, the booking is over: moved in. If the stay falls through first,
 * because the agreement went unsigned, the tenant declined it or the property
 * withdrew it, the booking is cancelled with that as its cause and its token
 * is settled. Once converted, the booking has no cancel of its own: the
 * agreement's decline and the property's withdrawal are the way out.
 *
 * <p>Locks as every booking write: the person, then the booking's row, then
 * the property's inventory. See {@link BookingWrites}.
 */
@Slf4j
@Service
public class BookingConversionService {

    private static final int MAX_REASON_LENGTH = 500;

    private final BookingRequestRepository requests;
    private final BookingRequestActionRepository actions;
    private final BookingBedOfferRepository bedOffers;
    private final BookingRequestService requestService;
    private final BookingWrites writes;
    private final BookingInventoryService inventory;
    private final PropertyModule properties;
    private final ComplianceModule compliance;
    private final AuthModule auth;
    private final Validator validator;
    private final Clock clock;
    private final BookingAnnouncer announcer;

    public BookingConversionService(
            BookingRequestRepository requests,
            BookingRequestActionRepository actions,
            BookingBedOfferRepository bedOffers,
            BookingRequestService requestService,
            BookingWrites writes,
            BookingInventoryService inventory,
            PropertyModule properties,
            ComplianceModule compliance,
            AuthModule auth,
            Validator validator,
            Clock clock,
            BookingAnnouncer announcer) {
        this.requests = requests;
        this.actions = actions;
        this.bedOffers = bedOffers;
        this.requestService = requestService;
        this.writes = writes;
        this.inventory = inventory;
        this.properties = properties;
        this.compliance = compliance;
        this.auth = auth;
        this.validator = validator;
        this.clock = clock;
        this.announcer = announcer;
    }

    // ---- The property --------------------------------------------------------

    /**
     * The booking this phone number has at the property, for the onboarding
     * screen. Where there is one, the screen offers "Convert the booking" and
     * does not create a second record for the same person.
     */
    @Transactional(readOnly = true)
    public Optional<BookingConvertibleResponse> convertibleFor(UUID actorUserId, UUID propertyId, String tenantPhone) {
        properties.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_CREATE);
        UUID person = auth.findByPhone(auth.normalizePhone(tenantPhone)).map(UserSummaryResponse::id).orElse(null);
        if (person == null) {
            return Optional.empty();
        }
        Instant now = now();
        LocalDate today = LocalDate.ofInstant(now, BookingPolicy.ZONE);
        return requests.findFirstByProspectUserIdAndPropertyIdAndStatusInAndTenancyIdIsNullOrderBySubmittedAtDesc(
                        person, propertyId, List.of(BookingStatus.AWAITING_TOKEN, BookingStatus.TOKEN_RECEIVED, BookingStatus.CONFIRMED))
                .filter(request -> request.statusAt(now).isAgreed())
                .map(request -> {
                    boolean bedReady = inventory.bedReady(request.getId(), propertyId);
                    boolean canConvert = BookingMoveInRules.allowedActions(request.statusAt(now), false,
                            request.getMoveInDate(), today, bedReady, BookingParty.MANAGEMENT, true, false)
                            .contains(BookingMoveInAction.CONVERT);
                    return new BookingConvertibleResponse(request.getId(), request.getReferenceCode(),
                            request.statusAt(now), request.getRoomId(), request.getRoomNumber(),
                            request.getMoveInDate(), request.getAgreedRentPaise(), request.getDepositPaise(),
                            request.getAgreementMonths(), request.getTenantName(), request.getTenantGender(),
                            request.getTenantDateOfBirth(), canConvert,
                            canConvert ? null : BookingMoveInRules.whyNot(BookingMoveInAction.CONVERT,
                                    request.statusAt(now), false, request.getMoveInDate(), today, bedReady),
                            request.getVersion());
                });
    }

    /**
     * The tenant has arrived. Onboards them into the bed they booked, at the
     * terms that were agreed, and links the booking to the stay.
     *
     * <p>Everything ordinary onboarding refuses is refused here too, and
     * leaves the booking exactly as it was, bed included: an owner whose
     * profile cannot be named on an agreement, a tenant who still has a stay
     * elsewhere, a balance that will not carry an ordered verification.
     */
    @Transactional
    public BookingConversionResponse convert(UUID actorUserId, UUID propertyId, UUID requestId,
            ConvertBookingRequest input, String clientIp, UUID sessionJti) {
        if (input == null) {
            throw new ValidationException("Enter the tenant's details before onboarding");
        }
        BookingRequest request = writes.lockForOnboarding(actorUserId, propertyId, requestId);
        Instant now = now();
        LocalDate today = LocalDate.ofInstant(now, BookingPolicy.ZONE);
        boolean bedReady = inventory.bedReady(request.getId(), propertyId);
        BookingMoveInRules.require(BookingMoveInAction.CONVERT, request.statusAt(now), request.isConverted(),
                request.getMoveInDate(), today, bedReady, BookingParty.MANAGEMENT, true, false);

        // The account's own number: the booking belongs to that account, and the stay must too.
        // An external booking has no account yet: its number as recorded, and onboarding makes
        // the account for it (2026-10-19).
        String phone = request.getProspectUserId() == null ? request.getTenantPhone()
                : auth.findById(request.getProspectUserId())
                        .map(UserSummaryResponse::phone)
                        .orElseThrow(() -> new ValidationException("This person's account can no longer be found."));
        Integer months = request.getAgreementMonths();
        String earlyExitRule = input.earlyExitRule() == null || input.earlyExitRule().isBlank()
                ? null : input.earlyExitRule().strip();
        OnboardTenancyWithAgreementRequest onboarding = new OnboardTenancyWithAgreementRequest(
                phone, request.getTenantName(), propertyId, request.getRoomId(),
                request.getAgreedRentPaise(), request.getDepositPaise(),
                // The day they actually move in. A late arrival is never billed from the day they booked for.
                today,
                input.idCheck(), input.idCheckStatementText(), input.verification(), input.device(), input.tenant(),
                // The property's own agreement template, as its settings hold it.
                null,
                months == null && earlyExitRule == null ? null : new AgreementTermInput(months, earlyExitRule));
        // The checks the onboarding endpoint runs on its body. This call does not pass through it.
        Set<ConstraintViolation<OnboardTenancyWithAgreementRequest>> problems = validator.validate(onboarding);
        if (!problems.isEmpty()) {
            throw new ValidationException(problems.iterator().next().getMessage());
        }

        VersionGuard.claim(request);
        // The booked bed passes to the stay. The property's inventory is held
        // from here to the end, so nobody else can take the bed in between.
        inventory.consume(request.getId(), propertyId);
        OnboardTenancyWithAgreementResponse stay =
                compliance.onboardTenancyWithAgreement(actorUserId, onboarding, clientIp, sessionJti);
        if (request.getProspectUserId() == null) {
            request.attachAccount(stay.tenancy().userId());
        } else if (!request.getProspectUserId().equals(stay.tenancy().userId())) {
            throw new IllegalStateException("The stay was created for a different account than the booking's");
        }
        request.convert(stay.tenancy().id(), actorUserId, now);
        // Onboarded: a token received is non refundable from here (user, 2026-10-28).
        writes.tokenOnboarded(request, now);
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.CONVERTED, BookingParty.MANAGEMENT,
                actorUserId, null, request.getStatus(), null, now));
        log.info("Booking converted requestId={} reference={} tenancyId={} actorUserId={} startDate={} bookedFor={}",
                request.getId(), request.getReferenceCode(), stay.tenancy().id(), actorUserId, today,
                request.getMoveInDate());
        announcer.changed(request);
        return new BookingConversionResponse(request.getId(), request.getReferenceCode(), stay);
    }

    /**
     * Nobody came (user, 2026-10-27): from the day after the move-in date,
     * whether or not the bed was freed. The booking is cancelled and its bed
     * let go. A token the property holds waits as "Action pending" until the
     * handler refunds or keeps it from its record (user, 2026-10-28).
     */
    @Transactional
    public BookingRequestResponse closeAsDidNotArrive(UUID actorUserId, UUID propertyId, UUID requestId) {
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        Instant now = now();
        BookingMoveInRules.require(BookingMoveInAction.CLOSE_DID_NOT_ARRIVE, request.statusAt(now),
                request.isConverted(), request.getMoveInDate(), LocalDate.ofInstant(now, BookingPolicy.ZONE),
                inventory.bedReady(request.getId(), propertyId), BookingParty.MANAGEMENT, false, true);
        end(request, BookingEndCause.TENANT_DID_NOT_ARRIVE, BookingParty.MANAGEMENT, actorUserId, false, now);
        return requestService.forProperty(actorUserId, propertyId, requestId);
    }

    /**
     * The booked bed is still occupied, so the handler moves the booking to a
     * free bed now (user, 2026-10-27): at the onboarding desk, with the tenant
     * there. From the move-in day. The agreed rent and the token stay as they
     * are, and the booking can be onboarded straight after.
     */
    @Transactional
    public BookingRequestResponse moveToAnotherBed(UUID actorUserId, UUID propertyId, UUID requestId, UUID roomId) {
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        Instant now = now();
        BookingMoveInRules.require(BookingMoveInAction.MOVE_TO_ANOTHER_BED,
                stateOf(request, now, inventory.bedReady(request.getId(), propertyId), false),
                BookingParty.MANAGEMENT, false, true);
        if (roomId == null) {
            throw new ValidationException("Choose the room to move them to.");
        }
        if (roomId.equals(request.getRoomId())) {
            throw new ValidationException("That is the room they already booked.");
        }
        RoomResponse room = properties.getActiveRoom(propertyId, roomId);
        if (room.status() == RoomStatus.MAINTENANCE || room.availableVacancies() <= 0) {
            throw new ValidationException("That room has no bed free today.");
        }
        VersionGuard.claim(request);
        try {
            inventory.moveBed(request.getId(), propertyId, roomId);
        } catch (ValidationException | NotFoundException taken) {
            throw new ValidationException("That bed is no longer free. Choose another room.");
        }
        // An offer the tenant had not answered is overtaken by the move.
        bedOffers.findByRequestIdOrderBySequenceAsc(request.getId()).stream().filter(BookingBedOffer::isOpen)
                .forEach(open -> open.answer(BookingBedOffer.Answer.REPLACED, now));
        String from = request.getRoomNumber();
        request.takeAnotherBed(roomId, room.roomNumber(), request.getAgreedRentPaise());
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.BED_MOVED, BookingParty.MANAGEMENT,
                actorUserId, null, request.getStatus(), "Room " + from + " to Room " + room.roomNumber(), now));
        log.info("Booking moved to another bed requestId={} reference={} fromRoom={} toRoom={}",
                request.getId(), request.getReferenceCode(), from, room.roomNumber());
        announcer.changed(request);
        return requestService.forProperty(actorUserId, propertyId, requestId);
    }

    // ---- The tenant ----------------------------------------------------------

    /**
     * The bed is still not ready after the property's extra days, and the
     * tenant chooses to leave. The property could not provide the bed, so a
     * token it holds is owed back whatever its refund rule says, and the visit
     * gets its request back.
     */
    @Transactional
    public BookingRequestResponse leaveBecauseBedNotReady(UUID tenantUserId, UUID requestId) {
        BookingRequest request = writes.lockForTenant(tenantUserId, requestId);
        Instant now = now();
        BookingMoveInRules.require(BookingMoveInAction.LEAVE_BED_NOT_READY, request.statusAt(now),
                request.isConverted(), request.getMoveInDate(), LocalDate.ofInstant(now, BookingPolicy.ZONE),
                inventory.bedReady(request.getId(), request.getPropertyId()), BookingParty.TENANT, false, false);
        end(request, BookingEndCause.BED_NOT_READY, BookingParty.TENANT, tenantUserId, true, now);
        return requestService.forTenant(tenantUserId, requestId);
    }

    // ---- Before the day: the one date push --------------------------------------

    /**
     * The tenant moves the move-in date to a later day. Once, by seven days at
     * most, and only until the end of the day before the date in force (user,
     * 2026-10-10). Nothing else about the booking changes: the bed is kept,
     * and the date first asked for stays on record beside the new one.
     */
    @Transactional
    public BookingRequestResponse pushMoveInDate(UUID tenantUserId, UUID requestId, LocalDate moveInDate) {
        BookingRequest request = writes.lockForTenant(tenantUserId, requestId);
        Instant now = now();
        BookingMoveInRules.require(BookingMoveInAction.PUSH_DATE, stateOf(request, now, false, false),
                BookingParty.TENANT, false, false);
        BookingPolicy.requireDatePush(request.getOriginalMoveInDate(), moveInDate);

        VersionGuard.claim(request);
        inventory.moveDate(request.getId(), request.getPropertyId(), moveInDate);
        request.pushMoveInDate(moveInDate, now);
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.DATE_PUSHED, BookingParty.TENANT,
                tenantUserId, null, request.getStatus(), null, now));
        // Told like every other change, so the tenant's notice of the new date goes out (2026-10-18).
        announcer.changed(request);
        log.info("Booking move-in date pushed requestId={} reference={} from={} to={}",
                request.getId(), request.getReferenceCode(), request.getOriginalMoveInDate(), moveInDate);
        return requestService.forTenant(tenantUserId, requestId);
    }

    // ---- Another bed, when the booked one is still occupied -------------------

    /**
     * The owner or the handler offers the tenant another bed, once the booked
     * one is still occupied after the property's extra days. The room must
     * have a bed free today. A newer offer replaces one the tenant has not
     * answered. Nothing is held for the offer: the bed is taken when the
     * tenant accepts, if it is still free.
     */
    @Transactional
    public BookingRequestResponse offerAnotherBed(UUID actorUserId, UUID propertyId, UUID requestId, UUID roomId,
            Long monthlyRentPaise) {
        BookingRequest request = writes.lockForProperty(actorUserId, propertyId, requestId);
        Instant now = now();
        BookingMoveInRules.require(BookingMoveInAction.OFFER_ANOTHER_BED,
                stateOf(request, now, inventory.bedReady(request.getId(), propertyId), false),
                BookingParty.MANAGEMENT, false, true);
        if (roomId == null) {
            throw new ValidationException("Choose the bed to offer.");
        }
        if (roomId.equals(request.getRoomId())) {
            throw new ValidationException("That is the bed they already booked.");
        }
        long rent = BookingOffer.requireMonthlyRent(monthlyRentPaise);
        RoomResponse room = properties.getActiveRoom(propertyId, roomId);
        if (room.status() == RoomStatus.MAINTENANCE || room.availableVacancies() <= 0) {
            throw new ValidationException("That room has no bed free today.");
        }

        VersionGuard.claim(request);
        List<BookingBedOffer> earlier = bedOffers.findByRequestIdOrderBySequenceAsc(request.getId());
        earlier.stream().filter(BookingBedOffer::isOpen)
                .forEach(open -> open.answer(BookingBedOffer.Answer.REPLACED, now));
        // The replaced offer has to reach the database before the new one meets the one-open-offer index.
        bedOffers.flush();
        bedOffers.save(BookingBedOffer.offer(request.getId(), earlier.size() + 1, roomId, room.roomNumber(), rent,
                actorUserId, now));
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.BED_OFFERED, BookingParty.MANAGEMENT,
                actorUserId, null, request.getStatus(), null, now));
        log.info("Another bed offered requestId={} reference={} roomId={} rentPaise={}",
                request.getId(), request.getReferenceCode(), roomId, rent);
        return requestService.forProperty(actorUserId, propertyId, requestId);
    }

    /**
     * The tenant takes the other bed. The booking moves to that room at that
     * rent, the new bed is held for them from this moment, and the token they
     * already paid carries over. It can be converted straight away.
     */
    @Transactional
    public BookingRequestResponse acceptAnotherBed(UUID tenantUserId, UUID requestId) {
        BookingRequest request = writes.lockForTenant(tenantUserId, requestId);
        Instant now = now();
        BookingBedOffer open = openOfferOf(request);
        BookingMoveInRules.require(BookingMoveInAction.ACCEPT_ANOTHER_BED,
                stateOf(request, now, inventory.bedReady(request.getId(), request.getPropertyId()), open != null),
                BookingParty.TENANT, false, false);

        VersionGuard.claim(request);
        try {
            inventory.moveBed(request.getId(), request.getPropertyId(), open.getRoomId());
        } catch (ValidationException | NotFoundException taken) {
            throw new ValidationException("That bed is no longer free. Ask the property to offer another.");
        }
        open.answer(BookingBedOffer.Answer.ACCEPTED, now);
        request.takeAnotherBed(open.getRoomId(), open.getRoomNumber(), open.getMonthlyRentPaise());
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.BED_OFFER_ACCEPTED,
                BookingParty.TENANT, tenantUserId, null, request.getStatus(), null, now));
        log.info("Another bed accepted requestId={} reference={} roomId={} rentPaise={}",
                request.getId(), request.getReferenceCode(), open.getRoomId(), open.getMonthlyRentPaise());
        return requestService.forTenant(tenantUserId, requestId);
    }

    /** The tenant does not take the other bed. They may keep waiting, leave, or be offered a different one. */
    @Transactional
    public BookingRequestResponse declineAnotherBed(UUID tenantUserId, UUID requestId) {
        BookingRequest request = writes.lockForTenant(tenantUserId, requestId);
        Instant now = now();
        BookingBedOffer open = openOfferOf(request);
        BookingMoveInRules.require(BookingMoveInAction.DECLINE_ANOTHER_BED,
                stateOf(request, now, inventory.bedReady(request.getId(), request.getPropertyId()), open != null),
                BookingParty.TENANT, false, false);

        VersionGuard.claim(request);
        open.answer(BookingBedOffer.Answer.DECLINED, now);
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.BED_OFFER_DECLINED,
                BookingParty.TENANT, tenantUserId, null, request.getStatus(), null, now));
        return requestService.forTenant(tenantUserId, requestId);
    }

    private BookingBedOffer openOfferOf(BookingRequest request) {
        return bedOffers.findByRequestIdOrderBySequenceAsc(request.getId()).stream()
                .filter(BookingBedOffer::isOpen)
                .findFirst()
                .orElse(null);
    }

    private static BookingMoveInRules.State stateOf(BookingRequest request, Instant now, boolean bedReady,
            boolean bedOffered) {
        return new BookingMoveInRules.State(request.statusAt(now), request.isConverted(), request.getMoveInDate(),
                LocalDate.ofInstant(now, BookingPolicy.ZONE), bedReady, request.isDatePushed(), bedOffered);
    }

    // ---- The stay's outcome, carried back --------------------------------------

    /**
     * The tenant signed and the stay has started. The booking is over: moved
     * in. Called inside the transaction that starts the stay.
     *
     * <p>A token the property holds comes off the stay's first bill here, as a
     * line of its own, so the tenant pays only the balance.
     */
    @Transactional
    public void onStayStarted(UUID tenancyId, UUID tenantUserId) {
        UUID requestId = requests.findIdByTenancyId(tenancyId).orElse(null);
        if (requestId == null) {
            return;
        }
        BookingRequest request = writes.lockForTenant(tenantUserId, requestId);
        if (request.getStatus() != BookingStatus.CONFIRMED) {
            return;
        }
        Instant now = now();
        request.movedIn(now);
        writes.adjustTokenAtMoveIn(request, tenancyId, now);
        actions.save(BookingRequestAction.bySystem(request.getId(), BookingActionType.MOVED_IN,
                BookingStatus.MOVED_IN, null, now));
        log.info("Booking moved in requestId={} reference={} tenancyId={}",
                request.getId(), request.getReferenceCode(), tenancyId);
        announcer.changed(request);
    }

    /**
     * The stay created from a booking was cancelled before it started. The
     * booking is cancelled with it, by the same cause, and its token settled.
     * Called inside the transaction that cancels the stay, which also frees
     * the bed: the booking gave it to the stay at conversion.
     *
     * <p>An agreement left unsigned, or declined, is the tenant walking away,
     * and nobody is penalised for it. The property withdrawing is the
     * property cancelling.
     */
    @Transactional
    public void onStayFellThrough(UUID tenancyId, UUID tenantUserId, TenancyCancellationRoute route,
            UUID actorUserId, String reason) {
        UUID requestId = requests.findIdByTenancyId(tenancyId).orElse(null);
        if (requestId == null) {
            return;
        }
        BookingRequest request = writes.lockForTenant(tenantUserId, requestId);
        if (request.getStatus() != BookingStatus.CONFIRMED) {
            return;
        }
        Instant now = now();
        boolean byProperty = route == TenancyCancellationRoute.MANAGEMENT_WITHDREW && actorUserId != null;
        boolean byTenant = route == TenancyCancellationRoute.TENANT_DECLINED;
        BookingEndCause cause = byProperty ? BookingEndCause.MANAGEMENT_CANCELLED
                : byTenant ? BookingEndCause.TENANT_CANCELLED : BookingEndCause.TENANT_DID_NOT_SIGN;
        BookingParty by = byProperty ? BookingParty.MANAGEMENT : byTenant ? BookingParty.TENANT : null;
        UUID byUserId = byProperty ? actorUserId : byTenant ? tenantUserId : null;
        String why = reason == null || reason.isBlank() ? null
                : reason.strip().substring(0, Math.min(reason.strip().length(), MAX_REASON_LENGTH));

        request.cancel(cause, by, byUserId, byProperty ? why : null, now, byProperty, null);
        writes.settleOnboardedToken(request, now);
        actions.save(by == null
                ? BookingRequestAction.bySystem(request.getId(), BookingActionType.CANCELLED,
                        BookingStatus.CANCELLED, null, now)
                : BookingRequestAction.by(request.getId(), BookingActionType.CANCELLED, by, byUserId, null,
                        BookingStatus.CANCELLED, null, now));
        log.info("Booking ended with its stay requestId={} reference={} tenancyId={} route={} cause={}",
                request.getId(), request.getReferenceCode(), tenancyId, route, cause);
        announcer.changed(request);
    }

    // ---- Shared --------------------------------------------------------------

    private void end(BookingRequest request, BookingEndCause cause, BookingParty by, UUID byUserId,
            boolean giveSlotBack, Instant now) {
        VersionGuard.claim(request);
        request.cancel(cause, by, byUserId, null, now, giveSlotBack, null);
        inventory.release(request.getId(), request.getPropertyId());
        writes.settleToken(request, cause, now);
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.CANCELLED, by, byUserId, null,
                BookingStatus.CANCELLED, null, now));
        log.info("Booking ended on its move-in requestId={} reference={} cause={} by={}",
                request.getId(), request.getReferenceCode(), cause, by);
        announcer.changed(request);
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }
}
