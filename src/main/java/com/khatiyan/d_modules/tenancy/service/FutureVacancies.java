package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.tenancy.event.FutureBookingBlockedEvent;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;
import com.khatiyan.d_modules.tenancy.repository.TenancyExitRequestRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRoomChangeRequestRepository;

/**
 * Which full beds can be booked ahead, and whether a booking's bed has freed.
 *
 * <p>Two departures free a bed on a known day:
 * <ul>
 *   <li><b>An approved room change</b>, on its transfer date. It runs by itself.</li>
 *   <li><b>A stay certain to end, ending soon</b> (owner's rule, 2026-09-27).
 *       Certain means an approved exit whose withdrawal window has closed, or a
 *       fixed term, which nothing can extend. Soon means inside the stay's own
 *       Ends-soon window (7 days, or 7/15/30 by term length), the same moment
 *       the tenancy list starts showing it. Its bed frees only when a person
 *       ends the stay: exits are never automatic.</li>
 * </ul>
 * One rule, read by both the onboarding list and the claim, so the app never
 * offers a bed the server would refuse.
 */
@Component
public class FutureVacancies {

    public enum Source { ROOM_CHANGE, EXIT }

    public record UpcomingVacancy(UUID roomId, LocalDate availableFrom, Source source) {}

    /** What a new booking claims: exactly one of the two. */
    public record Claim(UUID roomChangeRequestId, UUID departingTenancyId) {}

    /** Why a booking's bed is not free yet, and which stay holds it. */
    public record Blocker(FutureBookingBlockedEvent.Reason reason, Tenancy blockingStay) {}

    private static final Set<TenancyStatus> DEPARTING = EnumSet.of(
            TenancyStatus.ACTIVE,
            TenancyStatus.ON_NOTICE,
            TenancyStatus.ON_PREMATURE_NOTICE,
            TenancyStatus.PENDING_EXIT);

    private final TenancyRepository tenancyRepository;
    private final TenancyRoomChangeRequestRepository roomChangeRequestRepository;
    private final TenancyExitRequestRepository exitRequestRepository;

    public FutureVacancies(
            TenancyRepository tenancyRepository,
            TenancyRoomChangeRequestRepository roomChangeRequestRepository,
            TenancyExitRequestRepository exitRequestRepository) {
        this.tenancyRepository = tenancyRepository;
        this.roomChangeRequestRepository = roomChangeRequestRepository;
        this.exitRequestRepository = exitRequestRepository;
    }

    /**
     * The day a stay's bed can be booked from, or null while its end is not
     * yet certain and close.
     *
     * <p>A stay past its checkout (Pending exit) is bookable from today: it
     * frees the moment the owner ends it.
     */
    static LocalDate departingStayAvailableFrom(
            Tenancy stay, List<TenancyExitRequest> exitRequests, boolean hasApprovedMove, LocalDate today) {
        // A stay with an approved move is offered through the move, not here.
        if (!stay.isActive()
                || stay.getBillingType() != TenancyBillingType.MONTHLY
                || !DEPARTING.contains(stay.getStatus())
                || hasApprovedMove) {
            return null;
        }
        LocalDate checkout = stay.checkoutDate();
        if (checkout == null) {
            return null;
        }

        boolean approvedExit = false;
        for (TenancyExitRequest request : exitRequests) {
            // A withdrawal the owner has not decided, or an approval the tenant
            // can still withdraw: the date may yet change.
            if (request.getStatus() == TenancyExitRequestStatus.WITHDRAWAL_REQUESTED) {
                return null;
            }
            if (request.getStatus() == TenancyExitRequestStatus.APPROVED) {
                if (request.withdrawalWindowOpen(today)) {
                    return null;
                }
                approvedExit = true;
            }
        }
        if (!approvedExit && !stay.hasFixedTerm()) {
            return null;
        }
        if (checkout.minusDays(stay.endingSoonLeadDays()).isAfter(today)) {
            return null;
        }
        return checkout.isBefore(today) ? today : checkout;
    }

