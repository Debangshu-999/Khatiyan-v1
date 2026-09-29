package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;

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
import com.khatiyan.d_modules.tenancy.event.FutureBookingBlockedEvent;
import com.khatiyan.d_modules.tenancy.event.FutureBookingOccupancyEvent;
import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyOnboardingResponse;
import com.khatiyan.d_modules.tenancy.model.GuestDetails;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequestStatus;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyExitRequestRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRoomChangeRequestRepository;

@ExtendWith(MockitoExtension.class)
class TenancyServiceTest {

    /** A complete declaration, so creation paths exercise the same shape production does. */
    private static final IdCheckDeclarationInput ID_CHECK =
            new IdCheckDeclarationInput(true, IdDocumentType.PASSPORT, "4417", Gender.MALE, LocalDate.of(1998, 4, 17));

    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID TENANT_ID = UUID.randomUUID();
    private static final UUID PROPERTY_ID = UUID.randomUUID();
    private static final UUID ROOM_ID = UUID.randomUUID();

    @Mock
    private TenancyRepository tenancyRepository;

    @Mock
    private TenancyRoomChangeRequestRepository roomChangeRequestRepository;

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

    @Mock
    private TenancyExitRequestRepository exitRequestRepository;

    private TenancyService tenancyService;

    @BeforeEach
    void setUp() {
        tenancyService = new TenancyService(
                tenancyRepository,
                roomChangeRequestRepository,
                eventPublisher,
                propertyModule,
                tenancyAccessPolicy,
                authModule,
                billingModule,
                referenceCodeGenerator,
                new FutureVacancies(tenancyRepository, roomChangeRequestRepository, exitRequestRepository));
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
    void booksFullRoomOnlyForAnApprovedOutgoingMonthlyMove() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        LocalDate startDate = today.plusDays(3);
        UUID sourceId = UUID.randomUUID();
        TenancyRoomChangeRequest source = mock(TenancyRoomChangeRequest.class);
        when(source.getId()).thenReturn(sourceId);
        when(authModule.provisionTenantUser("+919007433360", "Tenant 3360", ACTOR_ID)).thenReturn(TENANT_ID);
        when(authModule.findById(TENANT_ID)).thenReturn(Optional.of(userSummary(false)));
        when(tenancyRepository.findActiveByUserId(TENANT_ID)).thenReturn(List.of());
        when(roomChangeRequestRepository.findBookableDeparturesForUpdate(PROPERTY_ID, ROOM_ID, today, startDate))
                .thenReturn(List.of(source));
        when(propertyModule.getActiveProperty(PROPERTY_ID)).thenReturn(propertyResponse());
        when(propertyModule.getActiveRoom(PROPERTY_ID, ROOM_ID)).thenReturn(roomResponse(12_000_00));
        when(referenceCodeGenerator.nextCode("TEN")).thenReturn("TEN-2026-000010");
        when(tenancyRepository.save(any(Tenancy.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TenancyOnboardingResponse result = tenancyService.onboardPending(
                ACTOR_ID, "+919007433360", null, PROPERTY_ID, ROOM_ID,
                null, null, startDate, ID_CHECK);

        assertThat(result.tenancy().status()).isEqualTo(TenancyStatus.PENDING_ACCEPTANCE);
        assertThat(result.tenancy().startDate()).isEqualTo(startDate);
        verify(authModule, never()).markActiveTenant(any());
        verifyNoInteractions(billingModule);
        ArgumentCaptor<TenancyStartedEvent> event = ArgumentCaptor.forClass(TenancyStartedEvent.class);
        verify(eventPublisher).publishEvent(event.capture());
        assertThat(event.getValue().futureBooking()).isTrue();
    }

    @Test
    void booksFullRoomIntoAFixedTermEndingSoonWhenNoRoomChangeFreesIt() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        // A one-month term ending in five days: certain to end, inside its 7-day window.
        Tenancy departing = Tenancy.start(UUID.randomUUID(), PROPERTY_ID, ROOM_ID, ACTOR_ID,
                12_000_00, 10_000_00, today.plusDays(5).minusMonths(1));
        departing.stampAgreementTerms(1, null);
        LocalDate startDate = today.plusDays(6);
        when(authModule.provisionTenantUser("+919007433360", "Tenant 3360", ACTOR_ID)).thenReturn(TENANT_ID);
        when(authModule.findById(TENANT_ID)).thenReturn(Optional.of(userSummary(false)));
        when(tenancyRepository.findActiveByUserId(TENANT_ID)).thenReturn(List.of());
        when(tenancyRepository.findLiveInRoomForUpdate(ROOM_ID)).thenReturn(List.of(departing));
        when(propertyModule.getActiveProperty(PROPERTY_ID)).thenReturn(propertyResponse());
        when(propertyModule.getActiveRoom(PROPERTY_ID, ROOM_ID)).thenReturn(roomResponse(12_000_00));
        when(referenceCodeGenerator.nextCode("TEN")).thenReturn("TEN-2026-000011");
        when(tenancyRepository.save(any(Tenancy.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TenancyOnboardingResponse result = tenancyService.onboardPending(
                ACTOR_ID, "+919007433360", null, PROPERTY_ID, ROOM_ID,
                null, null, startDate, ID_CHECK);

        ArgumentCaptor<Tenancy> saved = ArgumentCaptor.forClass(Tenancy.class);
        verify(tenancyRepository).save(saved.capture());
        assertThat(saved.getValue().getFutureVacancyTenancyId()).isEqualTo(departing.getId());
        assertThat(saved.getValue().getFutureVacancySourceId()).isNull();
        assertThat(result.tenancy().status()).isEqualTo(TenancyStatus.PENDING_ACCEPTANCE);
        verifyNoInteractions(billingModule);
    }

    @Test
    void refusesAStartBeforeTheDepartingStayChecksOut() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        Tenancy departing = Tenancy.start(UUID.randomUUID(), PROPERTY_ID, ROOM_ID, ACTOR_ID,
                12_000_00, 10_000_00, today.plusDays(5).minusMonths(1));
        departing.stampAgreementTerms(1, null);
        when(authModule.provisionTenantUser("+919007433360", "Tenant 3360", ACTOR_ID)).thenReturn(TENANT_ID);
        when(authModule.findById(TENANT_ID)).thenReturn(Optional.of(userSummary(false)));
        when(tenancyRepository.findActiveByUserId(TENANT_ID)).thenReturn(List.of());
        when(tenancyRepository.findLiveInRoomForUpdate(ROOM_ID)).thenReturn(List.of(departing));

        assertThatThrownBy(() -> tenancyService.onboardPending(
                ACTOR_ID, "+919007433360", null, PROPERTY_ID, ROOM_ID,
                null, null, today.plusDays(2), ID_CHECK))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("on the selected start date");
    }

    @Test
    void endingTheDepartingStayHoldsTheBedAndStartsADueBooking() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        Tenancy departing = Tenancy.start(UUID.randomUUID(), PROPERTY_ID, ROOM_ID, ACTOR_ID,
                12_000_00, 10_000_00, today.minusMonths(1));
        departing.stampAgreementTerms(1, null);
        Tenancy booking = signedBooking(today, pending -> pending.claimDepartingStay(departing.getId()));
        when(tenancyRepository.findById(departing.getId())).thenReturn(Optional.of(departing));
        when(tenancyRepository.findFirstByFutureVacancyTenancyIdAndActiveTrue(departing.getId()))
                .thenReturn(Optional.of(booking));
        when(tenancyRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));

        tenancyService.end(ACTOR_ID, departing.getId(), today, "MANUAL_END");

        ArgumentCaptor<Object> events = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher, atLeastOnce()).publishEvent(events.capture());
        assertThat(events.getAllValues()).filteredOn(TenancyEndedEvent.class::isInstance)
                .singleElement()
                .satisfies(event -> assertThat(((TenancyEndedEvent) event).holdBedForFutureBooking()).isTrue());
        assertThat(events.getAllValues()).anyMatch(FutureBookingOccupancyEvent.class::isInstance);
        assertThat(booking.getStatus()).isEqualTo(TenancyStatus.ACTIVE);
        verify(billingModule).initializeStartedTenancy(ACTOR_ID, TenancyResponse.from(booking));
    }

    @Test
    void aBookingWhoseBedFreedLateStartsTheDayItFreesWithItsFullTerm() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        Tenancy departing = Tenancy.start(UUID.randomUUID(), PROPERTY_ID, ROOM_ID, ACTOR_ID,
                12_000_00, 10_000_00, today.minusMonths(2));
        departing.end(today, "MANUAL_END");
        Tenancy booking = signedBooking(today.minusDays(3), pending -> pending.claimDepartingStay(departing.getId()));
        booking.stampAgreementTerms(6, null);
        when(tenancyRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));
        when(tenancyRepository.findById(departing.getId())).thenReturn(Optional.of(departing));

