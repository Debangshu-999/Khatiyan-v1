package com.khatiyan.d_modules.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.d_modules.billing.api.dto.AdjustBillingLineItemRequest;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleLineItemResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.CreateDiscountRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateExtraChargeRequest;
import com.khatiyan.d_modules.billing.api.dto.DepositAccountResponse;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemStatus;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.billing.model.BillingLineSettlementAction;
import com.khatiyan.d_modules.billing.model.DepositAccountStatus;
import com.khatiyan.d_modules.billing.service.BillingCycleLineItemService;
import com.khatiyan.d_modules.billing.service.BillingCycleService;
import com.khatiyan.d_modules.billing.service.DepositManagerService;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;

@ExtendWith(MockitoExtension.class)
class BillingModuleTest {

    @Mock
    private BillingCycleService billingCycleService;

    @Mock
    private BillingCycleLineItemService billingCycleLineItemService;

    @Mock
    private DepositManagerService depositManagerService;

    private BillingModule billingModule;
    private BillingCycleResponse billingCycleResponse;
    private BillingCycleLineItemResponse lineItemResponse;
    private DepositAccountResponse depositAccountResponse;

    @BeforeEach
    void setUp() {
        billingModule = new BillingModule(
                billingCycleService,
                billingCycleLineItemService,
                depositManagerService);
        billingCycleResponse = billingCycleResponse();
        lineItemResponse = lineItemResponse();
        depositAccountResponse = depositAccountResponse();
    }

    @Test
    void delegatesCycleLifecycleMethodsToBillingCycleService() {
        UUID actorUserId = UUID.randomUUID();
        UUID tenantUserId = UUID.randomUUID();
        UUID tenancyId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        when(billingCycleService.createFirstCycle(actorUserId, tenancyId)).thenReturn(billingCycleResponse);
        when(billingCycleService.getLatestMyCycle(tenantUserId)).thenReturn(billingCycleResponse);
        when(billingCycleService.recordPaymentSuccess(actorUserId, cycleId, 12_000_00))
                .thenReturn(billingCycleResponse);

        assertThat(billingModule.createFirstCycle(actorUserId, tenancyId)).isSameAs(billingCycleResponse);
        assertThat(billingModule.getLatestMyCycle(tenantUserId)).isSameAs(billingCycleResponse);
        assertThat(billingModule.recordPaymentSuccess(actorUserId, cycleId, 12_000_00)).isSameAs(billingCycleResponse);

        verify(billingCycleService).createFirstCycle(actorUserId, tenancyId);
        verify(billingCycleService).getLatestMyCycle(tenantUserId);
        verify(billingCycleService).recordPaymentSuccess(actorUserId, cycleId, 12_000_00);
    }

    @Test
    void delegatesLineItemMethodsToLineItemService() {
        UUID actorUserId = UUID.randomUUID();
        UUID tenancyId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID lineItemId = UUID.randomUUID();
        List<CreateExtraChargeRequest> extraCharges = List.of(
                new CreateExtraChargeRequest("Damage", "Window repair", 800_00, false));
        CreateDiscountRequest discountRequest = new CreateDiscountRequest("Goodwill", "Owner discount", 500_00);
        AdjustBillingLineItemRequest adjustRequest = new AdjustBillingLineItemRequest(700_00L);
        when(billingCycleLineItemService.addExtraChargeForTenancy(actorUserId, tenancyId, extraCharges))
                .thenReturn(billingCycleResponse);
        when(billingCycleLineItemService.addDiscount(actorUserId, cycleId, discountRequest))
                .thenReturn(billingCycleResponse);
        when(billingCycleLineItemService.adjustPendingLineItem(actorUserId, tenancyId, lineItemId, adjustRequest))
                .thenReturn(lineItemResponse);

        assertThat(billingModule.addExtraChargeForTenancy(actorUserId, tenancyId, extraCharges))
                .isSameAs(billingCycleResponse);
        assertThat(billingModule.addDiscount(actorUserId, cycleId, discountRequest)).isSameAs(billingCycleResponse);
        assertThat(billingModule.adjustPendingLineItem(actorUserId, tenancyId, lineItemId, adjustRequest))
                .isSameAs(lineItemResponse);

        verify(billingCycleLineItemService).addExtraChargeForTenancy(actorUserId, tenancyId, extraCharges);
        verify(billingCycleLineItemService).addDiscount(actorUserId, cycleId, discountRequest);
        verify(billingCycleLineItemService).adjustPendingLineItem(actorUserId, tenancyId, lineItemId, adjustRequest);
    }

    @Test
    void delegatesDepositMethodsToDepositManagerService() {
        UUID actorUserId = UUID.randomUUID();
        UUID tenantUserId = UUID.randomUUID();
        UUID tenancyId = UUID.randomUUID();
        when(depositManagerService.getMyDepositAccountForTenancy(tenantUserId, tenancyId))
                .thenReturn(depositAccountResponse);
        when(depositManagerService.getForManagedTenancy(actorUserId, tenancyId))
                .thenReturn(depositAccountResponse);

        assertThat(billingModule.getMyDepositAccountForTenancy(tenantUserId, tenancyId))
                .isSameAs(depositAccountResponse);
        assertThat(billingModule.getManagedDepositAccount(actorUserId, tenancyId))
                .isSameAs(depositAccountResponse);
        billingModule.settleDepositForExecutedExit(actorUserId, tenancyId);

        verify(depositManagerService).getMyDepositAccountForTenancy(tenantUserId, tenancyId);
        verify(depositManagerService).getForManagedTenancy(actorUserId, tenancyId);
        verify(depositManagerService).settleForExecutedExit(actorUserId, tenancyId);
    }

    private static BillingCycleResponse billingCycleResponse() {
        UUID cycleId = UUID.randomUUID();
        UUID tenancyId = UUID.randomUUID();
        UUID tenantUserId = UUID.randomUUID();
        UUID propertyId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();

        return new BillingCycleResponse(
                cycleId,
                "BIL-2026-000001",
                tenancyId,
                tenantUserId,
                "Test Tenant",
                propertyId,
                roomId,
                TenancyBillingType.MONTHLY,
                1,
                java.time.LocalDate.of(2026, 6, 1),
                java.time.LocalDate.of(2026, 6, 30),
                java.time.LocalDate.of(2026, 6, 4),
                BillingCollectionTiming.CYCLE_START,
                3,
                12_000_00,
                0,
                0,
                0,
                12_000_00,
                BillingCycleStatus.UNPAID,
                null,
                null,
                null,
                List.of());
    }

    private static BillingCycleLineItemResponse lineItemResponse() {
        UUID lineItemId = UUID.randomUUID();
        UUID tenancyId = UUID.randomUUID();
        UUID tenantUserId = UUID.randomUUID();
        UUID propertyId = UUID.randomUUID();

        return new BillingCycleLineItemResponse(
                lineItemId,
                null,
                tenancyId,
                tenantUserId,
                propertyId,
                BillingCycleLineItemType.EXTRA_CHARGE,
                BillingCycleLineItemStatus.PENDING,
                "Damage",
                "Window repair",
                800_00,
                800_00,
                BillingLineSettlementAction.ADDED_TO_BILL,
                false,
                UUID.randomUUID(),
                null,
                1,
                null,
                null);
    }

    private static DepositAccountResponse depositAccountResponse() {
        return new DepositAccountResponse(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                10_000_00,
                DepositAccountStatus.ACTIVE,
                null,
                null,
                null,
                List.of());
    }
}
