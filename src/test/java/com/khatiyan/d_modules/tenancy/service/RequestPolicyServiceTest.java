package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.model.BillingCycleCategory;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.model.RoomType;
import com.khatiyan.d_modules.tenancy.api.dto.ApproveTenancyExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.EndTenancyRequest;
import com.khatiyan.d_modules.tenancy.api.dto.ExitCheckoutWindowResponse;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomChangeExecutionFailedEvent;
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
 *
 * <p>A scheduled move runs once. One that cannot run is cancelled, its bed
 * released and everyone told, never reopened for another decision.
 */
@ExtendWith(MockitoExtension.class)
class RequestPolicyServiceTest {

    private static final ZoneId REQUEST_ZONE = ZoneId.of("Asia/Kolkata");
    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID OWNER_ID = UUID.randomUUID();
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
    @DisplayName("a room change cannot be approved once its move date has arrived")
    void approvalNeedsTheMoveDateStillAhead() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = roomChangeDueOn(tenancy, LocalDate.now(REQUEST_ZONE));
        when(roomChangeRequestRepository.findByIdForUpdate(roomChange.getId()))
                .thenReturn(Optional.of(roomChange));
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> roomChangeRequestService.approve(ACTOR_ID, roomChange.getId(), null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("move date has already passed");

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
    @DisplayName("the scheduler cancels an approved move when the tenancy has ended, and tells everyone")
    void schedulerRechecksActiveTenancyBeforeExecutingRoomChange() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = approvedDueRoomChange(tenancy);
        tenancy.end(LocalDate.now(REQUEST_ZONE), "Exit completed");
        when(roomChangeRequestRepository.findByIdForUpdate(roomChange.getId()))
                .thenReturn(Optional.of(roomChange));
        when(tenancyRepository.findByIdForUpdate(tenancy.getId())).thenReturn(Optional.of(tenancy));

        var response = roomChangeRequestService.executeDueApprovedRequest(roomChange.getId());

        assertThat(response.status()).isEqualTo(TenancyRoomChangeRequestStatus.CANCELLED);
        assertThat(response.adminNotes()).contains("no longer active");
        verify(propertyModule).releaseRoomSlotReservation(PROPERTY_ID, TARGET_ROOM_ID);
        verify(tenancyService, never()).transferRoom(any(), any(), any(), any());
        verifyNoInteractions(billingModule);

        ArgumentCaptor<TenancyRoomChangeExecutionFailedEvent> told =
                ArgumentCaptor.forClass(TenancyRoomChangeExecutionFailedEvent.class);
        verify(eventPublisher).publishEvent(told.capture());
        assertThat(told.getValue().reason()).contains("no longer active");
    }

