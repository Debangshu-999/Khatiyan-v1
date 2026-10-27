package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingHandlerAssignment;
import com.khatiyan.d_modules.booking.model.BookingMoveInWindow;
import com.khatiyan.d_modules.booking.model.BookingOffer;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingReachedVia;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingRequestAction;
import com.khatiyan.d_modules.booking.model.BookingRequestOffer;
import com.khatiyan.d_modules.booking.model.BookingSettings;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTiming;
import com.khatiyan.d_modules.booking.model.BookingToken;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.booking.model.BookingTokenTerms;
import com.khatiyan.d_modules.booking.repository.BookingRequestActionRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestOfferRepository;
import com.khatiyan.d_modules.booking.repository.BookingRequestRepository;
import com.khatiyan.d_modules.booking.repository.BookingTokenRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.ManagerResource;
import com.khatiyan.d_modules.property.model.RoomStatus;

import lombok.extern.slf4j.Slf4j;

/**
 * Bookings made outside the app (2026-10-19): someone booked in person or by
 * phone, and the property records it as a confirmed booking. Spec:
 * {@code docs/superpowers/specs/2026-10-19-external-visits-and-bookings-design.md}.
 *
 * <p>The same rules as a tenant's request: the move-in window, the gender the
 * property takes, an adult, a free bed held from now. It goes through the same
 * steps in one go: sent at the agreed rent, agreed, the token recorded as
 * received, confirmed. The person is the lead module's external record, so
 * nothing is sent to them and they have no account until move-in.
 */
@Slf4j
@Service
public class BookingExternalService {

    /** What the property entered for the booking. */
    public record Command(
            String name, String phone, Gender gender, LocalDate dateOfBirth, BookingReachedVia reachedVia,
            UUID roomId, LocalDate moveInDate, Long monthlyRentPaise, Long depositPaise, Integer agreementMonths,
            Long tokenPaise, ManualPaymentMethod tokenMethod, String tokenReference) {
    }

    /** A room with a bed to book, for the bed sheet: grouped by floor on screen. */
    public record RoomOption(UUID roomId, String roomNumber, String floor, String roomType, String conditioning,
            int capacity, int freeBeds, long rentPaise) {
    }

    /** What the form opens on. */
    public record Options(boolean open, String whyNot, LocalDate earliestMoveInDate, LocalDate latestMoveInDate,
            long depositPaise, boolean tokenRequired, long tokenAmountPaise, List<RoomOption> rooms) {
    }

    private final BookingRequestRepository requests;
    private final BookingRequestOfferRepository offers;
    private final BookingRequestActionRepository actions;
    private final BookingTokenRepository tokens;
    private final BookingInventoryService inventory;
    private final BookingSettingsService settingsService;
    private final BookingPolicy policy;
    private final BookingWrites writes;
    private final BookingAnnouncer announcer;
    private final PropertyModule properties;
    private final AuthModule auth;
    private final ReferenceCodeGenerator referenceCodes;
    private final BookingRequestService requestService;
    private final Clock clock;

    public BookingExternalService(BookingRequestRepository requests, BookingRequestOfferRepository offers,
            BookingRequestActionRepository actions, BookingTokenRepository tokens, BookingInventoryService inventory,
            BookingSettingsService settingsService, BookingPolicy policy, BookingWrites writes,
            BookingAnnouncer announcer, PropertyModule properties, AuthModule auth,
            ReferenceCodeGenerator referenceCodes, BookingRequestService requestService, Clock clock) {
        this.requests = requests;
        this.offers = offers;
        this.actions = actions;
        this.tokens = tokens;
        this.inventory = inventory;
        this.settingsService = settingsService;
        this.policy = policy;
        this.writes = writes;
        this.announcer = announcer;
        this.properties = properties;
        this.auth = auth;
        this.referenceCodes = referenceCodes;
        this.requestService = requestService;
        this.clock = clock;
    }

    /** The move-in dates, the deposit, the token rule and the rooms with a bed free, for the form. */
    @Transactional(readOnly = true)
    public Options options(UUID actorUserId, UUID propertyId) {
        properties.ensureCanManage(actorUserId, propertyId, ManagerResource.BOOKINGS);
        BookingSettings settings = settingsService.find(propertyId).orElse(null);
        if (settings == null) {
            return new Options(false, "Set up bookings for this property first.", null, null, 0, false, 0, List.of());
        }
        PropertyResponse property = properties.getActiveProperty(propertyId);
        BookingTiming open = policy.timingFor(clock.instant(), settings.getMaximumAdvanceDays());
        BookingMoveInWindow window = policy.liveMoveInWindow(open);
        List<RoomOption> rooms = new ArrayList<>();
        for (RoomResponse room : properties.listActiveRoomsForProperty(propertyId)) {
            int free = room.status() == RoomStatus.MAINTENANCE ? 0 : Math.max(room.availableVacancies(), 0);
            if (free > 0) {
                rooms.add(new RoomOption(room.id(), room.roomNumber(), room.floor(),
                        room.roomType() == null ? null : String.valueOf(room.roomType()),
                        room.conditioning() == null ? null : String.valueOf(room.conditioning()),
                        room.capacity(), free, room.baseRentPaise()));
            }
        }
        BookingTokenTerms token = settings.tokenTerms();
        return new Options(!rooms.isEmpty(), rooms.isEmpty() ? "No bed is free to book here right now." : null,
                window.earliest(), window.latest(), property.standardDepositPaise(), token.required(),
                token.amountPaise(), rooms);
    }