    /** Every full-room bed in the property that can be booked ahead and is not booked yet. */
    public List<UpcomingVacancy> upcoming(UUID propertyId, LocalDate today) {
        List<UpcomingVacancy> vacancies = new ArrayList<>();

        List<TenancyRoomChangeRequest> moves = roomChangeRequestRepository
                .findByPropertyIdAndStatus(propertyId, TenancyRoomChangeRequestStatus.APPROVED);
        Set<UUID> bookedMoves = moves.isEmpty() ? Set.of() : new HashSet<>(
                tenancyRepository.findBookedFutureVacancySourceIds(moves.stream().map(TenancyRoomChangeRequest::getId).toList()));
        Set<UUID> movers = new HashSet<>();
        for (TenancyRoomChangeRequest move : moves) {
            movers.add(move.getTenancyId());
            if (!bookedMoves.contains(move.getId()) && !move.getEffectiveTransferDate().isBefore(today)) {
                vacancies.add(new UpcomingVacancy(move.getCurrentRoomId(), move.getEffectiveTransferDate(), Source.ROOM_CHANGE));
            }
        }

        List<Tenancy> stays = tenancyRepository.findByPropertyIdAndActiveTrue(propertyId);
        Map<UUID, List<TenancyExitRequest>> exitsByStay = exitRequestRepository.findByPropertyId(propertyId).stream()
                .collect(Collectors.groupingBy(TenancyExitRequest::getTenancyId));
        Set<UUID> bookedStays = stays.isEmpty() ? Set.of() : new HashSet<>(
                tenancyRepository.findBookedDepartingTenancyIds(stays.stream().map(Tenancy::getId).toList()));
        for (Tenancy stay : stays) {
            LocalDate from = departingStayAvailableFrom(
                    stay, exitsByStay.getOrDefault(stay.getId(), List.of()), movers.contains(stay.getId()), today);
            if (from != null && !bookedStays.contains(stay.getId())) {
                vacancies.add(new UpcomingVacancy(stay.getRoomId(), from, Source.EXIT));
            }
        }

        vacancies.sort(Comparator.comparing(UpcomingVacancy::availableFrom));
        return vacancies;
    }

    /**
     * Claims one unbooked departure from a full room that frees by the start
     * date, under row locks. Null when none does. The partial unique indexes
     * are the last guard if two owners race past the locks.
     */
    public Claim claim(UUID propertyId, UUID roomId, LocalDate startDate, LocalDate today) {
        for (TenancyRoomChangeRequest request : roomChangeRequestRepository
                .findBookableDeparturesForUpdate(propertyId, roomId, today, startDate)) {
            if (!tenancyRepository.existsByFutureVacancySourceIdAndActiveTrue(request.getId())) {
                return new Claim(request.getId(), null);
            }
        }
        for (Tenancy stay : tenancyRepository.findLiveInRoomForUpdate(roomId)) {
            if (!DEPARTING.contains(stay.getStatus())) {
                continue;
            }
            boolean hasApprovedMove = roomChangeRequestRepository
                    .findOpenByTenancyId(stay.getId(), List.of(TenancyRoomChangeRequestStatus.APPROVED))
                    .isPresent();
            LocalDate from = departingStayAvailableFrom(
                    stay, exitRequestRepository.findByTenancyId(stay.getId()), hasApprovedMove, today);
            if (from != null && !from.isAfter(startDate)
                    && !tenancyRepository.existsByFutureVacancyTenancyIdAndActiveTrue(stay.getId())) {
                return new Claim(null, stay.getId());
            }
        }
        return null;
    }

