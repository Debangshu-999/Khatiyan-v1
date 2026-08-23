package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.event.BillingCycleGeneratedEvent;
import com.khatiyan.d_modules.billing.event.BillingLateFeeAppliedEvent;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItem;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.billing.repository.BillingCycleLineItemRepository;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.billing.repository.BillingManualPaymentRepository;
import com.khatiyan.d_modules.billing.repository.BillingMonthlyReportRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.model.RoomType;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;

@ExtendWith(MockitoExtension.class)
class BillingCycleServiceTest {

    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID TENANT_ID = UUID.randomUUID();
    private static final UUID TENANCY_ID = UUID.randomUUID();
    private static final UUID PROPERTY_ID = UUID.randomUUID();
    private static final UUID ROOM_ID = UUID.randomUUID();

    @Mock
    private BillingCycleRepository billingCycleRepository;

    @Mock
    private BillingCycleLineItemRepository lineItemRepository;

    @Mock
    private BillingManualPaymentRepository manualPaymentRepository;

    @Mock
    private BillingMonthlyReportRepository monthlyReportRepository;

    @Mock
    private TenancyModule tenancyModule;

    @Mock
    private PropertyModule propertyModule;

    @Mock
    private BillingAccessPolicy billingAccessPolicy;

    @Mock
    private AuthModule authModule;

    @Mock
    private DepositManagerService depositManagerService;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private ReferenceCodeGenerator referenceCodeGenerator;

    private BillingCycleService billingCycleService;
    private List<BillingCycleLineItem> savedLineItems;

    @BeforeEach
    void setUp() {
        billingCycleService = new BillingCycleService(
                billingCycleRepository,
                lineItemRepository,
                manualPaymentRepository,
                monthlyReportRepository,
                tenancyModule,
                propertyModule,
                billingAccessPolicy,
                authModule,
                depositManagerService,
                eventPublisher,
                referenceCodeGenerator,
                // Matches the app.billing.upcoming-cycle-lead-days default: the
                // next cycle appears 10 days before its window opens.
                10);

        savedLineItems = new ArrayList<>();
    }

