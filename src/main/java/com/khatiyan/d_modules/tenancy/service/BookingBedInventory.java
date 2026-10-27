package com.khatiyan.d_modules.tenancy.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.tenancy.api.dto.BookingBedHoldResponse;
import com.khatiyan.d_modules.tenancy.api.dto.BookingFutureVacancyResponse;
import com.khatiyan.d_modules.tenancy.model.BedHold;
import com.khatiyan.d_modules.tenancy.model.BedHold.Owner;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;
import com.khatiyan.d_modules.tenancy.repository.BedHoldRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyExitRequestRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRoomChangeRequestRepository;

/** Internal bed allocation boundary. Caller enforces visit/account/booking access; no public command route. */
@Service
public class BookingBedInventory {
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private final BedHoldRepository holds;
    private final TenancyRepository stays;
    private final TenancyExitRequestRepository exits;
    private final TenancyRoomChangeRequestRepository moves;
    private final PropertyModule properties;
    private final Clock clock;

    public BookingBedInventory(BedHoldRepository holds, TenancyRepository stays,
            TenancyExitRequestRepository exits, TenancyRoomChangeRequestRepository moves,
            PropertyModule properties, Clock clock) {
        this.holds = holds;
        this.stays = stays;
        this.exits = exits;
        this.moves = moves;
        this.properties = properties;
        this.clock = clock;
    }

    static boolean irreversibleExit(Tenancy stay, TenancyExitRequest exit, boolean approvedMove, Instant now) {
        LocalDate today = now.atZone(IST).toLocalDate();
        return stay.isActive() && stay.getBillingType() == TenancyBillingType.MONTHLY
                && Set.of(TenancyStatus.ACTIVE, TenancyStatus.ON_NOTICE, TenancyStatus.ON_PREMATURE_NOTICE,
                        TenancyStatus.PENDING_EXIT).contains(stay.getStatus())
                && !approvedMove && exit.getStatus() == TenancyExitRequestStatus.APPROVED
                && exit.getDecidedAt() != null && exit.getApprovedCheckoutDate() != null
                && stay.getId().equals(exit.getTenancyId())
                && stay.getPropertyId().equals(exit.getPropertyId()) && stay.getRoomId().equals(exit.getRoomId())
                && stay.getUserId() != null && stay.getUserId().equals(exit.getTenantUserId())
                && exit.getApprovedCheckoutDate().equals(stay.checkoutDate())
                && !exit.withdrawalWindowOpen(today, now);
    }

    @Transactional(readOnly = true)
    public List<BookingFutureVacancyResponse> futureVacancies(UUID propertyId, LocalDate minimum, LocalDate maximum) {
        properties.getActiveProperty(propertyId);
        Map<UUID, Tenancy> live = stays.findByPropertyIdAndActiveTrue(propertyId).stream()
                .collect(Collectors.toMap(Tenancy::getId, stay -> stay));
        Set<UUID> moving = moves.findByPropertyIdAndStatus(propertyId, TenancyRoomChangeRequestStatus.APPROVED)
                .stream().map(move -> move.getTenancyId()).collect(Collectors.toSet());
        Set<UUID> claimed = new HashSet<>(holds.claimedDepartures(propertyId));
        Set<UUID> usableRooms = properties.listActiveRoomsForProperty(propertyId).stream()
                .filter(room -> room.active() && room.status() != RoomStatus.MAINTENANCE)
                .map(room -> room.id()).collect(Collectors.toSet());
        Instant now = clock.instant();
        return exits.findByPropertyId(propertyId).stream()
                .filter(exit -> usableRooms.contains(exit.getRoomId()) && live.containsKey(exit.getTenancyId())
                        && !claimed.contains(exit.getTenancyId()))
                .filter(exit -> irreversibleExit(live.get(exit.getTenancyId()), exit, moving.contains(exit.getTenancyId()), now))
                .map(exit -> option(exit, minimum, maximum))
                .filter(option -> !option.earliestMoveInDate().isAfter(maximum))
                .sorted(Comparator.comparing(BookingFutureVacancyResponse::earliestMoveInDate)
                        .thenComparing(BookingFutureVacancyResponse::exitRequestId)).toList();
    }

