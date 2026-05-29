package com.khatiyan.d_modules.billing;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.billing.api.dto.AdjustBillingLineItemRequest;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleLineItemResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.CreateDepositCorrectionRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateDiscountRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateExtraChargeRequest;
import com.khatiyan.d_modules.billing.api.dto.DepositAccountResponse;
import com.khatiyan.d_modules.billing.service.BillingCycleLineItemService;
import com.khatiyan.d_modules.billing.service.BillingCycleService;
import com.khatiyan.d_modules.billing.service.DepositManagerService;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

/**
 * Public facade for the billing module.
 *
 * <p>
 * Other modules should depend on this facade instead of billing services or
 * repositories directly. Controllers may still use services while the module is
 * being built, but cross-module calls should come through here.
 */
@Component
public class BillingModule {

    private final BillingCycleService billingCycleService;
    private final BillingCycleLineItemService billingCycleLineItemService;
    private final DepositManagerService depositManagerService;

    public BillingModule(
            BillingCycleService billingCycleService,
            BillingCycleLineItemService billingCycleLineItemService,
            DepositManagerService depositManagerService) {
        this.billingCycleService = billingCycleService;
        this.billingCycleLineItemService = billingCycleLineItemService;
        this.depositManagerService = depositManagerService;
    }

    public BillingCycleResponse createFirstCycle(UUID actorUserId, UUID tenancyId) {
        return billingCycleService.createFirstCycle(actorUserId, tenancyId);
    }

    public List<BillingCycleResponse> listMyCycles(UUID tenantUserId) {
        return billingCycleService.listMyCycles(tenantUserId);
    }

    public List<BillingCycleResponse> listMyTenancyCycles(UUID tenantUserId, UUID tenancyId) {
        return billingCycleService.listMyTenancyCycles(tenantUserId, tenancyId);
    }

    public List<BillingCycleResponse> listManagedTenancyCycles(UUID actorUserId, UUID tenancyId) {
        return billingCycleService.listManagedTenancyCycles(actorUserId, tenancyId);
    }

    public List<BillingCycleLineItemResponse> listManagedTenancyLineItems(UUID actorUserId, UUID tenancyId) {
        return billingCycleLineItemService.listManagedTenancyLineItems(actorUserId, tenancyId);
    }

    public List<BillingCycleLineItemResponse> listMyTenancyLineItems(UUID tenantUserId, UUID tenancyId) {
        return billingCycleLineItemService.listMyTenancyLineItems(tenantUserId, tenancyId);
    }

    public BillingCycleResponse getLatestManagedTenancyCycle(UUID actorUserId, UUID tenancyId) {
        return billingCycleService.getLatestManagedTenancyCycle(actorUserId, tenancyId);
    }

    public BillingCycleResponse getLatestMyCycle(UUID tenantUserId) {
        return billingCycleService.getLatestMyCycle(tenantUserId);
    }

    public BillingCycleResponse getMyCycle(UUID tenantUserId, UUID billingCycleId) {
        return billingCycleService.getMyCycle(tenantUserId, billingCycleId);
    }

    public BillingCycleResponse refreshMyCycle(UUID tenantUserId, UUID billingCycleId) {
        return billingCycleService.refreshMyCycle(tenantUserId, billingCycleId);
    }

    public BillingCycleResponse refreshManagedCycle(UUID actorUserId, UUID billingCycleId) {
        return billingCycleService.refreshManagedCycle(actorUserId, billingCycleId);
    }

    public BillingCycleResponse addExtraCharge(
            UUID actorUserId,
            UUID billingCycleId,
            List<CreateExtraChargeRequest> requests) {
        return billingCycleLineItemService.addExtraCharge(actorUserId, billingCycleId, requests);
    }

    public BillingCycleResponse addExtraChargeForTenancy(
            UUID actorUserId,
            UUID tenancyId,
            List<CreateExtraChargeRequest> requests) {
        return billingCycleLineItemService.addExtraChargeForTenancy(actorUserId, tenancyId, requests);
    }

    public BillingCycleResponse addDiscount(
            UUID actorUserId,
            UUID billingCycleId,
            CreateDiscountRequest request) {
        return billingCycleLineItemService.addDiscount(actorUserId, billingCycleId, request);
    }

    public BillingCycleResponse addDiscountForTenancy(
            UUID actorUserId,
            UUID tenancyId,
            CreateDiscountRequest request) {
        return billingCycleLineItemService.addDiscountForTenancy(actorUserId, tenancyId, request);
    }

    public BillingCycleResponse adjustLineItem(
            UUID actorUserId,
            UUID billingCycleId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        return billingCycleLineItemService.adjustLineItem(actorUserId, billingCycleId, lineItemId, request);
    }