    /**
     * Records the booking, confirmed, the bed held from now.
     *
     * @param externalProspectId the lead module's record of the person
     * @return the new booking's id
     */
    @Transactional
    public UUID create(UUID actorUserId, UUID propertyId, UUID externalProspectId, Command input) {
        properties.ensureCanManage(actorUserId, propertyId, ManagerResource.BOOKINGS);
        if (input == null || input.roomId() == null || input.moveInDate() == null) {
            throw new ValidationException("Choose a bed and a move-in date.");
        }
        if (input.reachedVia() == null) {
            throw new ValidationException("Say how they reached out.");
        }
        Instant now = clock.instant();
        BookingSettings settings = settingsService.find(propertyId)
                .orElseThrow(() -> new ValidationException("Set up bookings for this property first."));
        PropertyResponse property = properties.getActiveProperty(propertyId);
        String name = input.name() == null ? "" : input.name().strip();
        if (name.isEmpty()) {
            throw new ValidationException("Enter their name.");
        }
        String phone = auth.normalizePhone(input.phone());

        // The property's inventory, held to the end, so the room read below is the room as it is.
        properties.lockRoomInventory(propertyId);
        BookingTiming open = policy.timingFor(now, settings.getMaximumAdvanceDays());
        BookingPolicy.requireGenderFits(property.pgFor(), input.gender());
        policy.requireAdult(input.dateOfBirth(), open);
        policy.requireAgreementValidity(input.agreementMonths());
        RoomResponse room;
        try {
            room = properties.getActiveRoom(propertyId, input.roomId());
        } catch (NotFoundException gone) {
            throw new ValidationException("That room is no longer available. Choose another bed.");
        }
        if (room.status() == RoomStatus.MAINTENANCE || room.availableVacancies() <= 0) {
            throw new ValidationException("That bed is no longer free. Choose another bed.");
        }
        policy.requireMoveInDate(policy.liveMoveInWindow(open), input.moveInDate());
        BookingTiming timing = policy.timingFor(now, settings.getMaximumAdvanceDays(), input.moveInDate());

        long rent = input.monthlyRentPaise() != null ? input.monthlyRentPaise() : room.baseRentPaise();
        if (rent <= 0) {
            throw new ValidationException("Enter a monthly rent above zero.");
        }
        long deposit = input.depositPaise() != null ? input.depositPaise() : property.standardDepositPaise();
        if (deposit < 0) {
            throw new ValidationException("A deposit cannot be below zero.");
        }
        BookingTokenTerms ownersTerms = settings.tokenTerms();
        BookingTokenTerms terms = ownersTerms;
        if (ownersTerms.required()) {
            if (input.tokenPaise() == null || input.tokenPaise() <= 0) {
                throw new ValidationException("Enter the token they paid.");
            }
            if (input.tokenPaise() > rent) {
                throw new ValidationException("A token cannot be more than one month's rent.");
            }
            if (input.tokenMethod() == null) {
                throw new ValidationException("Say how the token was paid.");
            }
            // The token as it was actually paid, under the owner's refund rule.
            terms = new BookingTokenTerms(true, input.tokenPaise(), ownersTerms.refundableOnTenantCancel());
        }

        BookingOffer agreed = BookingOffer.tenantProposal(rent);
        BookingRequest request = BookingRequest.submit(new BookingRequest.Submission(
                referenceCodes.nextCode("BKG"), propertyId, null, null, null, 0, "external:" + UUID.randomUUID(),
                property.name(), room.id(), room.roomNumber(), null, room.baseRentPaise(), deposit, terms, name, phone,
                null, input.gender(), input.dateOfBirth(), timing, input.moveInDate(), input.agreementMonths(), agreed));
        request.markExternal(externalProspectId, input.reachedVia());
        try {
            inventory.reserve(request.getId(), propertyId, room.id(), timing, input.moveInDate(), null);
        } catch (ValidationException | NotFoundException taken) {
            throw new ValidationException("That bed is no longer free. Choose another bed.");
        }
        request.assignHandler(actorUserId, BookingHandlerAssignment.FIRST_VIEW, now);

        if (terms.required()) {
            request.agree(BookingStatus.AWAITING_TOKEN, now, now.plus(BookingPolicy.TOKEN_WINDOW));
            request.tokenReceived();
            request.confirmAwaited(now);
        } else {
            request.agree(BookingStatus.CONFIRMED, now, null);
        }
        request = requests.saveAndFlush(request);
        if (terms.required()) {
            BookingToken token = BookingToken.due(request.getId(), propertyId, request.getTokenDuePaise());
            token.receive(BookingTokenStatus.RECEIVED, input.tokenMethod(), blankToNull(input.tokenReference()),
                    actorUserId, now, referenceCodes.nextCode("TKN"));
            tokens.save(token);
        }
        offers.save(BookingRequestOffer.of(request.getId(), 1, agreed, actorUserId, now));
        String how = input.reachedVia() == BookingReachedVia.PHONE_CALL ? "Booked by phone" : "Booked in person";
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.SUBMITTED, BookingParty.MANAGEMENT,
                actorUserId, 1, BookingStatus.AWAITING_HANDLER, how, now));
        actions.save(BookingRequestAction.by(request.getId(), BookingActionType.AGREED, BookingParty.MANAGEMENT,
                actorUserId, 1, terms.required() ? BookingStatus.AWAITING_TOKEN : BookingStatus.CONFIRMED, null, now));
        if (terms.required()) {
            actions.save(BookingRequestAction.by(request.getId(), BookingActionType.TOKEN_RECEIVED,
                    BookingParty.MANAGEMENT, actorUserId, null, BookingStatus.TOKEN_RECEIVED, null, now));
        }
        writes.confirmed(request, now, actorUserId);
        announcer.changed(request);
        log.info("External booking recorded requestId={} reference={} propertyId={} roomId={} moveInDate={} via={}",
                request.getId(), request.getReferenceCode(), propertyId, room.id(), request.getMoveInDate(),
                input.reachedVia());
        return request.getId();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
