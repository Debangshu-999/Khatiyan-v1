package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.d_modules.tenancy.model.IdDocumentType;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckDeclarationInput;
import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.model.RoomType;
import com.khatiyan.d_modules.property.model.SharingType;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.event.TenancyEndedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyStartedEvent;
import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyOnboardingResponse;
import com.khatiyan.d_modules.tenancy.model.GuestDetails;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

@ExtendWith(MockitoExtension.class)
class TenancyServiceTest {

    /** A complete declaration, so creation paths exercise the same shape production does. */
    private static final IdCheckDeclarationInput ID_CHECK =
            new IdCheckDeclarationInput(true, IdDocumentType.PASSPORT, "4417");

    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID TENANT_ID = UUID.randomUUID();
    private static final UUID PROPERTY_ID = UUID.randomUUID();
    private static final UUID ROOM_ID = UUID.randomUUID();

    @Mock
    private TenancyRepository tenancyRepository;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private PropertyModule propertyModule;

    @Mock
    private TenancyAccessPolicy tenancyAccessPolicy;

    @Mock
    private AuthModule authModule;

    @Mock
    private BillingModule billingModule;

    @Mock
    private ReferenceCodeGenerator referenceCodeGenerator;

    private TenancyService tenancyService;

    @BeforeEach
    void setUp() {
        tenancyService = new TenancyService(
                tenancyRepository,
                eventPublisher,
                propertyModule,
                tenancyAccessPolicy,
                authModule,
                billingModule,
                referenceCodeGenerator);
    }