    /**
     * Whether the bed a booking claimed has freed, and so is held for it.
     *
     * <p>A room change frees it by running, or by the mover leaving instead:
     * their stay ended while still in the room the booking claimed. A departing
     * stay frees it by being ended.
     */
    public boolean bedFreed(Tenancy booking) {
        if (booking.getFutureVacancySourceId() != null) {
            TenancyRoomChangeRequest move = roomChangeRequestRepository
                    .findById(booking.getFutureVacancySourceId()).orElse(null);
            if (move == null) {
                return false;
            }
            if (move.getStatus() == TenancyRoomChangeRequestStatus.EXECUTED) {
                return true;
            }
            return tenancyRepository.findById(move.getTenancyId())
                    .filter(mover -> isEnded(mover) && mover.getRoomId().equals(move.getCurrentRoomId()))
                    .isPresent();
        }
        if (booking.getFutureVacancyTenancyId() != null) {
            return tenancyRepository.findById(booking.getFutureVacancyTenancyId())
                    .filter(FutureVacancies::isEnded)
                    .isPresent();
        }
        return false;
    }

    /** Why a booking's bed has not freed. Null once it has. */
    public Blocker blocker(Tenancy booking) {
        if (!booking.hasFutureVacancyClaim() || bedFreed(booking)) {
            return null;
        }
        if (booking.getFutureVacancySourceId() != null) {
            TenancyRoomChangeRequest move = roomChangeRequestRepository
                    .findById(booking.getFutureVacancySourceId()).orElse(null);
            Tenancy mover = move == null ? null : tenancyRepository.findById(move.getTenancyId()).orElse(null);
            // A mover past their own checkout cannot move: ending their stay is what frees the bed.
            if (mover != null && mover.getStatus() == TenancyStatus.PENDING_EXIT) {
                return new Blocker(FutureBookingBlockedEvent.Reason.PENDING_EXIT, mover);
            }
            return new Blocker(FutureBookingBlockedEvent.Reason.ROOM_CHANGE_NOT_DONE, mover);
        }
        Tenancy departing = tenancyRepository.findById(booking.getFutureVacancyTenancyId()).orElse(null);
        return new Blocker(
                departing != null && departing.getStatus() == TenancyStatus.PENDING_EXIT
                        ? FutureBookingBlockedEvent.Reason.PENDING_EXIT
                        : FutureBookingBlockedEvent.Reason.STAY_NOT_ENDED,
                departing);
    }

    /**
     * A signed booking that should have started and cannot. Late once its start
     * date has passed, or on the start date itself when its departure is
     * already overdue (a move whose date passed, a stay past its checkout).
     */
    public boolean isLate(Tenancy booking, LocalDate today) {
        if (booking.getStatus() != TenancyStatus.SCHEDULED
                || booking.getStartDate().isAfter(today)
                || bedFreed(booking)) {
            return false;
        }
        if (booking.getStartDate().isBefore(today)) {
            return true;
        }
        if (booking.getFutureVacancySourceId() != null) {
            return roomChangeRequestRepository.findById(booking.getFutureVacancySourceId())
                    .map(move -> move.getEffectiveTransferDate().isBefore(today))
                    .orElse(true);
        }
        return tenancyRepository.findById(booking.getFutureVacancyTenancyId())
                .map(stay -> stay.checkoutDate() == null || stay.checkoutDate().isBefore(today))
                .orElse(true);
    }

    /** The live booking waiting on this stay's bed, if any: claimed directly, or through its approved move. */
    public Tenancy bookingWaitingOn(Tenancy stay) {
        Tenancy direct = tenancyRepository.findFirstByFutureVacancyTenancyIdAndActiveTrue(stay.getId()).orElse(null);
        if (direct != null) {
            return direct;
        }
        return roomChangeRequestRepository
                .findOpenByTenancyId(stay.getId(), List.of(TenancyRoomChangeRequestStatus.APPROVED))
                .filter(move -> move.getCurrentRoomId().equals(stay.getRoomId()))
                .flatMap(move -> tenancyRepository.findFirstByFutureVacancySourceIdAndActiveTrue(move.getId()))
                .orElse(null);
    }

    private static boolean isEnded(Tenancy tenancy) {
        return tenancy.getStatus() == TenancyStatus.EXITED || tenancy.getStatus() == TenancyStatus.EVICTED;
    }
}
