package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.model.BillingCycleCategory;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.api.dto.ApproveTenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequestStatus;
import com.khatiyan.d_modules.tenancy.repository.TenancyExitRequestRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRoomChangeRequestRepository;

/**
 * Service-level coverage for the request policies that span two aggregates.
 *
 * <p>The domain tests cover each request's own state machine. These tests pin
 * the orchestration rules that are easy to lose in a refactor: exit and room
 * change are mutually exclusive while either is active, request creation is
 * serialised by locking the active tenancy, and a scheduled room move rechecks
 * the live tenancy before consuming its reservation.
 */
@ExtendWith(MockitoExtension.class)
class RequestPolicyServiceTest {

    private static final ZoneId REQUEST_ZONE = ZoneId.of("Asia/Kolkata");
    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID TENANT_ID = UUID.randomUUID();
    private static final UUID PROPERTY_ID = UUID.randomUUID();
    private static final UUID CURRENT_ROOM_ID = UUID.randomUUID();
    private static final UUID TARGET_ROOM_ID = UUID.randomUUID();
    private static final UUID BILLING_CYCLE_ID = UUID.randomUUID();

    @Mock private AuthModule authModule;
    @Mock private ReferenceCodeGenerator referenceCodeGenerator;
    @Mock private TenancyExitRequestRepository exitRequestRepository;
    @Mock private TenancyRoomChangeRequestRepository roomChangeRequestRepository;
    @Mock private TenancyRepository tenancyRepository;
    @Mock private PropertyModule propertyModule;
    @Mock private TenancyAccessPolicy tenancyAccessPolicy;
    @Mock private BillingModule billingModule;
    @Mock private TenancyService tenancyService;
    @Mock private ApplicationEventPublisher eventPublisher;

    private TenancyExitRequestService exitRequestService;
    private TenancyRoomChangeRequestService roomChangeRequestService;

    @BeforeEach
    void setUp() {
        exitRequestService = new TenancyExitRequestService(
                authModule,
                referenceCodeGenerator,
                exitRequestRepository,
                roomChangeRequestRepository,
                tenancyRepository,
                propertyModule,
                tenancyAccessPolicy,
                billingModule,
                tenancyService,
                eventPublisher);
        roomChangeRequestService = new TenancyRoomChangeRequestService(
                authModule,
                referenceCodeGenerator,
                roomChangeRequestRepository,
                exitRequestRepository,
                tenancyRepository,
                propertyModule,
                tenancyAccessPolicy,
                billingModule,
                tenancyService,
                eventPublisher);
    }

    @Test
    @DisplayName("an active room change blocks a new exit before billing is consulted")
    void activeRoomChangeBlocksExitCreation() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = pendingRoomChange(tenancy);
        when(tenancyRepository.findByUserIdAndActiveTrueForUpdate(TENANT_ID))
                .thenReturn(Optional.of(tenancy));
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(roomChangeRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.of(roomChange));