    @Test
    void createsMonthlyTenancyAndInitializesCrossModuleState() {
        when(authModule.provisionTenantUser("+919007433360", "Tenant 3360", ACTOR_ID)).thenReturn(TENANT_ID);
        when(referenceCodeGenerator.nextCode("TEN")).thenReturn("TEN-2026-000001");
        when(authModule.findById(TENANT_ID)).thenReturn(Optional.of(userSummary(false)));
        when(tenancyRepository.findActiveByUserId(TENANT_ID)).thenReturn(java.util.List.of());
        when(propertyModule.hasAvailableVacancy(PROPERTY_ID, ROOM_ID)).thenReturn(true);
        when(propertyModule.getActiveProperty(PROPERTY_ID)).thenReturn(propertyResponse());
        when(propertyModule.getActiveRoom(PROPERTY_ID, ROOM_ID)).thenReturn(roomResponse(12_000_00));
        when(tenancyRepository.save(any(Tenancy.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Tenancy tenancy = tenancyService.create(
                ACTOR_ID,
                "+919007433360",
                null,
                PROPERTY_ID,
                ROOM_ID,
                TenancyBillingType.MONTHLY,
                null,
                null,
                LocalDate.of(2026, 6, 1),
                null,
                ID_CHECK);

        assertThat(tenancy.getUserId()).isEqualTo(TENANT_ID);
        assertThat(tenancy.getReferenceCode()).isEqualTo("TEN-2026-000001");
        assertThat(tenancy.getBillingType()).isEqualTo(TenancyBillingType.MONTHLY);
        assertThat(tenancy.getRentAmountPaise()).isEqualTo(12_000_00);
        assertThat(tenancy.getDepositAmountPaise()).isEqualTo(10_000_00);

        // Onboarding is governed by Create tenancy, which is manage-only —
        // there is nothing to "view" about creating a stay.
        verify(tenancyAccessPolicy).ensureCanCreateTenancy(ACTOR_ID, PROPERTY_ID);
        verify(authModule).markActiveTenant(TENANT_ID);
        verify(billingModule).initializeStartedTenancy(ACTOR_ID, TenancyResponse.from(tenancy));

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue()).isInstanceOf(TenancyStartedEvent.class);
    }

    @Test
    void appliesRentAndDepositOverridesForMonthlyTenancy() {
        when(authModule.provisionTenantUser("+919007433360", "Tenant 3360", ACTOR_ID)).thenReturn(TENANT_ID);
        when(referenceCodeGenerator.nextCode("TEN")).thenReturn("TEN-2026-000002");
        when(authModule.findById(TENANT_ID)).thenReturn(Optional.of(userSummary(false)));
        when(tenancyRepository.findActiveByUserId(TENANT_ID)).thenReturn(java.util.List.of());
        when(propertyModule.hasAvailableVacancy(PROPERTY_ID, ROOM_ID)).thenReturn(true);
        when(propertyModule.getActiveProperty(PROPERTY_ID)).thenReturn(propertyResponse());
        when(propertyModule.getActiveRoom(PROPERTY_ID, ROOM_ID)).thenReturn(roomResponse(12_000_00));
        when(tenancyRepository.save(any(Tenancy.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Tenancy tenancy = tenancyService.create(
                ACTOR_ID,
                "+919007433360",
                null,
                PROPERTY_ID,
                ROOM_ID,
                TenancyBillingType.MONTHLY,
                15_000_00L,
                5_000_00L,
                LocalDate.of(2026, 6, 1),
                null,
                ID_CHECK);

        assertThat(tenancy.getRentAmountPaise()).isEqualTo(15_000_00);
        assertThat(tenancy.getDepositAmountPaise()).isEqualTo(5_000_00);
    }

    @Test
    void rejectsTenancyCreationWhenUserAlreadyActiveTenant() {
        when(authModule.provisionTenantUser("+919007433360", "Tenant 3360", ACTOR_ID)).thenReturn(TENANT_ID);
        when(authModule.findById(TENANT_ID)).thenReturn(Optional.of(userSummary(true)));

        assertThatThrownBy(() -> tenancyService.create(
                ACTOR_ID,
                "+919007433360",
                null,
                PROPERTY_ID,
                ROOM_ID,
                TenancyBillingType.MONTHLY,
                null,
                null,
                LocalDate.of(2026, 6, 1),
                null,
                ID_CHECK))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("User already has an active tenancy");

        verify(tenancyRepository, never()).save(any(Tenancy.class));
    }

    @Test
    void endingTenancyRequiresPaidCycleThenClearsActiveTenantAndPublishesEvent() {
        Tenancy tenancy = Tenancy.start(
                TENANT_ID,
                PROPERTY_ID,
                ROOM_ID,
                ACTOR_ID,
                12_000_00,
                10_000_00,
                LocalDate.of(2026, 6, 1));
        when(tenancyRepository.findById(tenancy.getId())).thenReturn(Optional.of(tenancy));

        tenancyService.end(ACTOR_ID, tenancy.getId(), LocalDate.of(2026, 6, 30), "Checkout");

        assertThat(tenancy.getStatus()).isEqualTo(TenancyStatus.EXITED);
        // Ending a stay is Property stays at MANAGE, per the owner-set rule.
        verify(tenancyAccessPolicy).ensureCanManageStays(ACTOR_ID, PROPERTY_ID);
        verify(billingModule).ensureLatestCyclePaidForExit(ACTOR_ID, tenancy.getId());
        verify(authModule).clearActiveTenant(TENANT_ID);

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue()).isInstanceOf(TenancyEndedEvent.class);
    }

    @Test
    void pagesManagedActiveAndPastTenanciesSeparately() {
        Tenancy activeTenancy = Tenancy.start(
                TENANT_ID,
                PROPERTY_ID,
                ROOM_ID,
                ACTOR_ID,
                12_000_00,
                10_000_00,
                LocalDate.of(2026, 6, 1));
        Tenancy pastTenancy = Tenancy.start(
                TENANT_ID,
                PROPERTY_ID,
                ROOM_ID,
                ACTOR_ID,
                12_000_00,
                10_000_00,
                LocalDate.of(2026, 5, 1));
        pastTenancy.end(LocalDate.of(2026, 5, 31), "Completed");

        when(authModule.findByIds(any())).thenReturn(java.util.Map.of(TENANT_ID, userSummary(false)));
        when(tenancyRepository.findByPropertyIdAndActiveTrue(PROPERTY_ID))
                .thenReturn(java.util.List.of(activeTenancy));
        when(tenancyRepository.findByPropertyIdAndActiveFalse(PROPERTY_ID))
                .thenReturn(java.util.List.of(pastTenancy));

        var activePage = tenancyService.listActiveForManagedProperty(ACTOR_ID, PROPERTY_ID, null, 0, 10);
        var pastPage = tenancyService.listPastForManagedProperty(ACTOR_ID, PROPERTY_ID, null, 0, 10);

        assertThat(activePage.items()).extracting(TenancyResponse::id).containsExactly(activeTenancy.getId());
        assertThat(activePage.totalElements()).isEqualTo(1);
        assertThat(pastPage.items()).extracting(TenancyResponse::id).containsExactly(pastTenancy.getId());
        assertThat(pastPage.totalElements()).isEqualTo(1);
        // Both pages are reads of the stays list.
        verify(tenancyAccessPolicy, org.mockito.Mockito.times(2)).ensureCanViewStays(ACTOR_ID, PROPERTY_ID);
    }
    private static UserSummaryResponse userSummary(boolean activeTenant) {
        return new UserSummaryResponse(
                TENANT_ID,
                "+919007433360",
                "tenant@example.com",
                "Test Tenant",
                null,
                UserRole.USER,
                activeTenant,
                true,
                true,
                true,
                true);
    }

    /**
     * The whole point of the daily rework: a guest staying two nights gets no
     * account, so nothing here provisions a user or marks anyone a tenant.
     */
    @Test
    void aDailyStayIsOnboardedWithoutCreatingAnAccount() {
        when(referenceCodeGenerator.nextCode("TEN")).thenReturn("TEN-2026-000003");
        when(propertyModule.hasAvailableVacancy(PROPERTY_ID, ROOM_ID)).thenReturn(true);
        when(propertyModule.getActiveProperty(PROPERTY_ID)).thenReturn(propertyResponse());
        when(propertyModule.getActiveRoom(PROPERTY_ID, ROOM_ID)).thenReturn(roomResponse(12_000_00));
        when(tenancyRepository.save(any(Tenancy.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TenancyOnboardingResponse response = tenancyService.onboardDailyGuest(
                ACTOR_ID,
                PROPERTY_ID,
                ROOM_ID,
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 3),
                guestDetails(),
                ID_CHECK);

        assertThat(response.tenantAccountCreated()).isFalse();
        assertThat(response.tenancy().guestStay()).isTrue();
        assertThat(response.tenancy().userId()).isNull();
        // The guest's own name and number fill the tenant fields, so every
        // existing reader that shows "who is this stay for" still works.
        assertThat(response.tenancy().tenantName()).isEqualTo("Ravi Menon");
        assertThat(response.tenancy().tenantPhone()).isEqualTo("+919007433360");
        assertThat(response.tenancy().billingType()).isEqualTo(TenancyBillingType.DAILY);

        verify(authModule, never()).provisionTenantUser(any(), any(), any());
        verify(authModule, never()).markActiveTenant(any());
        verify(billingModule).initializeStartedTenancy(ACTOR_ID, response.tenancy());

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue()).isInstanceOf(TenancyStartedEvent.class);
        // Null rather than a placeholder: the listener that would notify a
        // tenant has to be able to tell there is nobody to notify.
        assertThat(((TenancyStartedEvent) eventCaptor.getValue()).userId()).isNull();
    }

    /**
     * Monthly stays are agreement-backed and app-resident, so they keep their
     * account. Nothing may quietly route one through the guest register.
     */
    @Test
    void aMonthlyTenancyCannotBeCreatedThroughTheAccountlessPath() {
        assertThatThrownBy(() -> tenancyService.create(
                ACTOR_ID,
                "+919007433360",
                null,
                PROPERTY_ID,
                ROOM_ID,
                TenancyBillingType.DAILY,
                null,
                null,
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 3),
                ID_CHECK))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Daily stays are onboarded as guest records");

        verify(tenancyRepository, never()).save(any(Tenancy.class));
    }

    /**
     * Mapping a guest stay must not reach for an account.
     *
     * <p>Spring Data throws on a null id rather than returning an empty
     * Optional, so an `.orElse(null)` after the lookup never runs. One daily
     * guest in a property therefore took down every list that mapped its
     * tenancies — the tenant-bills screen among them.
     */
    @Test
    void mappingAGuestStayNeverLooksUpAnAccount() {
        Tenancy stay = Tenancy.startDailyGuest(
                "TEN-2026-000009",
                PROPERTY_ID,
                ROOM_ID,
                ACTOR_ID,
                1_000_00,
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 3),
                guestDetails());

        TenancyResponse response = tenancyService.toResponse(stay);

        assertThat(response.guestStay()).isTrue();
        assertThat(response.userId()).isNull();
        assertThat(response.tenantName()).isEqualTo("Ravi Menon");
        verifyNoInteractions(authModule);
    }

    private static GuestDetails guestDetails() {
        return new GuestDetails(
                "Ravi Menon",
                "+919007433360",
                null,
                "12 Nandidurga Road, Bengaluru 560046",
                29,
                Gender.MALE);
    }

    private static PropertyResponse propertyResponse() {
        return new PropertyResponse(
                PROPERTY_ID,
                "PROP-2026-000001",
                ACTOR_ID,
                "Sky PG",
                "Address",
                "Madhapur",
                "Hyderabad",
                "Telangana",
                "500046",
                null,
                null,
                PropertyType.PG,
                PgFor.ANYONE,
                PreferredTenantType.ANYONE,
                false,
                Set.of(),
                false,
                BathroomType.COMMON,
                Set.of(SharingType.DOUBLE),
                Set.of(),
                Set.of(),
                2_000_00L,
                1_500_00L,
                100_00L,
                BillingCollectionTiming.CYCLE_START,
                3,
                10_000_00,
                NoticePeriod.ONE_MONTH,
                0,
                null,
                true,
                true);
    }

    private static RoomResponse roomResponse(long baseRentPaise) {
        return new RoomResponse(
                ROOM_ID,
                PROPERTY_ID,
                "101",
                "1",
                2,
                0,
                0,
                2,
                RoomType.DOUBLE,
                RoomConditioning.NON_AC,
                baseRentPaise,
                null,
                Set.of(),
                Set.of(),
                RoomStatus.VACANT,
                true,
                null,
                null,
                null,
                null,
                null,
                null);
    }
}
