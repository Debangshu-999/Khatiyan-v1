package com.khatiyan.d_modules.tenancy.service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.tenancy.api.dto.SaveStayOutRequest;
import com.khatiyan.d_modules.tenancy.api.dto.StayOutBoardResponse;
import com.khatiyan.d_modules.tenancy.api.dto.StayOutListResponse;
import com.khatiyan.d_modules.tenancy.api.dto.StayOutResponse;
import com.khatiyan.d_modules.tenancy.event.StayOutChangedEvent;
import com.khatiyan.d_modules.tenancy.model.StayOut;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.repository.StayOutRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Declared stay outs (user, 2026-11-08). A tenant on a monthly stay at a PG or
 * hostel says which nights they will be away and from which meal to which
 * meal. Food leaves them out of those meals, management sees who is away.
 *
 * <p>Before the leaving day passes, the whole stay out can change or be
 * cancelled. Once it has, only the return can move: back early or staying on.
 * A stay out never runs past the stay's checkout date.
 */
@Slf4j
@Service
public class StayOutService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    private static final Set<PropertyType> FOR = Set.of(PropertyType.PG, PropertyType.HOSTEL);
    /** How far ahead the board looks for upcoming stay outs. */
    private static final int UPCOMING_DAYS = 30;

    private final StayOutRepository stayOuts;
    private final TenancyRepository tenancies;
    private final PropertyModule propertyModule;
    private final TenancyAccessPolicy access;
    private final AuthModule authModule;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public StayOutService(
            StayOutRepository stayOuts,
            TenancyRepository tenancies,
            PropertyModule propertyModule,
            TenancyAccessPolicy access,
            AuthModule authModule,
            ApplicationEventPublisher events,
            Clock clock) {
        this.stayOuts = stayOuts;
        this.tenancies = tenancies;
        this.propertyModule = propertyModule;
        this.access = access;
        this.authModule = authModule;
        this.events = events;
        this.clock = clock;
    }

    // ---- The tenant's own -------------------------------------------------

    /** The tenant's stay outs, newest first, and what declaring one needs. */
    @Transactional(readOnly = true)
    public StayOutListResponse mine(UUID tenantUserId) {
        Tenancy tenancy = tenancies.findByUserIdAndActiveTrue(tenantUserId).orElse(null);
        if (tenancy == null) {
            return new StayOutListResponse(false, List.of(), null, List.of());
        }
        PropertyResponse property = propertyModule.getActiveProperty(tenancy.getPropertyId());
        LocalDate today = today();
        List<StayOutResponse> list = stayOuts.findByTenancyIdAndCancelledAtIsNullOrderByLeaveDateDesc(tenancy.getId())
                .stream()
                .map(stay -> toResponse(stay, today))
                .toList();
        return new StayOutListResponse(canHaveStayOuts(tenancy, property), servedMeals(property),
                tenancy.checkoutDate(), list);
    }

    @Transactional
    public StayOutResponse declare(UUID tenantUserId, SaveStayOutRequest request) {
        Tenancy tenancy = ownStayForUpdate(tenantUserId);
        PropertyResponse property = requireAvailable(tenancy);
        LocalDate today = today();
        if (request.leaveDate().isBefore(today)) {
            throw new ValidationException("Choose a leaving day from today.");
        }
        requireWithinStay(tenancy, request.returnDate());
        requireNoOverlap(tenancy.getId(), null, request.leaveDate(), request.returnDate());

        StayOut stay = StayOut.declare(tenancy.getId(), tenancy.getPropertyId(), tenantUserId,
                request.leaveDate(), meal(property, request.lastMealHere()),
                request.returnDate(), meal(property, request.firstMealBack()), request.reason());
        stayOuts.save(stay);
        publish(StayOutChangedEvent.Kind.DECLARED, stay, tenancy);
        log.info("Stay out declared stayOutId={} tenancyId={} leave={} return={}",
                stay.getId(), tenancy.getId(), stay.getLeaveDate(), stay.getReturnDate());
        return toResponse(stay, today);
    }

    @Transactional
    public StayOutResponse change(UUID tenantUserId, UUID stayOutId, SaveStayOutRequest request) {
        Tenancy tenancy = ownStayForUpdate(tenantUserId);
        PropertyResponse property = requireAvailable(tenancy);
        StayOut stay = ownStayOut(tenancy, stayOutId);
        LocalDate today = today();
        if (stay.getReturnDate().isBefore(today)) {
            throw new ValidationException("This stay out is over.");
        }
        MealType lastMeal = meal(property, request.lastMealHere());
        MealType firstMeal = meal(property, request.firstMealBack());
        requireWithinStay(tenancy, request.returnDate());

        if (stay.getLeaveDate().isBefore(today)) {
            // Gone already: the leaving part is history.
            if (!request.leaveDate().equals(stay.getLeaveDate()) || !Objects.equals(lastMeal, stay.getLastMealHere())) {
                throw new ValidationException("You have already left, so only your return can change.");
            }
            if (request.returnDate().isBefore(today)) {
                throw new ValidationException("Choose a return day from today.");
            }
            requireNoOverlap(tenancy.getId(), stay.getId(), stay.getLeaveDate(), request.returnDate());
            stay.changeReturn(request.returnDate(), firstMeal, request.reason());
        } else {
            if (request.leaveDate().isBefore(today)) {
                throw new ValidationException("Choose a leaving day from today.");
            }
            requireNoOverlap(tenancy.getId(), stay.getId(), request.leaveDate(), request.returnDate());
            stay.change(request.leaveDate(), lastMeal, request.returnDate(), firstMeal, request.reason());
        }
        publish(StayOutChangedEvent.Kind.CHANGED, stay, tenancy);
        return toResponse(stay, today);
    }

    @Transactional
    public void cancel(UUID tenantUserId, UUID stayOutId) {
        Tenancy tenancy = ownStayForUpdate(tenantUserId);
        StayOut stay = ownStayOut(tenancy, stayOutId);
        if (stay.getLeaveDate().isBefore(today())) {
            throw new ValidationException("You have already left. Change your return day to come back early.");
        }
        stay.cancel();
        publish(StayOutChangedEvent.Kind.CANCELLED, stay, tenancy);
    }

    // ---- Management -------------------------------------------------------

    /**
     * Who is away tonight, who is back today, who leaves in the next 30 days, and
     * who came back in the last 30 (the Past filter, user, 2026-11-14).
     */
    @Transactional(readOnly = true)
    public StayOutBoardResponse board(UUID actorUserId, UUID propertyId) {
        access.ensureCanViewCurrentStays(actorUserId, propertyId);
        LocalDate today = today();
        List<StayOut> live = stayOuts.findLiveAtProperty(propertyId, today, today.plusDays(UPCOMING_DAYS));
        List<StayOut> ended = stayOuts.findPastAtProperty(propertyId, today.minusDays(UPCOMING_DAYS), today);
        List<StayOut> shown = new ArrayList<>(live);
        shown.addAll(ended);

        Map<UUID, Tenancy> stays = tenancies.findAllById(shown.stream().map(StayOut::getTenancyId).distinct().toList())
                .stream()
                .collect(Collectors.toMap(Tenancy::getId, Function.identity()));
        Map<UUID, UserSummaryResponse> people = authModule.findByIds(
                shown.stream().map(StayOut::getTenantUserId).collect(Collectors.toSet()));
        Map<UUID, RoomResponse> rooms = propertyModule.findRoomsForDisplay(propertyId,
                stays.values().stream().map(Tenancy::getRoomId).filter(Objects::nonNull).collect(Collectors.toSet()));

        List<StayOutBoardResponse.Entry> awayTonight = new ArrayList<>();
        List<StayOutBoardResponse.Entry> backToday = new ArrayList<>();
        List<StayOutBoardResponse.Entry> upcoming = new ArrayList<>();
        for (StayOut stay : live) {
            StayOutBoardResponse.Entry entry = entry(stay, stays, people, rooms);
            if (stay.getReturnDate().equals(today)) {
                backToday.add(entry);
            } else if (stay.isAwayOnNightOf(today)) {
                awayTonight.add(entry);
            } else if (stay.getLeaveDate().isAfter(today)) {
                upcoming.add(entry);
            }
        }
        List<StayOutBoardResponse.Entry> past = ended.stream().map(stay -> entry(stay, stays, people, rooms)).toList();
        return new StayOutBoardResponse(awayTonight, backToday, upcoming, past);
    }

    // ---- For food ---------------------------------------------------------

    /** The stays at a property that a stay out takes off {@code meal} on {@code date}. */
    @Transactional(readOnly = true)
    public Set<UUID> awayTenancyIds(UUID propertyId, LocalDate date, MealType meal) {
        return stayOuts.findLiveAtProperty(propertyId, date, date).stream()
                .filter(stay -> stay.isAwayFor(date, meal))
                .map(StayOut::getTenancyId)
                .collect(Collectors.toSet());
    }

    // ---- Rules ------------------------------------------------------------

    private Tenancy ownStayForUpdate(UUID tenantUserId) {
        return tenancies.findByUserIdAndActiveTrueForUpdate(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancy", tenantUserId));
    }

    private StayOut ownStayOut(Tenancy tenancy, UUID stayOutId) {
        return stayOuts.findById(stayOutId)
                .filter(stay -> stay.getTenancyId().equals(tenancy.getId()) && !stay.isCancelled())
                .orElseThrow(() -> new NotFoundException("StayOut", stayOutId));
    }

    private PropertyResponse requireAvailable(Tenancy tenancy) {
        PropertyResponse property = propertyModule.getActiveProperty(tenancy.getPropertyId());
        if (!FOR.contains(property.type())) {
            throw new ValidationException("Stay outs are for PGs and hostels.");
        }
        if (!tenancy.isMonthly() || !tenancy.isCurrentlyActive()) {
            throw new ValidationException("Stay outs are for a current monthly stay.");
        }
        return property;
    }

    private static boolean canHaveStayOuts(Tenancy tenancy, PropertyResponse property) {
        return FOR.contains(property.type()) && tenancy.isMonthly() && tenancy.isCurrentlyActive();
    }

    private static void requireWithinStay(Tenancy tenancy, LocalDate returnDate) {
        LocalDate checkout = tenancy.checkoutDate();
        if (checkout != null && returnDate.isAfter(checkout)) {
            throw new ValidationException("Your stay ends on " + checkout.format(DAY) + ". Come back by then.");
        }
    }

    private void requireNoOverlap(UUID tenancyId, UUID ignoring, LocalDate leave, LocalDate back) {
        boolean taken = stayOuts.findByTenancyIdAndCancelledAtIsNullOrderByLeaveDateDesc(tenancyId).stream()
                .filter(stay -> !stay.getId().equals(ignoring))
                .anyMatch(stay -> stay.overlaps(leave, back));
        if (taken) {
            throw new ValidationException("You already have a stay out on some of those nights.");
        }
    }

    /** A meal the property serves, or nothing where it serves none. */
    private static MealType meal(PropertyResponse property, MealType meal) {
        if (meal == null || !property.foodIncluded() || property.includedMeals() == null || property.includedMeals().isEmpty()) {
            return null;
        }
        if (!property.includedMeals().contains(meal)) {
            throw new ValidationException("This property does not serve " + label(meal) + ".");
        }
        return meal;
    }

    private static List<MealType> servedMeals(PropertyResponse property) {
        if (!property.foodIncluded() || property.includedMeals() == null) {
            return List.of();
        }
        return StayOut.MEAL_ORDER.stream().filter(property.includedMeals()::contains).toList();
    }

    private static String label(MealType meal) {
        return switch (meal) {
            case BREAKFAST -> "breakfast";
            case LUNCH -> "lunch";
            case EVENING_SNACKS -> "evening snacks";
            case DINNER -> "dinner";
        };
    }

    private void publish(StayOutChangedEvent.Kind kind, StayOut stay, Tenancy tenancy) {
        String name = authModule.findById(stay.getTenantUserId()).map(UserSummaryResponse::fullName).orElse(null);
        events.publishEvent(new StayOutChangedEvent(kind, stay.getId(), stay.getTenancyId(), tenancy.getReferenceCode(),
                stay.getTenantUserId(), name, stay.getPropertyId(), stay.getLeaveDate(), stay.getLastMealHere(),
                stay.getReturnDate(), stay.getFirstMealBack(), stay.getReason()));
    }

    private static StayOutResponse toResponse(StayOut stay, LocalDate today) {
        String state = stay.getLeaveDate().isAfter(today) ? "UPCOMING"
                : stay.getReturnDate().isBefore(today) ? "DONE"
                : "AWAY";
        boolean notLeft = !stay.getLeaveDate().isBefore(today);
        return new StayOutResponse(stay.getId(), stay.getLeaveDate(), stay.getLastMealHere(), stay.getReturnDate(),
                stay.getFirstMealBack(), stay.getReason(), state, notLeft, notLeft);
    }

    private static StayOutBoardResponse.Entry entry(StayOut stay, Map<UUID, Tenancy> stays,
            Map<UUID, UserSummaryResponse> people, Map<UUID, RoomResponse> rooms) {
        Tenancy tenancy = stays.get(stay.getTenancyId());
        UserSummaryResponse person = people.get(stay.getTenantUserId());
        RoomResponse room = tenancy == null || tenancy.getRoomId() == null ? null : rooms.get(tenancy.getRoomId());
        return new StayOutBoardResponse.Entry(stay.getId(), stay.getTenancyId(),
                tenancy == null ? null : tenancy.getReferenceCode(),
                person == null ? null : person.fullName(), room == null ? null : room.roomNumber(),
                stay.getLeaveDate(), stay.getLastMealHere(), stay.getReturnDate(), stay.getFirstMealBack(),
                stay.getReason());
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(IST));
    }
}