        assertThatThrownBy(() -> exitRequestService.requestExit(TENANT_ID, null, "Leaving"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("active room change request");

        verify(tenancyRepository).findByUserIdAndActiveTrueForUpdate(TENANT_ID);
        verifyNoInteractions(billingModule);
        verify(exitRequestRepository, never()).save(any(TenancyExitRequest.class));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<TenancyRoomChangeRequestStatus>> statuses =
                ArgumentCaptor.forClass(List.class);
        verify(roomChangeRequestRepository).findOpenByTenancyId(eq(tenancy.getId()), statuses.capture());
        assertThat(statuses.getValue())
                .containsExactlyInAnyOrder(
                        TenancyRoomChangeRequestStatus.REQUESTED,
                        TenancyRoomChangeRequestStatus.APPROVED)
                .doesNotContain(TenancyRoomChangeRequestStatus.REJECTED);
    }

    @Test
    @DisplayName("an active exit blocks a new room change before room or billing lookup")
    void activeExitBlocksRoomChangeCreation() {
        Tenancy tenancy = activeTenancy();
        TenancyExitRequest exit = pendingExit(tenancy);
        when(tenancyRepository.findByUserIdAndActiveTrueForUpdate(TENANT_ID))
                .thenReturn(Optional.of(tenancy));
        when(roomChangeRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.of(exit));

        assertThatThrownBy(() -> roomChangeRequestService.requestRoomChange(
                TENANT_ID, TARGET_ROOM_ID, "More space"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("active exit request");

        verify(tenancyRepository).findByUserIdAndActiveTrueForUpdate(TENANT_ID);
        verifyNoInteractions(billingModule);
        verify(propertyModule, never()).getActiveRoom(any(), any());
        verify(roomChangeRequestRepository, never()).save(any(TenancyRoomChangeRequest.class));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<TenancyExitRequestStatus>> statuses = ArgumentCaptor.forClass(List.class);
        verify(exitRequestRepository).findOpenByTenancyId(eq(tenancy.getId()), statuses.capture());
        assertThat(statuses.getValue())
                .containsExactlyInAnyOrder(
                        TenancyExitRequestStatus.REQUESTED,
                        TenancyExitRequestStatus.APPROVED,
                        TenancyExitRequestStatus.WITHDRAWAL_REQUESTED)
                .doesNotContain(
                        TenancyExitRequestStatus.REJECTED,
                        TenancyExitRequestStatus.EXPIRED,
                        TenancyExitRequestStatus.CANCELLED);
    }

    @Test
    @DisplayName("a room change that appears before exit approval blocks the decision")
    void activeRoomChangeBlocksExitApproval() {
        Tenancy tenancy = activeTenancy();
        TenancyExitRequest exit = pendingExit(tenancy);
        when(exitRequestRepository.findByIdForUpdate(exit.getId())).thenReturn(Optional.of(exit));
        when(roomChangeRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.of(pendingRoomChange(tenancy)));

        assertThatThrownBy(() -> exitRequestService.approve(
                ACTOR_ID, exit.getId(), new ApproveTenancyExitRequest(null, null, null, null, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("active room change request");

        assertThat(exit.getStatus()).isEqualTo(TenancyExitRequestStatus.REQUESTED);
        verify(tenancyService, never()).markOnNotice(any(), any());
    }

    @Test
    @DisplayName("an exit that appears before room-change approval blocks the decision")
    void activeExitBlocksRoomChangeApproval() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = pendingRoomChange(tenancy);
        when(roomChangeRequestRepository.findByIdForUpdate(roomChange.getId()))
                .thenReturn(Optional.of(roomChange));
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.of(pendingExit(tenancy)));

        assertThatThrownBy(() -> roomChangeRequestService.approve(ACTOR_ID, roomChange.getId(), null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("active exit request");

        assertThat(roomChange.getStatus()).isEqualTo(TenancyRoomChangeRequestStatus.REQUESTED);
        verify(propertyModule, never()).reserveRoomSlot(any(), any());
    }

    @Test
    @DisplayName("management approval reversion reopens the decision and releases its bed")
    void revertingRoomChangeApprovalReturnsItToDecisionQueue() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = pendingRoomChange(tenancy);
        roomChange.approve(ACTOR_ID, "Approved");
        when(roomChangeRequestRepository.findByIdForUpdate(roomChange.getId()))
                .thenReturn(Optional.of(roomChange));

        var response = roomChangeRequestService.revertApproval(ACTOR_ID, roomChange.getId());

        assertThat(response.status()).isEqualTo(TenancyRoomChangeRequestStatus.REQUESTED);
        assertThat(response.approvalRevertAllowed()).isFalse();
        verify(propertyModule).releaseRoomSlotReservation(PROPERTY_ID, TARGET_ROOM_ID);
        verify(tenancyAccessPolicy).ensureCanManageRoomChanges(ACTOR_ID, PROPERTY_ID);
    }

    @Test
    @DisplayName("the scheduler reopens an approved move when the tenancy has ended")
    void schedulerRechecksActiveTenancyBeforeExecutingRoomChange() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = approvedDueRoomChange(tenancy);
        tenancy.end(LocalDate.now(REQUEST_ZONE), "Exit completed");
        when(roomChangeRequestRepository.findByIdForUpdate(roomChange.getId()))
                .thenReturn(Optional.of(roomChange));
        when(tenancyRepository.findByIdForUpdate(tenancy.getId())).thenReturn(Optional.of(tenancy));

        var response = roomChangeRequestService.executeDueApprovedRequest(roomChange.getId());

        assertThat(response.status()).isEqualTo(TenancyRoomChangeRequestStatus.REQUESTED);
        assertThat(response.adminNotes()).contains("no longer active");
        verify(propertyModule).releaseRoomSlotReservation(PROPERTY_ID, TARGET_ROOM_ID);
        verify(tenancyService, never()).transferRoom(any(), any(), any(), any());
        verifyNoInteractions(billingModule);
    }

    @Test
    @DisplayName("the scheduler reopens a legacy conflicting move instead of executing it")
    void schedulerRecoversIfAnExitAndApprovedRoomChangeCoexist() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = approvedDueRoomChange(tenancy);
        when(roomChangeRequestRepository.findByIdForUpdate(roomChange.getId()))
                .thenReturn(Optional.of(roomChange));
        when(tenancyRepository.findByIdForUpdate(tenancy.getId())).thenReturn(Optional.of(tenancy));
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.of(pendingExit(tenancy)));

        var response = roomChangeRequestService.executeDueApprovedRequest(roomChange.getId());

        assertThat(response.status()).isEqualTo(TenancyRoomChangeRequestStatus.REQUESTED);
        assertThat(response.adminNotes()).contains("active exit request conflicts");
        verify(propertyModule).releaseRoomSlotReservation(PROPERTY_ID, TARGET_ROOM_ID);
        verify(tenancyService, never()).transferRoom(any(), any(), any(), any());
    }

    @Test
    @DisplayName("an agreement exit inside ten days is rejected before it can be persisted")
    void agreementExitHonoursTheTenDayFloorInTheServicePath() {
        Tenancy tenancy = fixedTermTenancy();
        BillingCycleResponse cycle = billingCycle(2);
        when(tenancyRepository.findByUserIdAndActiveTrueForUpdate(TENANT_ID))
                .thenReturn(Optional.of(tenancy));
        when(billingModule.getCurrentMyRentCycle(eq(TENANT_ID), any(LocalDate.class))).thenReturn(cycle);

        assertThatThrownBy(() -> exitRequestService.requestAgreementExit(
                TENANT_ID, LocalDate.now(REQUEST_ZONE).plusDays(9), "Leaving early"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("10 days from today");

        verify(exitRequestRepository, never()).save(any(TenancyExitRequest.class));
    }

    @Test
    @DisplayName("a first-cycle agreement tenant cannot request a premature exit")
    void firstBillingCycleBlocksPrematureExitInTheServicePath() {
        Tenancy tenancy = fixedTermTenancy();
        BillingCycleResponse cycle = billingCycle(1);
        when(tenancyRepository.findByUserIdAndActiveTrueForUpdate(TENANT_ID))
                .thenReturn(Optional.of(tenancy));
        when(billingModule.getCurrentMyRentCycle(eq(TENANT_ID), any(LocalDate.class))).thenReturn(cycle);

        assertThatThrownBy(() -> exitRequestService.requestAgreementExit(
                TENANT_ID, LocalDate.now(REQUEST_ZONE).plusDays(10), "Leaving early"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("first billing cycle");

        verify(exitRequestRepository, never()).save(any(TenancyExitRequest.class));
    }

    private static Tenancy activeTenancy() {
        return Tenancy.start(
                "TEN-2026-000001",
                TENANT_ID,
                PROPERTY_ID,
                CURRENT_ROOM_ID,
                ACTOR_ID,
                12_000_00L,
                10_000_00L,
                LocalDate.now(REQUEST_ZONE).minusMonths(2));
    }

    private static Tenancy fixedTermTenancy() {
        Tenancy tenancy = activeTenancy();
        tenancy.stampAgreementTerms(12, "One month rent");
        return tenancy;
    }

    private static BillingCycleResponse billingCycle(int cycleNumber) {
        LocalDate today = LocalDate.now(REQUEST_ZONE);
        return new BillingCycleResponse(
                BILLING_CYCLE_ID,
                "BIL-2026-000001",
                UUID.randomUUID(),
                "TEN-2026-000001",
                TENANT_ID,
                "Test Tenant",
                null,
                null,
                PROPERTY_ID,
                CURRENT_ROOM_ID,
                "101",
                TenancyBillingType.MONTHLY,
                BillingCycleCategory.RENT_CYCLE,
                cycleNumber,
                today.minusDays(2),
                today.plusDays(28),
                today.plusDays(3),
                BillingCollectionTiming.CYCLE_START,
                3,
                12_000_00L,
                0,
                0,
                100_00L,
                0,
                12_000_00L,
                BillingCycleStatus.UNPAID,
                null,
                null,
                null,
                List.of());
    }

    private static TenancyExitRequest pendingExit(Tenancy tenancy) {
        return TenancyExitRequest.normalNotice(
                "TEX-2026-000001",
                tenancy.getId(),
                TENANT_ID,
                PROPERTY_ID,
                CURRENT_ROOM_ID,
                LocalDate.now(REQUEST_ZONE).plusDays(10),
                "Leaving",
                null);
    }

    private static TenancyRoomChangeRequest pendingRoomChange(Tenancy tenancy) {
        return TenancyRoomChangeRequest.request(
                "TRC-2026-000001",
                tenancy.getId(),
                TENANT_ID,
                PROPERTY_ID,
                CURRENT_ROOM_ID,
                TARGET_ROOM_ID,
                BILLING_CYCLE_ID,
                LocalDate.now(REQUEST_ZONE).plusDays(5),
                "More space",
                14_000_00L);
    }

    private static TenancyRoomChangeRequest approvedDueRoomChange(Tenancy tenancy) {
        TenancyRoomChangeRequest request = TenancyRoomChangeRequest.request(
                "TRC-2026-000002",
                tenancy.getId(),
                TENANT_ID,
                PROPERTY_ID,
                CURRENT_ROOM_ID,
                TARGET_ROOM_ID,
                BILLING_CYCLE_ID,
                LocalDate.now(REQUEST_ZONE),
                "More space",
                14_000_00L);
        request.approve(ACTOR_ID, null);
        return request;
    }
}