    private static BookingFutureVacancyResponse option(TenancyExitRequest exit, LocalDate minimum, LocalDate maximum) {
        LocalDate afterCheckout = exit.getApprovedCheckoutDate().plusDays(1);
        return new BookingFutureVacancyResponse(exit.getRoomId(), exit.getId(), exit.getApprovedCheckoutDate(),
                afterCheckout.isAfter(minimum) ? afterCheckout : minimum, maximum);
    }

    @Transactional
    public BookingBedHoldResponse reserve(UUID bookingId, UUID propertyId, UUID roomId,
            LocalDate moveInDate, UUID exitRequestId) {
        properties.lockRoomInventory(propertyId);
        Optional<BedHold> previous = holds.findByOwnerKindAndOwnerId(Owner.BOOKING, bookingId);
        if (previous.isPresent()) {
            previous.get().requireSameBooking(propertyId, roomId, moveInDate, exitRequestId);
            return response(previous.get());
        }
        properties.getActiveProperty(propertyId);
        var room = properties.roomInventoryForUpdate(propertyId, roomId);
        UUID departing = null;
        if (exitRequestId == null) {
            properties.reserveRoomSlot(propertyId, roomId);
        } else {
            TenancyExitRequest exit = exits.findById(exitRequestId)
                    .orElseThrow(() -> new NotFoundException("Available exit", exitRequestId));
            if (!propertyId.equals(exit.getPropertyId()) || !roomId.equals(exit.getRoomId())) {
                throw new ValidationException("The selected exit does not belong to this property and room");
            }
            Tenancy stay = stays.findByIdForUpdate(exit.getTenancyId())
                    .orElseThrow(() -> new NotFoundException("Departing stay", exit.getTenancyId()));
            boolean moving = moves.findOpenByTenancyId(stay.getId(), List.of(TenancyRoomChangeRequestStatus.APPROVED)).isPresent();
            if (!room.active() || room.status() == RoomStatus.MAINTENANCE
                    || !irreversibleExit(stay, exit, moving, clock.instant())
                    || moveInDate == null || !moveInDate.isAfter(exit.getApprovedCheckoutDate())
                    || holds.activeOnDeparture(stay.getId()).isPresent()) {
                throw new ValidationException("This confirmed future bed is not available on the selected move-in date");
            }
            departing = stay.getId();
        }
        return response(holds.saveAndFlush(BedHold.booking(bookingId, propertyId, roomId, moveInDate, departing, exitRequestId)));
    }

    @Transactional
    public boolean release(UUID bookingId, UUID propertyId) {
        properties.lockRoomInventory(propertyId);
        BedHold hold = holds.findByOwnerKindAndOwnerId(Owner.BOOKING, bookingId).orElse(null);
        if (hold == null) return false;
        if (!hold.getPropertyId().equals(propertyId)) throw new NotFoundException("Bed hold", bookingId);
        boolean live = hold.getState() == BedHold.State.HELD;
        if (!hold.release()) return false;
        holds.saveAndFlush(hold);
        if (live) properties.releaseRoomSlotReservation(propertyId, hold.getRoomId());
        return true;
    }

    /**
     * The booked bed passes to the stay being created in this same
     * transaction. The room's reservation is given up here, and the stay takes
     * the bed as any new stay does. The property's inventory lock is held to
     * the end, so the bed is never free for anyone else in between. If the
     * stay is not created after all, the whole transaction rolls back and the
     * hold is as it was.
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public BookingBedHoldResponse consume(UUID bookingId, UUID propertyId) {
        properties.lockRoomInventory(propertyId);
        BedHold hold = holds.findByOwnerKindAndOwnerId(Owner.BOOKING, bookingId)
                .filter(found -> found.getPropertyId().equals(propertyId))
                .orElseThrow(() -> new NotFoundException("Bed hold", bookingId));
        if (hold.getState() == BedHold.State.WAITING) {
            throw new ValidationException("The booked bed is not free yet. The person leaving it has not moved out.");
        }
        if (!hold.consume()) {
            throw new ValidationException("This booking no longer holds a bed.");
        }
        holds.saveAndFlush(hold);
        properties.releaseRoomSlotReservation(propertyId, hold.getRoomId());
        return response(hold);
    }

    /** A booking's move-in date moves to a later day. Its bed is kept. */
    @Transactional
    public BookingBedHoldResponse moveDate(UUID bookingId, UUID propertyId, LocalDate moveInDate) {
        properties.lockRoomInventory(propertyId);
        BedHold hold = activeHold(bookingId, propertyId);
        hold.moveDate(moveInDate);
        return response(holds.saveAndFlush(hold));
    }

