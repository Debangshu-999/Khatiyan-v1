package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
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
import com.khatiyan.d_modules.billing.repository.BillingCycleLineItemRepository;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
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
    private TenancyModule tenancyModule;

    @Mock
    private PropertyModule propertyModule;

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
                tenancyModule,
                propertyModule,
                authModule,
                depositManagerService,
                eventPublisher,
                referenceCodeGenerator);

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

        verify(propertyModule).ensureCanManageProperty(ACTOR_ID, PROPERTY_ID);
        verify(tenancyModule).markBillingStarted(TENANCY_ID);
        verify(eventPublisher).publishEvent(any(BillingCycleGeneratedEvent.class));
    }

    @Test
    void recalculateLateFeesCreatesTransparentLateFeeLine() {
        BillingCycle cycle = monthlyCycleDue(LocalDate.of(2026, 5, 30));
        BillingCycleLineItem rentLine = BillingCycleLineItem.systemCharge(
                cycle,
                BillingCycleLineItemType.RENT,
                "Rent",
                "Monthly rent",
                12_000_00,
                1);
        savedLineItems.add(rentLine);
        when(billingCycleRepository.findCyclesEligibleForLateFee(any(), eq(LocalDate.of(2026, 6, 2))))
                .thenReturn(List.of(cycle));
        when(propertyModule.getBillingPolicy(PROPERTY_ID)).thenReturn(billingPolicy(3, 100_00L));
        when(lineItemRepository.findByBillingCycleIdAndType(cycle.getId(), BillingCycleLineItemType.LATE_FEE))
                .thenReturn(List.of());
        when(lineItemRepository.findMaxDisplayOrder(cycle.getId())).thenReturn(1);
        when(lineItemRepository.save(any(BillingCycleLineItem.class))).thenAnswer(invocation -> {
            BillingCycleLineItem lineItem = invocation.getArgument(0);
            savedLineItems.add(lineItem);
            return lineItem;
        });
        when(lineItemRepository.findByBillingCycleId(cycle.getId())).thenAnswer(invocation -> lineItemsFor(cycle.getId()));

        int updatedCount = billingCycleService.recalculateLateFees(LocalDate.of(2026, 6, 2));

        assertThat(updatedCount).isEqualTo(1);
        assertThat(cycle.getLateFeeAmountPaise()).isEqualTo(300_00);
        assertThat(cycle.getTotalAmountPaise()).isEqualTo(12_300_00);
        assertThat(savedLineItems)
                .filteredOn(lineItem -> lineItem.getType() == BillingCycleLineItemType.LATE_FEE)
                .singleElement()
                .satisfies(lineItem -> {
                    assertThat(lineItem.getAmountPaise()).isEqualTo(300_00);
                    assertThat(lineItem.isSystemGenerated()).isTrue();
                });

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue()).isInstanceOf(BillingLateFeeAppliedEvent.class);
    }

    private List<BillingCycleLineItem> lineItemsFor(UUID billingCycleId) {
        return savedLineItems.stream()
                .filter(lineItem -> billingCycleId.equals(lineItem.getBillingCycleId()))
                .toList();
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
                LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 31),
                dueDate,
                BillingCollectionTiming.CYCLE_START,
                3);
    }

    private static TenancyResponse monthlyTenancy() {
        return new TenancyResponse(
                TENANCY_ID,
                "TEN-2026-000001",
                TENANT_ID,
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
                false);
    }

    private static UserSummaryResponse tenantSummary() {
        return new UserSummaryResponse(
                TENANT_ID,
                "+919007433360",
                "Test Tenant",
                null,
                UserRole.USER,
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
}
