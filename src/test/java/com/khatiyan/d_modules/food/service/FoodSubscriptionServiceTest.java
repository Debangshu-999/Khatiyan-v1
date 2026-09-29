package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.FoodPlanResponse;
import com.khatiyan.d_modules.food.api.dto.FoodSubscriberResponse;
import com.khatiyan.d_modules.food.api.dto.SubscribeFoodProfileRequest;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodProfileCategory;
import com.khatiyan.d_modules.food.model.FoodSubscription;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

/**
 * Food plans as dated versions (2026-09-29): every change starts tomorrow,
 * a stop runs to midnight, and a hybrid week names a profile per day.
 *
 * <p>"Now" is Tuesday 29 Sep 2026, 10:00 IST, so tomorrow is Wednesday 30.
 * The repository is a small in-memory store, so each rule is checked against
 * real dates rather than stubbed answers.
 */
@ExtendWith(MockitoExtension.class)
class FoodSubscriptionServiceTest {

    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID TENANCY = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID ACTOR = UUID.randomUUID();
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 29);
    private static final LocalDate TOMORROW = TODAY.plusDays(1);
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-29T04:30:00Z"), ZoneOffset.UTC);

    private final FoodProfile veg = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0, FoodProfileCategory.VEG);
    private final FoodProfile nonVeg = FoodProfile.create(PROPERTY, ACTOR, "Non-veg", null, 1, FoodProfileCategory.NON_VEG);
    private final FoodProfile jain = FoodProfile.create(PROPERTY, ACTOR, "Jain", null, 2, FoodProfileCategory.JAIN);

    @Mock private TenancyModule tenancyModule;
    @Mock private PropertyModule propertyModule;
    @Mock private FoodModuleSettingService moduleSettingService;
    @Mock private FoodAccessPolicy accessPolicy;
    @Mock private FoodProfileRepository profileRepository;
    @Mock private FoodSubscriptionRepository subscriptionRepository;
    @Mock private FoodMenuService menuService;
    private FoodSubscriptionService service;

    /** The in-memory store behind the repository mock. */
    private final List<FoodSubscription> store = new ArrayList<>();

    @BeforeEach
    void setUp() {
        service = new FoodSubscriptionService(
                tenancyModule,
                propertyModule,
                moduleSettingService,
                accessPolicy,
                profileRepository,
                subscriptionRepository,
                menuService,
                CLOCK);
        lenient().when(subscriptionRepository.findCoveringForTenancy(any(), any())).thenAnswer(call -> store.stream()
                .filter(plan -> plan.getTenancyId().equals(call.getArgument(0)) && plan.covers(call.getArgument(1)))
                .findFirst());
        lenient().when(subscriptionRepository.findByTenancyIdAndEffectiveFromAfter(any(), any())).thenAnswer(call -> store.stream()
                .filter(plan -> plan.getTenancyId().equals(call.getArgument(0))
                        && plan.getEffectiveFrom().isAfter(call.getArgument(1)))
                .toList());
        lenient().when(subscriptionRepository.findCovering(any(), any())).thenAnswer(call -> store.stream()
                .filter(plan -> plan.getPropertyId().equals(call.getArgument(0)) && plan.covers(call.getArgument(1)))
                .toList());
        lenient().when(subscriptionRepository.save(any(FoodSubscription.class))).thenAnswer(call -> {
            store.add(call.getArgument(0));
            return call.getArgument(0);
        });
        lenient().doAnswer(call -> store.remove(call.<FoodSubscription>getArgument(0)))
                .when(subscriptionRepository).delete(any(FoodSubscription.class));
        lenient().doAnswer(call -> store.removeAll(call.<List<FoodSubscription>>getArgument(0)))
                .when(subscriptionRepository).deleteAll(anyCollection());
        lenient().when(profileRepository.findAllById(any())).thenReturn(List.of(veg, nonVeg, jain));
        for (FoodProfile profile : List.of(veg, nonVeg, jain)) {
            lenient().when(profileRepository.findByIdAndActiveTrue(profile.getId())).thenReturn(Optional.of(profile));
        }
    }

    @Test
    void availabilityKeepsPropertyFoodSeparateFromModuleStatus() {
        activeTenancy();
        // Built, not mocked. PropertyResponse is a record and therefore final,
        // so Mockito cannot stub it — and a real one is clearer anyway: the
        // test says a property that offers food, with no meals configured.
        PropertyResponse property = FoodTestFixtures.property(PROPERTY, true, Set.of());
        when(propertyModule.getActiveProperty(PROPERTY)).thenReturn(property);
        when(moduleSettingService.isEnabled(PROPERTY)).thenReturn(false);

        var response = service.availability(TENANT);

        assertThat(response.foodAvailableInProperty()).isTrue();
        assertThat(response.moduleEnabled()).isFalse();
    }

    @Test
    void aFirstPlanStartsTomorrowNotToday() {
        activeTenancy();

        FoodPlanResponse plan = service.subscribe(TENANT, new SubscribeFoodProfileRequest(veg.getId(), null));

        assertThat(plan.today()).isNull();
        assertThat(plan.fromTomorrow().effectiveFrom()).isEqualTo(TOMORROW);
        assertThat(plan.fromTomorrow().hybrid()).isFalse();
        assertThat(plan.fromTomorrow().profileName()).isEqualTo("Veg");
        assertThat(store).singleElement().satisfies(saved -> assertThat(saved.getTenancyId()).isEqualTo(TENANCY));
        verify(moduleSettingService).requireUsable(PROPERTY);
    }

    @Test
    void aHybridWeekNamesAProfileForEachDay() {
        activeTenancy();

        FoodPlanResponse plan = service.subscribe(TENANT, new SubscribeFoodProfileRequest(null, vegOn(DayOfWeek.TUESDAY)));

        assertThat(plan.fromTomorrow().hybrid()).isTrue();
        assertThat(plan.fromTomorrow().profileId()).isNull();
        assertThat(plan.fromTomorrow().days()).hasSize(7);
        assertThat(plan.fromTomorrow().days().stream()
                .filter(day -> day.day() == DayOfWeek.TUESDAY).findFirst().orElseThrow().profileName())
                .isEqualTo("Veg");
        assertThat(plan.fromTomorrow().days().stream()
                .filter(day -> day.day() == DayOfWeek.MONDAY).findFirst().orElseThrow().profileName())
                .isEqualTo("Non-veg");
    }

    @Test
    void switchingEndsTodaysPlanTonightAndStartsTheNewOneTomorrow() {
        activeTenancy();
        FoodSubscription current = runningSince(veg, LocalDate.of(2026, 9, 1));

        FoodPlanResponse plan = service.subscribe(TENANT, new SubscribeFoodProfileRequest(nonVeg.getId(), null));

        assertThat(current.getEffectiveUntil()).isEqualTo(TOMORROW);
        assertThat(plan.today().profileName()).isEqualTo("Veg");
        assertThat(plan.fromTomorrow().profileName()).isEqualTo("Non-veg");
        assertThat(plan.endsTonight()).isFalse();
        // Today's plan is closed in the database before tomorrow's is added,
        // or two open plans would meet the one-open-plan index.
        InOrder order = inOrder(subscriptionRepository);
        order.verify(subscriptionRepository).flush();
        order.verify(subscriptionRepository).save(any(FoodSubscription.class));
    }

    @Test
    void aSecondChangeTheSameDayReplacesTomorrows() {
        activeTenancy();
        FoodSubscription current = runningSince(veg, LocalDate.of(2026, 9, 1));
        current.endOn(TOMORROW, "Changed food plan");
        FoodSubscription tomorrows = store(FoodSubscription.start(
                PROPERTY, TENANCY, TENANT, FoodSubscription.everyDay(nonVeg.getId()), TOMORROW));

        FoodPlanResponse plan = service.subscribe(TENANT, new SubscribeFoodProfileRequest(jain.getId(), null));

        assertThat(store).containsExactly(current, tomorrows);
        assertThat(tomorrows.profileOn(TOMORROW)).isEqualTo(jain.getId());
        assertThat(plan.fromTomorrow().profileName()).isEqualTo("Jain");
    }

    @Test
    void choosingTodaysPlanAgainCancelsTheSwitch() {
        activeTenancy();
        FoodSubscription current = runningSince(veg, LocalDate.of(2026, 9, 1));
        current.endOn(TOMORROW, "Changed food plan");
        store(FoodSubscription.start(PROPERTY, TENANCY, TENANT, FoodSubscription.everyDay(nonVeg.getId()), TOMORROW));

        FoodPlanResponse plan = service.subscribe(TENANT, new SubscribeFoodProfileRequest(veg.getId(), null));

        assertThat(store).containsExactly(current);
        assertThat(current.getEffectiveUntil()).isNull();
        assertThat(plan.fromTomorrow()).isNull();
        assertThat(plan.endsTonight()).isFalse();
    }

    @Test
    void stoppingShowsAtOnceButTheOwnersCountDropsAfterMidnight() {
        FoodSubscription current = runningSince(veg, LocalDate.of(2026, 9, 1));
        activeTenancy();

        FoodPlanResponse plan = service.unsubscribe(TENANT);

        assertThat(plan.endsTonight()).isTrue();
        assertThat(plan.today().profileName()).isEqualTo("Veg");
        assertThat(current.getEffectiveUntil()).isEqualTo(TOMORROW);
        assertThat(current.covers(TODAY)).isTrue();
        assertThat(current.covers(TOMORROW)).isFalse();
    }

    @Test
    void stoppingAlsoDropsAChangeSetForTomorrow() {
        activeTenancy();
        FoodSubscription current = runningSince(veg, LocalDate.of(2026, 9, 1));
        current.endOn(TOMORROW, "Changed food plan");
        store(FoodSubscription.start(PROPERTY, TENANCY, TENANT, FoodSubscription.everyDay(nonVeg.getId()), TOMORROW));

        FoodPlanResponse plan = service.unsubscribe(TENANT);

        assertThat(store).containsExactly(current);
        assertThat(plan.endsTonight()).isTrue();
    }

    @Test
    void aPlanChosenAfterStoppingStartsTomorrow() {
        activeTenancy();
        FoodSubscription current = runningSince(veg, LocalDate.of(2026, 9, 1));
        current.endOn(TOMORROW, "Tenant stopped the plan");

        FoodPlanResponse plan = service.subscribe(TENANT, new SubscribeFoodProfileRequest(nonVeg.getId(), null));

        assertThat(current.getEffectiveUntil()).isEqualTo(TOMORROW);
        assertThat(plan.fromTomorrow().profileName()).isEqualTo("Non-veg");
        assertThat(plan.fromTomorrow().effectiveFrom()).isEqualTo(TOMORROW);
    }

    @Test
    void theSamePlanChosenAfterStoppingRunsOnWithoutAGap() {
        activeTenancy();
        FoodSubscription current = runningSince(veg, LocalDate.of(2026, 9, 1));
        current.endOn(TOMORROW, "Tenant stopped the plan");

        FoodPlanResponse plan = service.subscribe(TENANT, new SubscribeFoodProfileRequest(veg.getId(), null));

        assertThat(current.getEffectiveUntil()).isNull();
        assertThat(plan.endsTonight()).isFalse();
        assertThat(store).containsExactly(current);
    }

    @Test
    void stoppingAPlanThatHasNotStartedRemovesIt() {
        activeTenancy();
        store(FoodSubscription.start(PROPERTY, TENANCY, TENANT, FoodSubscription.everyDay(veg.getId()), TOMORROW));

        FoodPlanResponse plan = service.unsubscribe(TENANT);

        assertThat(store).isEmpty();
        assertThat(plan.today()).isNull();
        assertThat(plan.fromTomorrow()).isNull();
    }

    @Test
    void aTenancyEndingEndsThePlanTodayAndDropsTomorrows() {
        FoodSubscription current = runningSince(veg, LocalDate.of(2026, 9, 1));
        current.endOn(TOMORROW, "Changed food plan");
        store(FoodSubscription.start(PROPERTY, TENANCY, TENANT, FoodSubscription.everyDay(nonVeg.getId()), TOMORROW));

        service.endForTenancy(TENANCY, "Tenancy ended");

        assertThat(store).containsExactly(current);
        assertThat(current.getEffectiveUntil()).isEqualTo(TODAY);
        assertThat(current.covers(TODAY)).isFalse();
    }

    @Test
    void aWeekMustNameEveryDay() {
        activeTenancy();
        Map<DayOfWeek, UUID> sixDays = vegOn(DayOfWeek.TUESDAY);
        sixDays.remove(DayOfWeek.SUNDAY);

        assertThatThrownBy(() -> service.subscribe(TENANT, new SubscribeFoodProfileRequest(null, sixDays)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Choose a plan for every day of the week");
    }

    @Test
    void aRequestIsOnePlanOrAWeekNeverBoth() {
        activeTenancy();

        assertThatThrownBy(() -> service.subscribe(TENANT,
                new SubscribeFoodProfileRequest(veg.getId(), vegOn(DayOfWeek.TUESDAY))))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Choose one plan, or a plan for each day of the week");
        assertThatThrownBy(() -> service.subscribe(TENANT, new SubscribeFoodProfileRequest(null, null)))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void theOwnerSeesAHybridTenantUnderEachProfileWithItsDays() {
        TenancyResponse tenancy = FoodTestFixtures.tenancy(TENANCY, TENANT, PROPERTY);
        when(tenancyModule.findActiveByPropertyId(PROPERTY)).thenReturn(List.of(tenancy));
        when(tenancyModule.findByIds(any())).thenReturn(Map.of(TENANCY, tenancy));
        when(profileRepository.findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(PROPERTY))
                .thenReturn(List.of(veg, nonVeg, jain));
        Map<DayOfWeek, UUID> week = vegOn(DayOfWeek.TUESDAY);
        week.put(DayOfWeek.THURSDAY, veg.getId());
        store(FoodSubscription.start(PROPERTY, TENANCY, TENANT, week, LocalDate.of(2026, 9, 1)));

        List<FoodSubscriberResponse> rows = service.subscribers(ACTOR, PROPERTY);

        assertThat(rows).hasSize(2);
        FoodSubscriberResponse vegRow = rows.stream().filter(row -> row.profileId().equals(veg.getId())).findFirst().orElseThrow();
        assertThat(vegRow.hybrid()).isTrue();
        assertThat(vegRow.days()).containsExactly(DayOfWeek.TUESDAY, DayOfWeek.THURSDAY);
    }

    @Test
    void accountWithoutActiveTenancyCannotSubscribe() {
        when(tenancyModule.findActiveByUserId(TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.subscribe(
                TENANT, new SubscribeFoodProfileRequest(UUID.randomUUID(), null)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Tenant has no active tenancy");

        verify(moduleSettingService, never()).requireUsable(any());
    }

    @Test
    void aStayPastItsCheckoutDateCannotStartAFoodSubscription() {
        TenancyResponse tenancy = FoodTestFixtures.tenancy(TENANCY, TENANT, PROPERTY);
        when(tenancyModule.findActiveByUserId(TENANT)).thenReturn(Optional.of(pendingExit(tenancy)));

        assertThatThrownBy(() -> service.subscribe(TENANT, new SubscribeFoodProfileRequest(UUID.randomUUID(), null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("past its checkout date");
    }

    /** Non-veg every day but the given one, which is Veg. */
    private Map<DayOfWeek, UUID> vegOn(DayOfWeek vegDay) {
        Map<DayOfWeek, UUID> week = new EnumMap<>(FoodSubscription.everyDay(nonVeg.getId()));
        week.put(vegDay, veg.getId());
        return week;
    }

    private FoodSubscription runningSince(FoodProfile profile, LocalDate from) {
        return store(FoodSubscription.start(PROPERTY, TENANCY, TENANT, FoodSubscription.everyDay(profile.getId()), from));
    }

    private FoodSubscription store(FoodSubscription plan) {
        store.add(plan);
        return plan;
    }

    /** The same stay, past its checkout date and waiting to be ended. */
    private static TenancyResponse pendingExit(TenancyResponse base) {
        return new TenancyResponse(
                base.id(), base.referenceCode(), base.userId(), base.tenantName(), base.tenantPhone(),
                base.tenantPhoneVerified(), base.tenantProfileCompleted(), base.propertyId(), base.roomId(),
                base.createdByUserId(), base.billingType(), base.rentAmountPaise(), base.depositAmountPaise(),
                base.dailyRatePaise(), base.startDate(), base.plannedEndDate(), base.endDate(),
                com.khatiyan.d_modules.tenancy.model.TenancyStatus.PENDING_EXIT,
                base.createdAt(), base.billingStarted(), base.tosAccepted(), base.fixedTerm(),
                base.agreementValidityMonths(), base.agreementEndDate(), base.earlyExitRule(),
                base.idCheckConfirmed(), base.idCheckedAt(), base.guestStay(), base.guestEmail(),
                base.guestAddress(), base.guestAge(), base.guestGender());
    }

    private void activeTenancy() {
        TenancyResponse tenancy = FoodTestFixtures.tenancy(TENANCY, TENANT, PROPERTY);
        when(tenancyModule.findActiveByUserId(TENANT)).thenReturn(Optional.of(tenancy));
    }
}