    @Test
    @DisplayName("the scheduler cancels a legacy conflicting move instead of executing it")
    void schedulerRecoversIfAnExitAndApprovedRoomChangeCoexist() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = approvedDueRoomChange(tenancy);
        when(roomChangeRequestRepository.findByIdForUpdate(roomChange.getId()))
                .thenReturn(Optional.of(roomChange));
        when(tenancyRepository.findByIdForUpdate(tenancy.getId())).thenReturn(Optional.of(tenancy));
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.of(pendingExit(tenancy)));

        var response = roomChangeRequestService.executeDueApprovedRequest(roomChange.getId());

        assertThat(response.status()).isEqualTo(TenancyRoomChangeRequestStatus.CANCELLED);
        assertThat(response.adminNotes()).contains("exit request is open");
        verify(propertyModule).releaseRoomSlotReservation(PROPERTY_ID, TARGET_ROOM_ID);
        verify(tenancyService, never()).transferRoom(any(), any(), any(), any());
        verify(eventPublisher).publishEvent(any(TenancyRoomChangeExecutionFailedEvent.class));
    }

    @Test
    @DisplayName("a due move runs as the owner and carries the next cycle onto the new room and rent")
    void scheduledMoveRunsAsTheOwnerAndMovesTheNextCycle() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = approvedDueRoomChange(tenancy);
        Tenancy moved = Tenancy.start(
                "TEN-2026-000001",
                TENANT_ID,
                PROPERTY_ID,
                TARGET_ROOM_ID,
                ACTOR_ID,
                14_000_00L,
                10_000_00L,
                LocalDate.now(REQUEST_ZONE).minusMonths(2));
        when(roomChangeRequestRepository.findByIdForUpdate(roomChange.getId()))
                .thenReturn(Optional.of(roomChange));
        when(tenancyRepository.findByIdForUpdate(tenancy.getId())).thenReturn(Optional.of(tenancy));
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(propertyModule.getActiveProperty(PROPERTY_ID)).thenReturn(property(OWNER_ID, NoticePeriod.ONE_MONTH));
        when(tenancyRepository.findById(tenancy.getId())).thenReturn(Optional.of(tenancy));
        when(propertyModule.getActiveRoom(PROPERTY_ID, TARGET_ROOM_ID)).thenReturn(vacantTargetRoom());
        when(tenancyService.transferRoom(
                OWNER_ID, tenancy.getId(), TARGET_ROOM_ID, roomChange.getEffectiveTransferDate()))
                .thenReturn(moved);

        var response = roomChangeRequestService.executeDueApprovedRequest(roomChange.getId());

        assertThat(response.status()).isEqualTo(TenancyRoomChangeRequestStatus.EXECUTED);
        // The approver may have lost access since. The owner has not.
        verify(tenancyAccessPolicy).ensureCanManageRoomChanges(OWNER_ID, PROPERTY_ID);
        verify(tenancyAccessPolicy, never()).ensureCanManageRoomChanges(eq(ACTOR_ID), any());
        verify(billingModule).applyRoomTransferToUpcomingCycles(
                tenancy.getId(), BILLING_CYCLE_ID, TARGET_ROOM_ID, 14_000_00L);
    }

    @Test
    @DisplayName("a move whose run crashed is cancelled without showing anyone the error")
    void crashedRunCancelsWithANeutralReason() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = approvedDueRoomChange(tenancy);
        when(roomChangeRequestRepository.findByIdForUpdate(roomChange.getId()))
                .thenReturn(Optional.of(roomChange));

        roomChangeRequestService.closeAfterExecutionFailure(
                roomChange.getId(),
                new IllegalStateException("could not execute statement; SQL [update property.rooms set ...]"));

        assertThat(roomChange.getStatus()).isEqualTo(TenancyRoomChangeRequestStatus.CANCELLED);
        assertThat(roomChange.getAdminNotes()).doesNotContain("SQL").contains("system error");
        verify(propertyModule).releaseRoomSlotReservation(PROPERTY_ID, TARGET_ROOM_ID);
        verify(eventPublisher).publishEvent(any(TenancyRoomChangeExecutionFailedEvent.class));
    }

    @Test
    @DisplayName("a move refused on transfer day is cancelled with the refusal as its reason")
    void refusedRunCancelsWithTheRefusal() {
        Tenancy tenancy = activeTenancy();
        TenancyRoomChangeRequest roomChange = approvedDueRoomChange(tenancy);
        when(roomChangeRequestRepository.findByIdForUpdate(roomChange.getId()))
                .thenReturn(Optional.of(roomChange));

        roomChangeRequestService.closeAfterExecutionFailure(
                roomChange.getId(),
                new ValidationException(
                        "The next billing cycle has already opened at the old rent, so this room change cannot run"));

        assertThat(roomChange.getStatus()).isEqualTo(TenancyRoomChangeRequestStatus.CANCELLED);
        assertThat(roomChange.getAdminNotes()).contains("already opened at the old rent");
    }

    @Test
    @DisplayName("a stay cannot be ended while the tenant's withdrawal is undecided")
    void endingAStayWaitsForAPendingWithdrawal() {
        Tenancy tenancy = activeTenancy();
        TenancyExitRequest exit = pendingExit(tenancy);
        exit.approveNormal(ACTOR_ID, null, null, null, null);
        ReflectionTestUtils.setField(exit, "status", TenancyExitRequestStatus.WITHDRAWAL_REQUESTED);
        when(tenancyRepository.findById(tenancy.getId())).thenReturn(Optional.of(tenancy));
        when(exitRequestRepository.findByTenancyId(tenancy.getId())).thenReturn(List.of(exit));

        assertThatThrownBy(() -> exitRequestService.endTenancyNow(
                ACTOR_ID, tenancy.getId(), new EndTenancyRequest(null, null, null, null, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("withdraw");

        verifyNoInteractions(billingModule, tenancyService);
    }

    @Test
    @DisplayName("a short notice that lands past the cycle end rolls into the next cycle instead of refusing")
    void subMonthNoticeRollsForwardIntoTheNextCycle() {
        Tenancy tenancy = activeTenancy();
        LocalDate today = LocalDate.now(REQUEST_ZONE);
        BillingCycleResponse cycle = billingCycle(2, today.minusDays(25), today.plusDays(5));
        LocalDate nextCycleEnd = today.plusDays(35);
        withCheckoutWindowInputs(tenancy, cycle, NoticePeriod.FIVE_DAYS);
        when(billingModule.periodEndAfterCycles(tenancy.getId(), cycle.periodStartDate(), 1))
                .thenReturn(nextCycleEnd);

        ExitCheckoutWindowResponse window = exitRequestService.getExitCheckoutWindow(TENANT_ID);

        assertThat(window.earliestPossibleDate()).isEqualTo(today.plusDays(TenancyExitRequestService.MIN_EXIT_LEAD_DAYS));
        assertThat(window.latestCheckoutDate()).isEqualTo(nextCycleEnd);
    }

    @Test
    @DisplayName("a one-month notice given late in its cycle rolls to the next cycle's end")
    void wholeMonthNoticeRollsForwardPastTheLeadTime() {
        Tenancy tenancy = activeTenancy();
        LocalDate today = LocalDate.now(REQUEST_ZONE);
        BillingCycleResponse cycle = billingCycle(2, today.minusDays(25), today.plusDays(5));
        LocalDate nextCycleEnd = today.plusDays(35);
        withCheckoutWindowInputs(tenancy, cycle, NoticePeriod.ONE_MONTH);
        when(billingModule.periodEndAfterCycles(tenancy.getId(), cycle.periodStartDate(), 0))
                .thenReturn(cycle.periodEndDate());
        when(billingModule.periodEndAfterCycles(tenancy.getId(), cycle.periodStartDate(), 1))
                .thenReturn(nextCycleEnd);

        ExitCheckoutWindowResponse window = exitRequestService.getExitCheckoutWindow(TENANT_ID);

        assertThat(window.earliestCheckoutDate()).isEqualTo(nextCycleEnd);
        assertThat(window.latestCheckoutDate()).isEqualTo(nextCycleEnd);
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

    @Test
    @DisplayName("a request a newer one already replaced stops offering re-raise")
    void supersededRequestStopsOfferingReRaise() {
        Tenancy tenancy = activeTenancy();
        TenancyExitRequest lapsed = pendingExit(tenancy);
        lapsed.expire();
        TenancyExitRequest reRaised = TenancyExitRequest.normalNotice(
                "TEX-2026-000002",
                tenancy.getId(),
                TENANT_ID,
                PROPERTY_ID,
                CURRENT_ROOM_ID,
                LocalDate.now(REQUEST_ZONE).plusDays(12),
                "Leaving",
                lapsed);
        when(exitRequestRepository.findByPropertyId(PROPERTY_ID)).thenReturn(List.of(lapsed, reRaised));
        when(authModule.findByIds(any())).thenReturn(java.util.Map.of());

        var responses = exitRequestService.listForProperty(ACTOR_ID, PROPERTY_ID);

        // On its own the lapsed request is still inside its 48-hour window and
        // would still offer the action. The re-raise has already used it.
        assertThat(responses)
                .filteredOn(response -> response.id().equals(lapsed.getId()))
                .singleElement()
                .satisfies(response -> assertThat(response.reRaiseAllowed()).isFalse());
    }

    @Test
    @DisplayName("a second exit request in the same billing cycle is refused")
    void oneExitRequestPerBillingCycle() {
        Tenancy tenancy = activeTenancy();
        BillingCycleResponse cycle = billingCycle(2);
        TenancyExitRequest rejected = pendingExit(tenancy);
        rejected.reject(ACTOR_ID, "wrong date");
        // Past its 48-hour correction window, so this is a new request rather
        // than a re-raise.
        ReflectionTestUtils.setField(rejected, "expiresAt", Instant.now().minusSeconds(60));

        when(tenancyRepository.findByUserIdAndActiveTrueForUpdate(TENANT_ID))
                .thenReturn(Optional.of(tenancy));
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(roomChangeRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(billingModule.getCurrentMyRentCycle(eq(TENANT_ID), any(LocalDate.class))).thenReturn(cycle);
        when(exitRequestRepository.findLatestByTenancyId(tenancy.getId()))
                .thenReturn(Optional.of(rejected));

        assertThatThrownBy(() -> exitRequestService.requestExit(TENANT_ID, null, "Leaving"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already been raised for this billing cycle")
                .hasMessageContaining(cycle.periodEndDate().plusDays(1).toString());

        verify(exitRequestRepository, never()).save(any(TenancyExitRequest.class));
    }

    @Test
    @DisplayName("a request nobody ever answered returns the cycle's slot, payment window and all")
    void unreviewedExpiryAllowsACompletelyNewRequest() {
        Tenancy tenancy = activeTenancy();
        LocalDate today = LocalDate.now(REQUEST_ZONE);
        // Rent was due five days ago, so the payment window this route normally
        // insists on has already shut.
        BillingCycleResponse cycle = billingCycle(2, today.minusDays(10), today.plusDays(20));
        TenancyExitRequest ignored = pendingExit(tenancy);
        ignored.expire();
        ReflectionTestUtils.setField(ignored, "expiresAt", Instant.now().minusSeconds(60));

        when(tenancyRepository.findByUserIdAndActiveTrueForUpdate(TENANT_ID))
                .thenReturn(Optional.of(tenancy));
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(roomChangeRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(billingModule.getCurrentMyRentCycle(eq(TENANT_ID), any(LocalDate.class))).thenReturn(cycle);
        when(exitRequestRepository.findLatestByTenancyId(tenancy.getId()))
                .thenReturn(Optional.of(ignored));
        when(propertyModule.getActiveProperty(PROPERTY_ID))
                .thenReturn(property(ACTOR_ID, NoticePeriod.FIFTEEN_DAYS));
        when(referenceCodeGenerator.nextCode("TEX")).thenReturn("TEX-2026-000002");
        when(exitRequestRepository.save(any(TenancyExitRequest.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        exitRequestService.requestExit(TENANT_ID, null, "Leaving");

        ArgumentCaptor<TenancyExitRequest> saved = ArgumentCaptor.forClass(TenancyExitRequest.class);
        verify(exitRequestRepository).save(saved.capture());
        // Completely new, not a re-raise: its own anchor, no link back, and the
        // chain counter starts over.
        assertThat(saved.getValue().getSupersededRequestId()).isNull();
        assertThat(saved.getValue().getNoticeAnchorDate()).isEqualTo(today);
        assertThat(saved.getValue().getReRaiseCount()).isZero();
    }

    @Test
    @DisplayName("a lapsed request from an earlier cycle does not spend this cycle's slot")
    void anEarlierCyclesRequestDoesNotBlockThisOne() {
        Tenancy tenancy = activeTenancy();
        LocalDate today = LocalDate.now(REQUEST_ZONE);
        BillingCycleResponse cycle = billingCycle(3, today.minusDays(1), today.plusDays(29));
        TenancyExitRequest lastMonth = pendingExit(tenancy);
        lastMonth.reject(ACTOR_ID, "wrong date");
        ReflectionTestUtils.setField(lastMonth, "expiresAt", Instant.now().minusSeconds(60));
        ReflectionTestUtils.setField(lastMonth, "noticeAnchorDate", today.minusDays(20));

        when(tenancyRepository.findByUserIdAndActiveTrueForUpdate(TENANT_ID))
                .thenReturn(Optional.of(tenancy));
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(roomChangeRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(billingModule.getCurrentMyRentCycle(eq(TENANT_ID), any(LocalDate.class))).thenReturn(cycle);
        when(exitRequestRepository.findLatestByTenancyId(tenancy.getId()))
                .thenReturn(Optional.of(lastMonth));
        when(propertyModule.getActiveProperty(PROPERTY_ID))
                .thenReturn(property(ACTOR_ID, NoticePeriod.FIFTEEN_DAYS));
        when(referenceCodeGenerator.nextCode("TEX")).thenReturn("TEX-2026-000003");
        when(exitRequestRepository.save(any(TenancyExitRequest.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        exitRequestService.requestExit(TENANT_ID, null, "Leaving");

        verify(exitRequestRepository).save(any(TenancyExitRequest.class));
    }

    @Test
    @DisplayName("breaking a lock-in spends the same one request per cycle")
    void agreementExitIsAlsoOnePerCycle() {
        Tenancy tenancy = fixedTermTenancy();
        BillingCycleResponse cycle = billingCycle(2);
        TenancyExitRequest rejected = pendingExit(tenancy);
        rejected.reject(ACTOR_ID, "not this month");
        ReflectionTestUtils.setField(rejected, "expiresAt", Instant.now().minusSeconds(60));

        when(tenancyRepository.findByUserIdAndActiveTrueForUpdate(TENANT_ID))
                .thenReturn(Optional.of(tenancy));
        when(billingModule.getCurrentMyRentCycle(eq(TENANT_ID), any(LocalDate.class))).thenReturn(cycle);
        when(exitRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(roomChangeRequestRepository.findOpenByTenancyId(eq(tenancy.getId()), anyList()))
                .thenReturn(Optional.empty());
        when(exitRequestRepository.findLatestByTenancyId(tenancy.getId()))
                .thenReturn(Optional.of(rejected));

        // This route has no payment window of its own, so before the cycle rule
        // it was the way to raise a request every day of the month.
        assertThatThrownBy(() -> exitRequestService.requestAgreementExit(
                TENANT_ID, LocalDate.now(REQUEST_ZONE).plusDays(10), "Leaving early"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already been raised for this billing cycle");

        verify(exitRequestRepository, never()).save(any(TenancyExitRequest.class));
    }

    private void withCheckoutWindowInputs(Tenancy tenancy, BillingCycleResponse cycle, NoticePeriod noticePeriod) {
        when(tenancyRepository.findByUserIdAndActiveTrue(TENANT_ID)).thenReturn(Optional.of(tenancy));
        when(billingModule.getCurrentMyRentCycle(eq(TENANT_ID), any(LocalDate.class))).thenReturn(cycle);
        when(exitRequestRepository.findLatestByTenancyId(tenancy.getId())).thenReturn(Optional.empty());
        when(propertyModule.getActiveProperty(PROPERTY_ID)).thenReturn(property(ACTOR_ID, noticePeriod));
    }

    // Real responses, not mocks: records are final, and this project's Mockito
    // is configured with a mock maker that cannot mock final classes.
    private static PropertyResponse property(UUID ownerId, NoticePeriod noticePeriod) {
        return new PropertyResponse(
                PROPERTY_ID, "PRO-2026-000001", ownerId, "Test PG",
                null, null, null, null, null, null, null,
                null, null, null, false, Set.of(), false, null, Set.of(), Set.of(), Set.of(),
                null, null, null,
                BillingCollectionTiming.CYCLE_START, 3, 10_000_00L, noticePeriod, 0,
                null, false, true);
    }

    private static RoomResponse vacantTargetRoom() {
        return new RoomResponse(
                TARGET_ROOM_ID, PROPERTY_ID, "102", "1",
                1, 0, 0, 1,
                RoomType.SINGLE, RoomConditioning.NON_AC, 14_000_00L,
                null, Set.of(), Set.of(), RoomStatus.VACANT, true,
                null, null, null, null, null, null);
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
        return billingCycle(cycleNumber, today.minusDays(2), today.plusDays(28));
    }

    private static BillingCycleResponse billingCycle(int cycleNumber, LocalDate periodStart, LocalDate periodEnd) {
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
                periodStart,
                periodEnd,
                periodStart.plusDays(5),
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
        return roomChangeDueOn(tenancy, LocalDate.now(REQUEST_ZONE).plusDays(5));
    }

    private static TenancyRoomChangeRequest roomChangeDueOn(Tenancy tenancy, LocalDate transferDate) {
        return TenancyRoomChangeRequest.request(
                "TRC-2026-000001",
                tenancy.getId(),
                TENANT_ID,
                PROPERTY_ID,
                CURRENT_ROOM_ID,
                TARGET_ROOM_ID,
                BILLING_CYCLE_ID,
                transferDate,
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