        assertThat(tenancyService.activateScheduledBooking(booking.getId(), today)).isTrue();

        // Never billed for the three nights the bed was not free, and the full term is kept.
        assertThat(booking.getStartDate()).isEqualTo(today);
        assertThat(booking.getPlannedEndDate()).isEqualTo(today.plusMonths(6));
        assertThat(booking.getAgreementEndDate()).isEqualTo(today.plusMonths(6));
    }

    @Test
    void aLateBookingIsFlaggedOnceAndKeepsWaiting() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        Tenancy departing = Tenancy.start(UUID.randomUUID(), PROPERTY_ID, ROOM_ID, ACTOR_ID,
                12_000_00, 10_000_00, today.minusMonths(1).minusDays(2));
        departing.stampAgreementTerms(1, null);
        departing.markPendingExit();
        Tenancy booking = signedBooking(today.minusDays(1), pending -> pending.claimDepartingStay(departing.getId()));
        when(tenancyRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));
        when(tenancyRepository.findById(departing.getId())).thenReturn(Optional.of(departing));

        assertThat(tenancyService.activateScheduledBooking(booking.getId(), today)).isFalse();
        assertThat(tenancyService.activateScheduledBooking(booking.getId(), today)).isFalse();

        ArgumentCaptor<FutureBookingBlockedEvent> blocked = ArgumentCaptor.forClass(FutureBookingBlockedEvent.class);
        verify(eventPublisher).publishEvent(blocked.capture());
        assertThat(blocked.getValue().reason()).isEqualTo(FutureBookingBlockedEvent.Reason.PENDING_EXIT);
        assertThat(blocked.getValue().blockingTenancyId()).isEqualTo(departing.getId());
        assertThat(booking.getStatus()).isEqualTo(TenancyStatus.SCHEDULED);
        assertThat(booking.getStartBlockedAt()).isNotNull();
    }

    @Test
    void aBookingDueTodayIsNotFlaggedWhileItsStayIsStillDueToday() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        Tenancy departing = Tenancy.start(UUID.randomUUID(), PROPERTY_ID, ROOM_ID, ACTOR_ID,
                12_000_00, 10_000_00, today.minusMonths(1));
        departing.stampAgreementTerms(1, null);
        Tenancy booking = signedBooking(today, pending -> pending.claimDepartingStay(departing.getId()));
        when(tenancyRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));
        when(tenancyRepository.findById(departing.getId())).thenReturn(Optional.of(departing));

        // The owner has all of checkout day to end the stay before anyone is nagged.
        assertThat(tenancyService.activateScheduledBooking(booking.getId(), today)).isFalse();

        verifyNoInteractions(eventPublisher);
        assertThat(booking.getStartBlockedAt()).isNull();
    }

    @Test
    void aMoverWhoLeavesInsteadOfMovingStillFreesTheBookedBed() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        Tenancy mover = Tenancy.start(UUID.randomUUID(), PROPERTY_ID, ROOM_ID, ACTOR_ID,
                12_000_00, 10_000_00, today.minusMonths(3));
        UUID moveId = UUID.randomUUID();
        TenancyRoomChangeRequest move = mock(TenancyRoomChangeRequest.class);
        when(move.getId()).thenReturn(moveId);
        when(move.getCurrentRoomId()).thenReturn(ROOM_ID);
        when(move.getTenancyId()).thenReturn(mover.getId());
        when(move.getStatus()).thenReturn(TenancyRoomChangeRequestStatus.APPROVED);
        Tenancy booking = signedBooking(today, pending -> pending.claimFutureVacancy(moveId));
        when(tenancyRepository.findById(mover.getId())).thenReturn(Optional.of(mover));
        when(roomChangeRequestRepository.findOpenByTenancyId(eq(mover.getId()), any())).thenReturn(Optional.of(move));
        when(roomChangeRequestRepository.findById(moveId)).thenReturn(Optional.of(move));
        when(tenancyRepository.findFirstByFutureVacancySourceIdAndActiveTrue(moveId)).thenReturn(Optional.of(booking));
        when(tenancyRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));

        // Ending a booked mover used to be refused, which left one past their checkout impossible to end.
        tenancyService.end(ACTOR_ID, mover.getId(), today, "MANUAL_END");

        assertThat(mover.getStatus()).isEqualTo(TenancyStatus.EXITED);
        assertThat(booking.getStatus()).isEqualTo(TenancyStatus.ACTIVE);
    }

    @Test
    void aStayPastItsCheckoutCanStillBeEnded() {
        // Pending exit exists to be ended. The service used to load it through
        // the active-only getter, so once the nightly sweep flipped a stay,
        // nobody could end it.
        Tenancy pending = Tenancy.start(TENANT_ID, PROPERTY_ID, ROOM_ID, ACTOR_ID,
                12_000_00, 10_000_00, LocalDate.of(2026, 8, 20));
        pending.markPendingExit();
        when(tenancyRepository.findById(pending.getId())).thenReturn(Optional.of(pending));
        when(roomChangeRequestRepository.findOpenByTenancyId(eq(pending.getId()), any()))
                .thenReturn(Optional.empty());

        tenancyService.end(ACTOR_ID, pending.getId(), LocalDate.of(2026, 9, 20), "MANUAL_END");

        assertThat(pending.getStatus()).isEqualTo(TenancyStatus.EXITED);
        verify(eventPublisher).publishEvent(any(TenancyEndedEvent.class));
    }

    @Test
    void signingAFutureBookingDoesNotStartTheStayEarly() {
        Tenancy booking = Tenancy.start(TENANT_ID, PROPERTY_ID, ROOM_ID, ACTOR_ID,
                12_000_00, 10_000_00, LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(3));
        booking.markPendingAcceptance();
        booking.claimFutureVacancy(UUID.randomUUID());
        when(tenancyRepository.findById(booking.getId())).thenReturn(Optional.of(booking));

        tenancyService.acceptTermsAndActivate(booking.getId(), TENANT_ID);

        assertThat(booking.getStatus()).isEqualTo(TenancyStatus.SCHEDULED);
        verify(authModule, never()).markActiveTenant(any());
        verifyNoInteractions(billingModule, eventPublisher);
    }

    @Test
    void activatesSignedBookingOnlyAfterItsRoomChangeExecuted() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        UUID sourceId = UUID.randomUUID();
        Tenancy booking = Tenancy.start(TENANT_ID, PROPERTY_ID, ROOM_ID, ACTOR_ID,
                12_000_00, 10_000_00, today);
        booking.markPendingAcceptance();
        booking.claimFutureVacancy(sourceId);
        booking.acceptTos();
        TenancyRoomChangeRequest source = mock(TenancyRoomChangeRequest.class);
        when(source.getStatus()).thenReturn(TenancyRoomChangeRequestStatus.EXECUTED);
        when(tenancyRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));
        when(roomChangeRequestRepository.findById(sourceId)).thenReturn(Optional.of(source));

        assertThat(tenancyService.activateScheduledBooking(booking.getId(), today)).isTrue();

        assertThat(booking.getStatus()).isEqualTo(TenancyStatus.ACTIVE);
        verify(authModule).markActiveTenant(TENANT_ID);
        verify(billingModule).initializeStartedTenancy(ACTOR_ID, TenancyResponse.from(booking));
        verify(eventPublisher).publishEvent(any(FutureBookingOccupancyEvent.class));
    }

    @Test
    void dailyGuestCannotClaimAFutureRoomChangeVacancy() {
        when(authModule.normalizePhone("9007433360")).thenReturn("+919007433360");
        assertThatThrownBy(() -> tenancyService.onboardDailyGuest(
                ACTOR_ID, PROPERTY_ID, ROOM_ID,
                LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(3),
                LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(5),
                guestDetails(), ID_CHECK))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Room has no available vacancy");
        verifyNoInteractions(roomChangeRequestRepository);
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

    /**
     * A guest stay has no account, so there is no active-tenant flag to clear.
     *
     * <p>This called {@code clearActiveTenant(null)} unconditionally, and Spring
     * Data throws on {@code findById(null)} rather than returning empty — so
     * ending any daily guest stay failed with "The given id must not be null"
     * and the stay could never be closed.
     */
    @Test
    void endsAGuestStayWithoutClearingAnAccountFlag() {
        Tenancy tenancy = Tenancy.startDailyGuest(
                "TEN-2026-000009",
                PROPERTY_ID,
                ROOM_ID,
                ACTOR_ID,
                1_200_00,
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 3),
                guestDetails().withPhone("+919007433360"));
        when(tenancyRepository.findById(tenancy.getId())).thenReturn(Optional.of(tenancy));

        tenancyService.end(ACTOR_ID, tenancy.getId(), LocalDate.of(2026, 6, 3), "Checkout");

        assertThat(tenancy.getStatus()).isEqualTo(TenancyStatus.EXITED);
        verify(authModule, never()).clearActiveTenant(any());
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

    @Test
    void batchedTenancyLookupIncludesAccountNameAndPhone() {
        Tenancy tenancy = Tenancy.start(
                TENANT_ID,
                PROPERTY_ID,
                ROOM_ID,
                ACTOR_ID,
                12_000_00,
                10_000_00,
                LocalDate.of(2026, 6, 1));
        when(tenancyRepository.findAllById(java.util.List.of(tenancy.getId())))
                .thenReturn(java.util.List.of(tenancy));
        when(authModule.findByIds(java.util.List.of(TENANT_ID)))
                .thenReturn(java.util.Map.of(TENANT_ID, userSummary(false)));

        TenancyResponse response = tenancyService
                .findByIds(java.util.List.of(tenancy.getId()))
                .get(tenancy.getId());

        assertThat(response.tenantName()).isEqualTo("Test Tenant");
        assertThat(response.tenantPhone()).isEqualTo("+919007433360");
    }

    /** A monthly booking claiming a departure, already signed by the tenant: SCHEDULED. */
    private static Tenancy signedBooking(LocalDate startDate, Consumer<Tenancy> claim) {
        Tenancy booking = Tenancy.start(TENANT_ID, PROPERTY_ID, ROOM_ID, ACTOR_ID, 12_000_00, 10_000_00, startDate);
        booking.markPendingAcceptance();
        claim.accept(booking);
        booking.acceptTos();
        return booking;
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
        when(authModule.normalizePhone("9007433360")).thenReturn("+919007433360");

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
        // Normalized on the way in, exactly as an account phone is. Stored raw,
        // a guest's number came back as ten bare digits while every account
        // tenant's carried +91, and the screens printing it showed the split.
        assertThat(response.tenancy().tenantPhone()).isEqualTo("+919007433360");
        verify(authModule).normalizePhone("9007433360");
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

    /** Deliberately BARE: the guest form collects ten digits under a +91 flag. */
    private static GuestDetails guestDetails() {
        return new GuestDetails(
                "Ravi Menon",
                "9007433360",
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
                null,
                true,
                true, 0L);
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
                null, 0L);
    }
}
