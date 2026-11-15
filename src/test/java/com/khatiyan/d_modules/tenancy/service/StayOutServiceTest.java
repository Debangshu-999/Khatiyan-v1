package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.tenancy.api.dto.SaveStayOutRequest;
import com.khatiyan.d_modules.tenancy.api.dto.StayOutBoardResponse;
import com.khatiyan.d_modules.tenancy.event.StayOutChangedEvent;
import com.khatiyan.d_modules.tenancy.model.StayOut;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.repository.StayOutRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

/** Declaring, changing and reading stay outs (user, 2026-11-08). */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class StayOutServiceTest {

    /** 10:00 IST on Thursday 12 Nov 2026. */
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-12T04:30:00Z"), ZoneOffset.UTC);
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 12);
    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();

    @Mock private StayOutRepository stayOuts;
    @Mock private TenancyRepository tenancies;
    @Mock private PropertyModule propertyModule;
    @Mock private TenancyAccessPolicy access;
    @Mock private AuthModule authModule;
    @Mock private ApplicationEventPublisher events;

    private StayOutService service;
    private Tenancy tenancy;

    @BeforeEach
    void setUp() {
        service = new StayOutService(stayOuts, tenancies, propertyModule, access, authModule, events, CLOCK);
        tenancy = Tenancy.start(TENANT, UUID.randomUUID(), UUID.randomUUID(), OWNER, 800000, 100000, LocalDate.of(2026, 8, 1));
        when(tenancies.findByUserIdAndActiveTrueForUpdate(TENANT)).thenReturn(Optional.of(tenancy));
        when(tenancies.findByUserIdAndActiveTrue(TENANT)).thenReturn(Optional.of(tenancy));
        servedAt(PropertyType.PG);
        when(stayOuts.save(any(StayOut.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(authModule.findById(TENANT)).thenReturn(Optional.of(user(TENANT, "Rohan Das")));
    }

    @Test
    void declaringAStayOutSavesItAndTellsManagement() {
        var saved = service.declare(TENANT, request(TODAY.plusDays(1), MealType.LUNCH, TODAY.plusDays(3), MealType.DINNER));

        assertThat(saved.leaveDate()).isEqualTo(TODAY.plusDays(1));
        assertThat(saved.state()).isEqualTo("UPCOMING");
        ArgumentCaptor<StayOutChangedEvent> event = ArgumentCaptor.forClass(StayOutChangedEvent.class);
        verify(events).publishEvent(event.capture());
        assertThat(event.getValue().kind()).isEqualTo(StayOutChangedEvent.Kind.DECLARED);
        assertThat(event.getValue().tenantName()).isEqualTo("Rohan Das");
        assertThat(event.getValue().propertyId()).isEqualTo(tenancy.getPropertyId());
    }

    /** The reason is the tenant's own words (user, 2026-11-08), trimmed, and blank means none. */
    @Test
    void theReasonIsFreeTextAndBlankMeansNone() {
        var saved = service.declare(TENANT, new SaveStayOutRequest(TODAY.plusDays(1), null, TODAY.plusDays(2), null, "  Going home for Diwali  "));
        assertThat(saved.reason()).isEqualTo("Going home for Diwali");

        var plain = service.declare(TENANT, new SaveStayOutRequest(TODAY.plusDays(5), null, TODAY.plusDays(6), null, "   "));
        assertThat(plain.reason()).isNull();
    }

    @Test
    void stayOutsAreForPgsAndHostels() {
        servedAt(PropertyType.APARTMENT);

        assertThatThrownBy(() -> service.declare(TENANT, request(TODAY.plusDays(1), null, TODAY.plusDays(2), null)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Stay outs are for PGs and hostels.");
    }

    @Test
    void theLeavingDayCannotBeInThePast() {
        assertThatThrownBy(() -> service.declare(TENANT, request(TODAY.minusDays(1), null, TODAY.plusDays(2), null)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Choose a leaving day from today.");
    }

    @Test
    void nightsAlreadyCoveredAreRefused() {
        when(stayOuts.findByTenancyIdAndCancelledAtIsNullOrderByLeaveDateDesc(tenancy.getId())).thenReturn(List.of(
                StayOut.declare(tenancy.getId(), tenancy.getPropertyId(), TENANT, TODAY.plusDays(2), null, TODAY.plusDays(5), null, null)));

        assertThatThrownBy(() -> service.declare(TENANT, request(TODAY.plusDays(4), null, TODAY.plusDays(6), null)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("You already have a stay out on some of those nights.");
        verify(stayOuts, never()).save(any());
    }

    @Test
    void comingBackAfterTheStayEndsIsRefused() {
        tenancy.scheduleEndDate(TODAY.plusDays(3));

        assertThatThrownBy(() -> service.declare(TENANT, request(TODAY.plusDays(1), null, TODAY.plusDays(4), null)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Your stay ends on 15 Nov 2026. Come back by then.");
    }

    @Test
    void aMealThePropertyDoesNotServeIsRefused() {
        assertThatThrownBy(() -> service.declare(TENANT, request(TODAY.plusDays(1), MealType.EVENING_SNACKS, TODAY.plusDays(2), null)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("This property does not serve evening snacks.");
    }

    /** Gone already: the leaving part is history, the coming back can still move. */
    @Test
    void onceLeftOnlyTheReturnChanges() {
        StayOut stay = StayOut.declare(tenancy.getId(), tenancy.getPropertyId(), TENANT, TODAY.minusDays(1), MealType.LUNCH, TODAY.plusDays(3), null, null);
        when(stayOuts.findById(stay.getId())).thenReturn(Optional.of(stay));

        assertThatThrownBy(() -> service.change(TENANT, stay.getId(), request(TODAY, null, TODAY.plusDays(3), null)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("You have already left, so only your return can change.");

        var changed = service.change(TENANT, stay.getId(), request(TODAY.minusDays(1), MealType.LUNCH, TODAY.plusDays(1), MealType.DINNER));
        assertThat(changed.returnDate()).isEqualTo(TODAY.plusDays(1));
        assertThat(changed.state()).isEqualTo("AWAY");
    }

    @Test
    void cancellingAfterLeavingIsRefused() {
        StayOut stay = StayOut.declare(tenancy.getId(), tenancy.getPropertyId(), TENANT, TODAY.minusDays(1), null, TODAY.plusDays(3), null, null);
        when(stayOuts.findById(stay.getId())).thenReturn(Optional.of(stay));

        assertThatThrownBy(() -> service.cancel(TENANT, stay.getId()))
                .isInstanceOf(ValidationException.class)
                .hasMessage("You have already left. Change your return day to come back early.");
    }

    @Test
    void theBoardListsStayOutsThatEndedInTheLastThirtyDaysAsPast() {
        // A Past filter on the owner's stay outs (user, 2026-11-14): back before today, newest first.
        UUID propertyId = tenancy.getPropertyId();
        StayOut ended = StayOut.declare(tenancy.getId(), propertyId, TENANT, TODAY.minusDays(6), null, TODAY.minusDays(4), null, "Wedding");
        when(stayOuts.findPastAtProperty(propertyId, TODAY.minusDays(30), TODAY)).thenReturn(List.of(ended));
        when(tenancies.findAllById(anyCollection())).thenReturn(List.of(tenancy));
        when(authModule.findByIds(anyCollection())).thenReturn(Map.of(TENANT, user(TENANT, "Rohan Das")));

        StayOutBoardResponse board = service.board(OWNER, propertyId);

        assertThat(board.past()).extracting(StayOutBoardResponse.Entry::tenantName).containsExactly("Rohan Das");
        assertThat(board.past()).extracting(StayOutBoardResponse.Entry::returnDate).containsExactly(TODAY.minusDays(4));
        assertThat(board.awayTonight()).isEmpty();
    }

    @Test
    void theBoardSplitsAwayTonightBackTodayAndUpcoming() {
        UUID propertyId = tenancy.getPropertyId();
        Tenancy other = Tenancy.start(UUID.randomUUID(), propertyId, UUID.randomUUID(), OWNER, 800000, 100000, LocalDate.of(2026, 8, 1));
        StayOut away = StayOut.declare(tenancy.getId(), propertyId, TENANT, TODAY.minusDays(1), null, TODAY.plusDays(2), MealType.DINNER, "Home visit");
        StayOut back = StayOut.declare(other.getId(), propertyId, other.getUserId(), TODAY.minusDays(2), null, TODAY, MealType.LUNCH, null);
        StayOut later = StayOut.declare(other.getId(), propertyId, other.getUserId(), TODAY.plusDays(5), null, TODAY.plusDays(7), null, "Work");
        when(stayOuts.findLiveAtProperty(eq(propertyId), any(), any())).thenReturn(List.of(back, away, later));
        when(tenancies.findAllById(anyCollection())).thenReturn(List.of(tenancy, other));
        when(authModule.findByIds(anyCollection())).thenReturn(Map.of(
                TENANT, user(TENANT, "Rohan Das"), other.getUserId(), user(other.getUserId(), "Priya Sen")));

        StayOutBoardResponse board = service.board(OWNER, propertyId);

        verify(access).ensureCanViewCurrentStays(OWNER, propertyId);
        assertThat(board.awayTonight()).extracting(StayOutBoardResponse.Entry::tenantName).containsExactly("Rohan Das");
        assertThat(board.backToday()).extracting(StayOutBoardResponse.Entry::tenantName).containsExactly("Priya Sen");
        assertThat(board.upcoming()).extracting(StayOutBoardResponse.Entry::leaveDate).containsExactly(TODAY.plusDays(5));
    }

    @Test
    void theTenanciesAwayForAMealAreThoseItTakesOff() {
        UUID propertyId = tenancy.getPropertyId();
        StayOut gone = StayOut.declare(tenancy.getId(), propertyId, TENANT, TODAY.minusDays(1), null, TODAY.plusDays(1), null, null);
        StayOut leavingAfterLunch = StayOut.declare(UUID.randomUUID(), propertyId, UUID.randomUUID(), TODAY, MealType.LUNCH, TODAY.plusDays(2), null, null);
        when(stayOuts.findLiveAtProperty(propertyId, TODAY, TODAY)).thenReturn(List.of(gone, leavingAfterLunch));

        assertThat(service.awayTenancyIds(propertyId, TODAY, MealType.LUNCH)).containsExactly(tenancy.getId());
        assertThat(service.awayTenancyIds(propertyId, TODAY, MealType.DINNER))
                .containsExactlyInAnyOrder(tenancy.getId(), leavingAfterLunch.getTenancyId());
    }

    // ---- helpers ---------------------------------------------------------

    private void servedAt(PropertyType type) {
        when(propertyModule.getActiveProperty(tenancy.getPropertyId())).thenReturn(property(tenancy.getPropertyId(), type,
                Set.of(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER)));
    }

    private static SaveStayOutRequest request(LocalDate leave, MealType last, LocalDate back, MealType first) {
        return new SaveStayOutRequest(leave, last, back, first, null);
    }

    private static UserSummaryResponse user(UUID id, String name) {
        return new UserSummaryResponse(id, "9876543210", null, name, null, null, true, true, true, false, true);
    }

    private static PropertyResponse property(UUID id, PropertyType type, Set<MealType> meals) {
        return new PropertyResponse(
                id, "PROP-TEST", UUID.randomUUID(), "Sky PG", "Address", "Area", "City", "State", "700001",
                null, null, type, PgFor.ANYONE, PreferredTenantType.ANYONE, true, meals, false, BathroomType.COMMON,
                Set.of(), Set.of(), Set.of(), null, null, 0L, BillingCollectionTiming.CYCLE_START, 0, 0L,
                NoticePeriod.ONE_MONTH, 0, null, null, false, true, 0L);
    }
}