    public BillingCycleResponse clearLineItem(UUID actorUserId, UUID billingCycleId, UUID lineItemId) {
        return billingCycleLineItemService.clearLineItem(actorUserId, billingCycleId, lineItemId);
    }

    public BillingCycleResponse adjustLineItemFromDeposit(
            UUID actorUserId,
            UUID billingCycleId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        return billingCycleLineItemService.adjustLineItemFromDeposit(actorUserId, billingCycleId, lineItemId, request);
    }

    public BillingCycleResponse adjustLineItemToBill(
            UUID actorUserId,
            UUID billingCycleId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        return billingCycleLineItemService.adjustLineItemToBill(actorUserId, billingCycleId, lineItemId, request);
    }

    public BillingCycleLineItemResponse adjustPendingLineItem(
            UUID actorUserId,
            UUID tenancyId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        return billingCycleLineItemService.adjustPendingLineItem(actorUserId, tenancyId, lineItemId, request);
    }

    public BillingCycleLineItemResponse clearPendingLineItem(
            UUID actorUserId,
            UUID tenancyId,
            UUID lineItemId) {
        return billingCycleLineItemService.clearPendingLineItem(actorUserId, tenancyId, lineItemId);
    }

    public BillingCycleLineItemResponse adjustPendingLineItemFromDeposit(
            UUID actorUserId,
            UUID tenancyId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        return billingCycleLineItemService.adjustPendingLineItemFromDeposit(
                actorUserId,
                tenancyId,
                lineItemId,
                request);
    }

    public BillingCycleLineItemResponse adjustPendingLineItemToBill(
            UUID actorUserId,
            UUID tenancyId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        return billingCycleLineItemService.adjustPendingLineItemToBill(actorUserId, tenancyId, lineItemId, request);
    }

    public DepositAccountResponse getMyActiveDepositAccount(UUID tenantUserId) {
        return depositManagerService.getMyActiveDepositAccount(tenantUserId);
    }

    public DepositAccountResponse getMyDepositAccountForTenancy(UUID tenantUserId, UUID tenancyId) {
        return depositManagerService.getMyDepositAccountForTenancy(tenantUserId, tenancyId);
    }

    public DepositAccountResponse getManagedDepositAccount(UUID actorUserId, UUID tenancyId) {
        return depositManagerService.getForManagedTenancy(actorUserId, tenancyId);
    }

    public DepositAccountResponse addDepositCorrection(
            UUID actorUserId,
            UUID tenancyId,
            CreateDepositCorrectionRequest request) {
        return depositManagerService.addCorrection(actorUserId, tenancyId, request);
    }

    public DepositAccountResponse deductDepositCorrection(
            UUID actorUserId,
            UUID tenancyId,
            CreateDepositCorrectionRequest request) {
        return depositManagerService.deductCorrection(actorUserId, tenancyId, request);
    }

    public DepositAccountResponse settleDeposit(UUID actorUserId, UUID tenancyId, String reason) {
        return depositManagerService.settleDeposit(actorUserId, tenancyId, reason);
    }

    public void settleDepositForExecutedExit(UUID actorUserId, UUID tenancyId) {
        depositManagerService.settleForExecutedExit(actorUserId, tenancyId);
    }

    public BillingCycleResponse recordPaymentSuccess(UUID actorUserId, UUID billingCycleId, long paidAmountPaise) {
        return billingCycleService.recordPaymentSuccess(actorUserId, billingCycleId, paidAmountPaise);
    }

    public BillingCycleResponse recordMyPaymentSuccess(UUID tenantUserId, UUID billingCycleId, long paidAmountPaise) {
        return billingCycleService.recordMyPaymentSuccess(tenantUserId, billingCycleId, paidAmountPaise);
    }

    public BillingCycleResponse preparePrematureExitBilling(UUID actorUserId, UUID tenancyId) {
        BillingCycleResponse cycle = billingCycleService.getLatestManagedTenancyCycle(actorUserId, tenancyId);

        return cycle;
    }

    public BillingCycleResponse applyExitApprovalTotal(
            UUID actorUserId,
            UUID tenancyId,
            Long approvedTotalAmountPaise) {
        return billingCycleService.applyExitApprovalTotal(actorUserId, tenancyId, approvedTotalAmountPaise);
    }

    public DepositAccountResponse deductDepositForExitApproval(
            UUID actorUserId,
            UUID tenancyId,
            Long amountPaise) {
        return depositManagerService.deductForExitApproval(actorUserId, tenancyId, amountPaise);
    }

    public BillingCycleResponse ensureLatestCyclePaidForExit(UUID actorUserId, UUID tenancyId) {
        return billingCycleService.ensureLatestCyclePaidForExit(actorUserId, tenancyId);
    }

    public BillingCycleResponse initializeStartedTenancy(UUID actorUserId, TenancyResponse tenancy) {
        return billingCycleService.createFirstCycle(actorUserId, tenancy.id());
    }
}