    /**
     * A booking gives up the bed it holds, or waits for, and takes one that is
     * free today in another room. The new bed is reserved before the old one
     * is let go, under the property's inventory lock, so the booking is never
     * left with neither.
     */
    @Transactional
    public BookingBedHoldResponse moveBed(UUID bookingId, UUID propertyId, UUID roomId) {
        properties.lockRoomInventory(propertyId);
        BedHold hold = activeHold(bookingId, propertyId);
        var room = properties.roomInventoryForUpdate(propertyId, roomId);
        if (!room.active() || room.status() == RoomStatus.MAINTENANCE) {
            throw new ValidationException("That room cannot be booked right now.");
        }
        boolean live = hold.getState() == BedHold.State.HELD;
        UUID from = hold.getRoomId();
        properties.reserveRoomSlot(propertyId, roomId);
        if (live) properties.releaseRoomSlotReservation(propertyId, from);
        hold.moveTo(roomId);
        return response(holds.saveAndFlush(hold));
    }

    private BedHold activeHold(UUID bookingId, UUID propertyId) {
        return holds.findByOwnerKindAndOwnerId(Owner.BOOKING, bookingId)
                .filter(found -> found.getPropertyId().equals(propertyId) && found.active())
                .orElseThrow(() -> new ValidationException("This booking no longer holds a bed."));
    }

    @Transactional(readOnly = true)
    /** Of these bookings, the ones whose bed is free for them now (HELD). One read (2026-10-27). */
    public java.util.Set<UUID> readyBookings(java.util.Collection<UUID> bookingIds) {
        return bookingIds.isEmpty() ? java.util.Set.of()
                : java.util.Set.copyOf(holds.ownersInState(Owner.BOOKING, bookingIds, BedHold.State.HELD));
    }

    public Optional<BookingBedHoldResponse> find(UUID bookingId, UUID propertyId) {
        return holds.findByOwnerKindAndOwnerId(Owner.BOOKING, bookingId)
                .filter(hold -> hold.getPropertyId().equals(propertyId)).map(BookingBedInventory::response);
    }

    /** Metadata only: the existing BEFORE_COMMIT occupancy event reserves the just-freed slot atomically. */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public boolean materializeDeparture(UUID propertyId, UUID oldRoomId, UUID departingTenancyId, UUID moveRequestId) {
        properties.lockRoomInventory(propertyId);
        BedHold hold = holds.activeOnDeparture(departingTenancyId).orElse(null);
        if (hold == null) return false;
        if (!hold.getPropertyId().equals(propertyId) || !hold.getRoomId().equals(oldRoomId)
                || (moveRequestId != null && !moveRequestId.equals(hold.getRoomChangeRequestId()))) {
            throw new ValidationException("The promised departure no longer matches its bed hold");
        }
        return hold.materialize();
    }

    @Transactional(readOnly = true)
    public boolean departureClaimed(UUID tenancyId) {
        return holds.activeOnDeparture(tenancyId).isPresent();
    }

    private static BookingBedHoldResponse response(BedHold hold) {
        return new BookingBedHoldResponse(hold.getId(), hold.getOwnerId(), hold.getPropertyId(), hold.getRoomId(),
                hold.getMoveInDate(), hold.getExitRequestId(), hold.getState().name());
    }
}