    @Test
    void createFirstCycleCreatesRentAndDepositLinesAndMarksBillingStarted() {
        TenancyResponse tenancy = monthlyTenancy();
        when(referenceCodeGenerator.nextCode("BIL")).thenReturn("BIL-2026-000001");
        when(tenancyModule.findById(TENANCY_ID)).thenReturn(Optional.of(tenancy));
        when(billingCycleRepository.existsByTenancyIdAndCycleNumber(TENANCY_ID, 1)).thenReturn(false);
        when(authModule.findById(TENANT_ID)).thenReturn(Optional.of(tenantSummary()));
        when(propertyModule.getBillingPolicy(PROPERTY_ID)).thenReturn(billingPolicy(3, 100_00L));
        when(propertyModule.getActiveRoom(PROPERTY_ID, ROOM_ID)).thenReturn(room());
        when(billingCycleRepository.save(any(BillingCycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(billingCycleRepository.saveAndFlush(any(BillingCycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(lineItemRepository.save(any(BillingCycleLineItem.class))).thenAnswer(invocation -> {
            BillingCycleLineItem lineItem = invocation.getArgument(0);
            savedLineItems.add(lineItem);
            return lineItem;
        });
        when(lineItemRepository.findPendingByTenancyIdBefore(eq(TENANCY_ID), any(), any())).thenReturn(List.of());
        when(lineItemRepository.findByBillingCycleId(any())).thenAnswer(invocation -> lineItemsFor(invocation.getArgument(0)));

        BillingCycleResponse response = billingCycleService.createFirstCycle(ACTOR_ID, TENANCY_ID);

        assertThat(response.cycleNumber()).isEqualTo(1);
        assertThat(response.referenceCode()).isEqualTo("BIL-2026-000001");
        assertThat(response.periodStartDate()).isEqualTo(LocalDate.of(2026, 6, 1));
        assertThat(response.periodEndDate()).isEqualTo(LocalDate.of(2026, 6, 30));
        assertThat(response.rentDueDate()).isEqualTo(LocalDate.of(2026, 6, 4));
        assertThat(response.baseAmountPaise()).isEqualTo(12_000_00);
        assertThat(response.totalAmountPaise()).isEqualTo(22_000_00);
        assertThat(response.lineItems())
                .extracting(lineItem -> lineItem.type())
                .containsExactly(BillingCycleLineItemType.RENT, BillingCycleLineItemType.DEPOSIT);

        verify(billingAccessPolicy).ensureCanManageBilling(ACTOR_ID, PROPERTY_ID);
        verify(tenancyModule).markBillingStarted(TENANCY_ID);
        verify(eventPublisher).publishEvent(any(BillingCycleGeneratedEvent.class));
    }

    /**
     * The bug this pair exists for: a tenancy onboarded during the day left an
     * unpayable UPCOMING bill until 00:18 IST the next morning, because only the
     * nightly job ever opened it. Creation now opens a cycle whose period has
     * already started.
     */
    @Test
    void createFirstCycleOpensItWhenThePeriodHasAlreadyStarted() {
        stubFirstCycleCreation(monthlyTenancy());

        BillingCycleResponse response = billingCycleService.createFirstCycle(ACTOR_ID, TENANCY_ID);

        assertThat(response.status()).isEqualTo(BillingCycleStatus.UNPAID);
    }

    /** A future-dated start still waits for the nightly job — that is its job. */
    @Test
    void createFirstCycleLeavesAFutureDatedPeriodUpcoming() {
        stubFirstCycleCreation(monthlyTenancyStartingOn(LocalDate.now().plusMonths(2).withDayOfMonth(1)));

        BillingCycleResponse response = billingCycleService.createFirstCycle(ACTOR_ID, TENANCY_ID);

        assertThat(response.status()).isEqualTo(BillingCycleStatus.UPCOMING);
    }

    @Test
    void recalculateLateFeesChargesTheOverdueCycleItself() {
        BillingCycle overdue = monthlyLiveCycleDue(LocalDate.of(2026, 6, 1), 100_00L);
        BillingCycleLineItem rentLine = BillingCycleLineItem.systemCharge(
                overdue,
                BillingCycleLineItemType.RENT,
                "Rent",
                "Monthly rent",
                12_000_00,
                1);
        savedLineItems.add(rentLine);

        when(billingCycleRepository.findCyclesEligibleForLateFee(any(), eq(LocalDate.of(2026, 6, 2))))
                .thenReturn(List.of(overdue));
        when(lineItemRepository.findByBillingCycleIdAndType(overdue.getId(), BillingCycleLineItemType.LATE_FEE))
                .thenReturn(List.of());
        when(lineItemRepository.findMaxDisplayOrder(overdue.getId())).thenReturn(1);
        when(lineItemRepository.save(any(BillingCycleLineItem.class))).thenAnswer(invocation -> {
            BillingCycleLineItem lineItem = invocation.getArgument(0);
            savedLineItems.add(lineItem);
            return lineItem;
        });
        when(lineItemRepository.findByBillingCycleId(overdue.getId()))
                .thenAnswer(invocation -> lineItemsFor(overdue.getId()));

        int updatedCount = billingCycleService.recalculateLateFees(LocalDate.of(2026, 6, 2));

        assertThat(updatedCount).isEqualTo(1);

        // One day late, on the bill that is late. Being overdue is the only
        // thing allowed to move a figure the tenant has already been shown.
        assertThat(overdue.getLateFeeAmountPaise()).isEqualTo(100_00);
        assertThat(overdue.getTotalAmountPaise()).isEqualTo(12_100_00);
        assertThat(savedLineItems)
                .filteredOn(lineItem -> lineItem.getType() == BillingCycleLineItemType.LATE_FEE)
                .singleElement()
                .satisfies(lineItem -> {
                    assertThat(lineItem.getBillingCycleId()).isEqualTo(overdue.getId());
                    assertThat(lineItem.getAmountPaise()).isEqualTo(100_00);
                    assertThat(lineItem.isSystemGenerated()).isTrue();
                });

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue()).isInstanceOf(BillingLateFeeAppliedEvent.class);
    }

    @Test
    void recalculateLateFeesNeedsNoUpcomingCycleToChargeTheFee() {
        // The regression this replaces: the fee used to be carried to the next
        // cycle, which is generated only ten days before it starts. A tenant
        // going overdue early in a month therefore accrued nothing anywhere for
        // weeks, then got the whole run as one lump on a later bill.
        BillingCycle overdue = monthlyLiveCycleDue(LocalDate.of(2026, 6, 1), 100_00L);

        when(billingCycleRepository.findCyclesEligibleForLateFee(any(), eq(LocalDate.of(2026, 6, 4))))
                .thenReturn(List.of(overdue));
        when(lineItemRepository.findByBillingCycleIdAndType(overdue.getId(), BillingCycleLineItemType.LATE_FEE))
                .thenReturn(List.of());
        when(lineItemRepository.findMaxDisplayOrder(overdue.getId())).thenReturn(1);
        when(lineItemRepository.save(any(BillingCycleLineItem.class))).thenAnswer(invocation -> {
            BillingCycleLineItem lineItem = invocation.getArgument(0);
            savedLineItems.add(lineItem);
            return lineItem;
        });
        when(lineItemRepository.findByBillingCycleId(overdue.getId()))
                .thenAnswer(invocation -> lineItemsFor(overdue.getId()));

        int updatedCount = billingCycleService.recalculateLateFees(LocalDate.of(2026, 6, 4));

        assertThat(updatedCount).isEqualTo(1);
        assertThat(overdue.getLateFeeAmountPaise()).isEqualTo(300_00);
        verifyNoInteractions(tenancyModule);
    }

    @Test
    void recalculateLateFeesLeavesAManuallyAdjustedFeeAlone() {
        BillingCycle overdue = monthlyLiveCycleDue(LocalDate.of(2026, 6, 1), 100_00L);
        BillingCycleLineItem adjusted = BillingCycleLineItem.lateFee(
                overdue, "Late fee", "Accrues daily while this bill is overdue", 100_00, 2);
        adjusted.adjust(50_00, ACTOR_ID);
        savedLineItems.add(adjusted);

        when(billingCycleRepository.findCyclesEligibleForLateFee(any(), eq(LocalDate.of(2026, 6, 6))))
                .thenReturn(List.of(overdue));
        when(lineItemRepository.findByBillingCycleIdAndType(overdue.getId(), BillingCycleLineItemType.LATE_FEE))
                .thenReturn(List.of(adjusted));

        int updatedCount = billingCycleService.recalculateLateFees(LocalDate.of(2026, 6, 6));

        // An owner who waived part of the fee has made a decision. The nightly
        // job must not quietly put it back.
        assertThat(updatedCount).isZero();
        assertThat(adjusted.getAmountPaise()).isEqualTo(50_00);
    }

    @Test
    void activateStampsTheLateFeeRateSoLaterPolicyChangesCannotRepriceTheCycle() {
        BillingCycle cycle = monthlyUpcomingCycle();
        assertThat(cycle.getLateFeePerDayPaise()).isNull();

        cycle.activate(150_00L);

        assertThat(cycle.getStatus()).isEqualTo(BillingCycleStatus.UNPAID);
        assertThat(cycle.getLateFeePerDayPaise()).isEqualTo(150_00L);
        assertThat(cycle.isLocked()).isTrue();
    }

    private List<BillingCycleLineItem> lineItemsFor(UUID billingCycleId) {
        return savedLineItems.stream()
                .filter(lineItem -> billingCycleId.equals(lineItem.getBillingCycleId()))
                .toList();
    }

    /**
     * Regression: raising a one-off bill used to make a tenant disappear from the
     * pending-generation list. The one-off is dated today, so treating it as the
     * tenancy's latest cycle put that date inside the current month and the
     * "latest cycle is from a prior month" filter dropped the tenant — the screen
     * then claimed their rent cycle had been generated when it had not.
     */
    @Test
    void oneOffBillDoesNotHideATenancyStillAwaitingItsRentCycle() {
        LocalDate today = LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"));
        LocalDate lastMonthStart = today.withDayOfMonth(1).minusMonths(1);

        BillingCycle lastMonthsRent = BillingCycle.create(
                TENANCY_ID,
                "BIL-2026-000001",
                TENANT_ID,
                "Test Tenant",
                PROPERTY_ID,
                ROOM_ID,
                TenancyBillingType.MONTHLY,
                1,
                lastMonthStart,
                lastMonthStart.plusMonths(1).minusDays(1),
                lastMonthStart.plusDays(3),
                BillingCollectionTiming.CYCLE_START,
                3);
        BillingCycle todaysOneOff = BillingCycle.createOneOff(
                TENANCY_ID,
                "BIL-2026-000002",
                TENANT_ID,
                "Test Tenant",
                PROPERTY_ID,
                ROOM_ID,
                TenancyBillingType.MONTHLY,
                today);

        when(billingCycleRepository.findByPropertyId(PROPERTY_ID))
                .thenReturn(List.of(lastMonthsRent, todaysOneOff));
        when(tenancyModule.findActiveByPropertyId(PROPERTY_ID)).thenReturn(List.of(monthlyTenancy()));
        when(propertyModule.findRoomsForDisplay(eq(PROPERTY_ID), any())).thenReturn(java.util.Map.of());

        var result = billingCycleService.listUpcomingPropertyCycles(ACTOR_ID, PROPERTY_ID, null, 0, 20);

        assertThat(result.items())
                .as("the tenant still owes a rent cycle this month, one-off bill or not")
                .hasSize(1);
        assertThat(result.items().get(0).tenancyId()).isEqualTo(TENANCY_ID);
    }

    private static BillingCycle monthlyCycleDue(LocalDate dueDate) {
        return BillingCycle.create(
                TENANCY_ID,
                "TEN-2026-000001",
                TENANT_ID,
                "Test Tenant",
                PROPERTY_ID,
                ROOM_ID,
                TenancyBillingType.MONTHLY,
                1,
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 30),
                dueDate,
                BillingCollectionTiming.CYCLE_START,
                3);
    }

    /**
     * A cycle whose window has opened, reached the way production does: created
     * upcoming, then activated with the rate in force at that moment.
     */
    private static BillingCycle monthlyLiveCycleDue(LocalDate dueDate, long lateFeePerDayPaise) {
        BillingCycle cycle = BillingCycle.createUpcoming(
                TENANCY_ID,
                "BIL-2026-000001",
                TENANT_ID,
                "Test Tenant",
                PROPERTY_ID,
                ROOM_ID,
                TenancyBillingType.MONTHLY,
                1,
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 30),
                dueDate,
                BillingCollectionTiming.CYCLE_START,
                3);
        cycle.activate(lateFeePerDayPaise);
        return cycle;
    }

    /** The next cycle, generated ahead of its window and still editable. */
    private static BillingCycle monthlyUpcomingCycle() {
        return BillingCycle.createUpcoming(
                TENANCY_ID,
                "BIL-2026-000002",
                TENANT_ID,
                "Test Tenant",
                PROPERTY_ID,
                ROOM_ID,
                TenancyBillingType.MONTHLY,
                2,
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 7, 31),
                LocalDate.of(2026, 7, 4),
                BillingCollectionTiming.CYCLE_START,
                3);
    }

    /** The mocks createFirstCycle needs, shared by the tests that only assert status. */
    private void stubFirstCycleCreation(TenancyResponse tenancy) {
        when(referenceCodeGenerator.nextCode("BIL")).thenReturn("BIL-2026-000001");
        when(tenancyModule.findById(TENANCY_ID)).thenReturn(Optional.of(tenancy));
        when(billingCycleRepository.existsByTenancyIdAndCycleNumber(TENANCY_ID, 1)).thenReturn(false);
        when(authModule.findById(TENANT_ID)).thenReturn(Optional.of(tenantSummary()));
        when(propertyModule.getBillingPolicy(PROPERTY_ID)).thenReturn(billingPolicy(3, 100_00L));
        when(propertyModule.getActiveRoom(PROPERTY_ID, ROOM_ID)).thenReturn(room());
        when(billingCycleRepository.save(any(BillingCycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(billingCycleRepository.saveAndFlush(any(BillingCycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(lineItemRepository.save(any(BillingCycleLineItem.class))).thenAnswer(invocation -> {
            BillingCycleLineItem lineItem = invocation.getArgument(0);
            savedLineItems.add(lineItem);
            return lineItem;
        });
        when(lineItemRepository.findPendingByTenancyIdBefore(eq(TENANCY_ID), any(), any())).thenReturn(List.of());
        when(lineItemRepository.findByBillingCycleId(any())).thenAnswer(invocation -> lineItemsFor(invocation.getArgument(0)));
    }

    /** Same tenancy, but starting well after today so its cycle is not yet due. */
    private static TenancyResponse monthlyTenancyStartingOn(LocalDate startDate) {
        TenancyResponse base = monthlyTenancy();
        return new TenancyResponse(
                base.id(), base.referenceCode(), base.userId(), base.tenantName(), base.tenantPhone(),
                base.tenantPhoneVerified(), base.tenantProfileCompleted(), base.propertyId(), base.roomId(),
                base.createdByUserId(), base.billingType(), base.rentAmountPaise(), base.depositAmountPaise(),
                base.dailyRatePaise(), startDate, base.plannedEndDate(), base.endDate(), base.status(),
                base.createdAt(), base.billingStarted(), base.tosAccepted(), base.fixedTerm(),
                base.agreementEndDate(), base.earlyExitRule(), base.idCheckConfirmed(), base.idCheckedAt());
    }

    private static TenancyResponse monthlyTenancy() {
        return new TenancyResponse(
                TENANCY_ID,
                "TEN-2026-000001",
                TENANT_ID,
                "Test Tenant",
                "+911234567890",
                true,
                true,
                PROPERTY_ID,
                ROOM_ID,
                ACTOR_ID,
                TenancyBillingType.MONTHLY,
                12_000_00L,
                10_000_00L,
                null,
                LocalDate.of(2026, 6, 1),
                null,
                null,
                TenancyStatus.ACTIVE,
                null,
                false,
                true,
                false,
                null,
                null,
                null,
                null);
    }

    private static UserSummaryResponse tenantSummary() {
        return new UserSummaryResponse(
                TENANT_ID,
                "+919007433360",
                "tenant@example.com",
                "Test Tenant",
                null,
                UserRole.USER,
                true,
                true,
                true,
                true,
                true);
    }

    private static PropertyBillingPolicyResponse billingPolicy(int rentGraceDays, Long lateFeePerDayPaise) {
        return new PropertyBillingPolicyResponse(
                BillingCollectionTiming.CYCLE_START,
                rentGraceDays,
                lateFeePerDayPaise);
    }

    private static RoomResponse room() {
        return new RoomResponse(
                ROOM_ID,
                PROPERTY_ID,
                "101",
                "1",
                1,
                0,
                0,
                1,
                RoomType.SINGLE,
                RoomConditioning.NON_AC,
                12_000_00L,
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
