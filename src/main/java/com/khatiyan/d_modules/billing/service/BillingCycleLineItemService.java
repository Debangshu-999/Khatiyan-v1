package com.khatiyan.d_modules.billing.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.AdjustBillingLineItemRequest;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleLineItemResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.CreateDiscountRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateExtraChargeRequest;
import com.khatiyan.d_modules.billing.event.BillingLineItemNotificationAction;
import com.khatiyan.d_modules.billing.event.BillingLineItemNotificationEvent;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.BillingCycleCategory;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItem;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemStatus;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;
import com.khatiyan.d_modules.billing.repository.BillingCycleLineItemRepository;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Handles editable billing-cycle line items.
 *
 * <p>
 * The billing cycle owns period/status/payment lifecycle. This service owns the
 * tenant-visible breakdown rows such as extra charges, discounts, and manual
 * late-fee adjustments.
 */
@Slf4j
@Service
public class BillingCycleLineItemService {

    private final BillingCycleRepository billingCycleRepository;
    private final BillingCycleLineItemRepository lineItemRepository;
    private final BillingAccessPolicy billingAccessPolicy;
    private final DepositManagerService depositManagerService;
    private final ApplicationEventPublisher eventPublisher;

    public BillingCycleLineItemService(
            BillingCycleRepository billingCycleRepository,
            BillingCycleLineItemRepository lineItemRepository,
            BillingAccessPolicy billingAccessPolicy,
            DepositManagerService depositManagerService,
            ApplicationEventPublisher eventPublisher) {
        this.billingCycleRepository = billingCycleRepository;
        this.lineItemRepository = lineItemRepository;
        this.billingAccessPolicy = billingAccessPolicy;
        this.depositManagerService = depositManagerService;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Lists all line items for a managed tenancy, including pending rows waiting
     * for the upcoming billing cycle.
     */
    @Transactional(readOnly = true)
    public List<BillingCycleLineItemResponse> listManagedTenancyLineItems(UUID actorUserId, UUID tenancyId) {
        BillingCycle cycle = getLatestManagedCycle(actorUserId, tenancyId);
        billingAccessPolicy.ensureCanViewBilling(actorUserId, cycle.getPropertyId());

        return lineItemRepository.findByTenancyId(tenancyId)
                .stream()
                .map(lineItem -> BillingCycleLineItemResponse.from(lineItem))
                .toList();
    }

    /**
     * Lists all line items visible to the tenant for one of their tenancies.
     */
    @Transactional(readOnly = true)
    public List<BillingCycleLineItemResponse> listMyTenancyLineItems(UUID tenantUserId, UUID tenancyId) {
        return lineItemRepository.findByTenancyIdForTenant(tenancyId, tenantUserId)
                .stream()
                .map(lineItem -> BillingCycleLineItemResponse.from(lineItem))
                .toList();
    }

    /**
     * Adds one or more extra charge lines using a tenancy as the owner-facing
     * billing context.
     *
     * <p>
     * The latest cycle is only used to identify the tenancy, property, and
     * tenant. Newly created owner charges are pending rows and are picked up by
     * the next generated cycle.
     */
    @Transactional
    public BillingCycleResponse addExtraChargeForTenancy(
            UUID actorUserId,
            UUID tenancyId,
            List<CreateExtraChargeRequest> requests) {
        BillingCycle cycle = getLatestManagedCycle(actorUserId, tenancyId);

        if (requests == null || requests.isEmpty()) {
            throw new ValidationException("At least one extra charge is required");
        }

        ensureCycleStillEditable(cycle);

        int displayOrder = nextDisplayOrder(cycle.getId());

        for (CreateExtraChargeRequest request : requests) {
            BillingCycleLineItem lineItem = createExtraChargeLineItem(
                    cycle,
                    actorUserId,
                    request,
                    displayOrder);

            lineItemRepository.save(lineItem);
            publishLineItemEvent(lineItem, BillingLineItemNotificationAction.CREATED);
            displayOrder++;
        }

        // These are live lines now rather than a queue for the next cycle, so
        // the cycle's totals have to move with them.
        calculateCycle(cycle);

        log.info(
                "Billing extra charges added tenancyId={} billingCycleId={} actorUserId={} count={}",
                tenancyId,
                cycle.getId(),
                actorUserId,
                requests.size());

        return toResponse(cycle);
    }

    /**
     * Adds a discount using a tenancy as the owner-facing billing context.
     */
    @Transactional
    public BillingCycleResponse addDiscountForTenancy(
            UUID actorUserId,
            UUID tenancyId,
            CreateDiscountRequest request) {
        BillingCycle cycle = getLatestManagedCycle(actorUserId, tenancyId);
        ensureCycleStillEditable(cycle);

        long discountAmountPaise = computeDiscountAmount(cycle.getTotalAmountPaise(), request.discountPercent());
        BillingCycleLineItem lineItem = BillingCycleLineItem.discount(
                cycle,
                request.label().trim(),
                cleanDescription(request.description()),
                discountAmountPaise,
                actorUserId,
                nextDisplayOrder(cycle.getId()));

        lineItemRepository.save(lineItem);
        calculateCycle(cycle);
        publishLineItemEvent(lineItem, BillingLineItemNotificationAction.CREATED);

        log.info(
                "Billing discount added tenancyId={} billingCycleId={} lineItemId={} actorUserId={} percent={} amount={}",
                tenancyId,
                cycle.getId(),
                lineItem.getId(),
                actorUserId,
                request.discountPercent(),
                discountAmountPaise);

        return toResponse(cycle);
    }

    /**
     * Compatibility path for older cycle-scoped callers.
     */
    @Transactional
    public BillingCycleResponse addExtraCharge(
            UUID actorUserId,
            UUID billingCycleId,
            List<CreateExtraChargeRequest> requests) {
        BillingCycle cycle = getManagedCycle(actorUserId, billingCycleId);
        return addExtraChargeForTenancy(actorUserId, cycle.getTenancyId(), requests);
    }

    /**
     * Compatibility path for older cycle-scoped callers.
     */
    @Transactional
    public BillingCycleResponse addDiscount(
            UUID actorUserId,
            UUID billingCycleId,
            CreateDiscountRequest request) {
        BillingCycle cycle = getManagedCycle(actorUserId, billingCycleId);
        return addDiscountForTenancy(actorUserId, cycle.getTenancyId(), request);
    }

    /**
     * Replaces an editable line item amount.
     */
    @Transactional
    public BillingCycleResponse adjustLineItem(
            UUID actorUserId,
            UUID billingCycleId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        BillingCycle cycle = getManagedCycle(actorUserId, billingCycleId);
        BillingCycleLineItem lineItem = getLineItem(cycle.getId(), lineItemId);

        ensureLineEditableForCurrentDate(cycle, lineItem);
        lineItem.adjust(requiredAmount(request), actorUserId);
        syncDepositMovementAfterLineChange(actorUserId, cycle, lineItem);

        calculateCycle(cycle);
        publishLineItemEvent(lineItem, BillingLineItemNotificationAction.ADJUSTED);

        log.info(
                "Billing line adjusted billingCycleId={} lineItemId={} actorUserId={} amount={}",
                billingCycleId,
                lineItemId,
                actorUserId,
                request.amountPaise());

        return toResponse(cycle);
    }

    /**
     * Clears an editable line item by making its amount zero.
     */
    @Transactional
    public BillingCycleResponse clearLineItem(UUID actorUserId, UUID billingCycleId, UUID lineItemId) {
        BillingCycle cycle = getManagedCycle(actorUserId, billingCycleId);
        BillingCycleLineItem lineItem = getLineItem(cycle.getId(), lineItemId);

        ensureLineEditableForCurrentDate(cycle, lineItem);
        depositManagerService.clearBillingLineMovement(actorUserId, cycle.getTenancyId(), lineItem.getId());
        lineItem.clear(actorUserId);

        calculateCycle(cycle);
        publishLineItemEvent(lineItem, BillingLineItemNotificationAction.CLEARED);

        log.info(
                "Billing line cleared billingCycleId={} lineItemId={} actorUserId={}",
                billingCycleId,
                lineItemId,
                actorUserId);

        return toResponse(cycle);
    }

    /**
     * Changes an editable charge line so it is deducted from deposit instead of
     * being payable in the cycle.
     */
    @Transactional
    public BillingCycleResponse adjustLineItemFromDeposit(
            UUID actorUserId,
            UUID billingCycleId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        BillingCycle cycle = getManagedCycle(actorUserId, billingCycleId);
        BillingCycleLineItem lineItem = getLineItem(cycle.getId(), lineItemId);

        ensureLineEditableForCurrentDate(cycle, lineItem);

        lineItem.adjustFromDeposit(request.amountPaise(), actorUserId);
        depositManagerService.upsertBillingLineDeduction(
                actorUserId,
                cycle.getTenancyId(),
                cycle.getId(),
                lineItem.getId(),
                lineItem.getSettlementAmountPaise(),
                lineItem.getLabel());
        calculateCycle(cycle);
        publishLineItemEvent(lineItem, BillingLineItemNotificationAction.MOVED_TO_DEPOSIT);

        log.info(
                "Billing line adjusted from deposit billingCycleId={} lineItemId={} actorUserId={} amount={}",
                billingCycleId,
                lineItemId,
                actorUserId,
                request.amountPaise());

        return toResponse(cycle);
    }

    /**
     * Changes an editable charge line so it is payable in the cycle instead of
     * being deducted from deposit.
     */
    @Transactional
    public BillingCycleResponse adjustLineItemToBill(
            UUID actorUserId,
            UUID billingCycleId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        BillingCycle cycle = getManagedCycle(actorUserId, billingCycleId);
        BillingCycleLineItem lineItem = getLineItem(cycle.getId(), lineItemId);

        ensureLineEditableForCurrentDate(cycle, lineItem);

        lineItem.adjustToBill(request.amountPaise(), actorUserId);
        depositManagerService.clearBillingLineMovement(actorUserId, cycle.getTenancyId(), lineItem.getId());
        calculateCycle(cycle);
        publishLineItemEvent(lineItem, BillingLineItemNotificationAction.MOVED_TO_BILL);

        log.info(
                "Billing line adjusted to bill billingCycleId={} lineItemId={} actorUserId={} amount={}",
                billingCycleId,
                lineItemId,
                actorUserId,
                request.amountPaise());

        return toResponse(cycle);
    }

    /**
     * Replaces a pending line amount before it is attached to the next cycle.
     */
    @Transactional
    public BillingCycleLineItemResponse adjustPendingLineItem(
            UUID actorUserId,
            UUID tenancyId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        getLatestManagedCycle(actorUserId, tenancyId);
        BillingCycleLineItem lineItem = getPendingLineItem(tenancyId, lineItemId);

        lineItem.adjust(requiredAmount(request), actorUserId);
        publishLineItemEvent(lineItem, BillingLineItemNotificationAction.ADJUSTED);

        log.info(
                "Pending billing line adjusted tenancyId={} lineItemId={} actorUserId={} amount={}",
                tenancyId,
                lineItemId,
                actorUserId,
                request.amountPaise());

        return BillingCycleLineItemResponse.from(lineItem);
    }

    /**
     * Clears a pending line amount before it is attached to the next cycle.
     */
    @Transactional
    public BillingCycleLineItemResponse clearPendingLineItem(
            UUID actorUserId,
            UUID tenancyId,
            UUID lineItemId) {
        getLatestManagedCycle(actorUserId, tenancyId);
        BillingCycleLineItem lineItem = getPendingLineItem(tenancyId, lineItemId);

        lineItem.clear(actorUserId);
        publishLineItemEvent(lineItem, BillingLineItemNotificationAction.CLEARED);

        log.info(
                "Pending billing line cleared tenancyId={} lineItemId={} actorUserId={}",
                tenancyId,
                lineItemId,
                actorUserId);

        return BillingCycleLineItemResponse.from(lineItem);
    }

    /**
     * Marks a pending charge as a future deposit deduction.
     */
    @Transactional
    public BillingCycleLineItemResponse adjustPendingLineItemFromDeposit(
            UUID actorUserId,
            UUID tenancyId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        getLatestManagedCycle(actorUserId, tenancyId);
        BillingCycleLineItem lineItem = getPendingLineItem(tenancyId, lineItemId);

        lineItem.adjustFromDeposit(request.amountPaise(), actorUserId);
        publishLineItemEvent(lineItem, BillingLineItemNotificationAction.MOVED_TO_DEPOSIT);

        log.info(
                "Pending billing line adjusted from deposit tenancyId={} lineItemId={} actorUserId={} amount={}",
                tenancyId,
                lineItemId,
                actorUserId,
                request.amountPaise());

        return BillingCycleLineItemResponse.from(lineItem);
    }

    /**
     * Marks a pending charge as payable in the future cycle.
     */
    @Transactional
    public BillingCycleLineItemResponse adjustPendingLineItemToBill(
            UUID actorUserId,
            UUID tenancyId,
            UUID lineItemId,
            AdjustBillingLineItemRequest request) {
        getLatestManagedCycle(actorUserId, tenancyId);
        BillingCycleLineItem lineItem = getPendingLineItem(tenancyId, lineItemId);

        lineItem.adjustToBill(request.amountPaise(), actorUserId);
        publishLineItemEvent(lineItem, BillingLineItemNotificationAction.MOVED_TO_BILL);

        log.info(
                "Pending billing line adjusted to bill tenancyId={} lineItemId={} actorUserId={} amount={}",
                tenancyId,
                lineItemId,
                actorUserId,
                request.amountPaise());

        return BillingCycleLineItemResponse.from(lineItem);
    }

    /**
     * Converts one extra-charge request into the correct billing line type.
     */
    private BillingCycleLineItem createExtraChargeLineItem(
            BillingCycle cycle,
            UUID actorUserId,
            CreateExtraChargeRequest request,
            int displayOrder) {
        if (request.adjustFromDeposit()) {
            return BillingCycleLineItem.extraChargeAdjustedFromDeposit(
                    cycle,
                    request.label().trim(),
                    cleanDescription(request.description()),
                    request.amountPaise(),
                    actorUserId,
                    displayOrder);
        }

        return BillingCycleLineItem.extraChargeAddedToBill(
                cycle,
                request.label().trim(),
                cleanDescription(request.description()),
                request.amountPaise(),
                actorUserId,
                displayOrder);
    }

    /**
     * Converts a discount percentage into a money amount against the cycle's
     * current total, rounded to the nearest paise and capped at the total so a
     * discount can never exceed the payable amount.
     */
    private long computeDiscountAmount(long cycleTotalPaise, BigDecimal discountPercent) {
        if (discountPercent == null || discountPercent.signum() <= 0) {
            throw new ValidationException("Discount percent must be positive");
        }

        long amountPaise = BigDecimal.valueOf(cycleTotalPaise)
                .multiply(discountPercent)
                .divide(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();

        if (amountPaise <= 0) {
            throw new ValidationException("Discount amount must be greater than zero");
        }

        return Math.min(amountPaise, cycleTotalPaise);
    }

    /**
     * Loads a billing cycle and verifies the actor can manage its property.
     */
    private BillingCycle getManagedCycle(UUID actorUserId, UUID billingCycleId) {
        BillingCycle cycle = billingCycleRepository.findById(billingCycleId)
                .orElseThrow(() -> new NotFoundException("BillingCycle", billingCycleId));

        billingAccessPolicy.ensureCanManageBilling(actorUserId, cycle.getPropertyId());
        return cycle;
    }

    /**
     * Loads the latest cycle for a tenancy and verifies the actor can manage the
     * cycle property.
     */
    private BillingCycle getLatestManagedCycle(UUID actorUserId, UUID tenancyId) {
        BillingCycle cycle = billingCycleRepository.findLatestByTenancyId(tenancyId, PageRequest.of(0, 1))
                .stream()
                .findFirst()
                .orElseThrow(() -> new NotFoundException("BillingCycle for tenancy", tenancyId));

        billingAccessPolicy.ensureCanManageBilling(actorUserId, cycle.getPropertyId());
        return cycle;
    }

    /**
     * Loads a line item only when it belongs to the requested billing cycle.
     */
    private BillingCycleLineItem getLineItem(UUID billingCycleId, UUID lineItemId) {
        return lineItemRepository.findByIdAndBillingCycleId(lineItemId, billingCycleId)
                .orElseThrow(() -> new NotFoundException("BillingCycleLineItem", lineItemId));
    }

    /**
     * Loads a pending line item for tenancy-scoped editing.
     */
    private BillingCycleLineItem getPendingLineItem(UUID tenancyId, UUID lineItemId) {
        return lineItemRepository.findByIdAndTenancyIdAndStatus(
                lineItemId,
                tenancyId,
                BillingCycleLineItemStatus.PENDING)
                .orElseThrow(() -> new NotFoundException("PendingBillingCycleLineItem", lineItemId));
    }

    /**
     * Builds the API response with the current line-item breakdown.
     */
    private BillingCycleResponse toResponse(BillingCycle cycle) {
        List<BillingCycleLineItemResponse> lineItems = lineItemRepository.findByBillingCycleId(cycle.getId())
                .stream()
                .map(lineItem -> BillingCycleLineItemResponse.from(lineItem))
                .toList();

        return BillingCycleResponse.from(cycle, lineItems);
    }

    /**
     * Returns the next display order for appending a new line item to a cycle.
     */
    private int nextDisplayOrder(UUID billingCycleId) {
        return lineItemRepository.findMaxDisplayOrder(billingCycleId) + 1;
    }

    /**
     * Recomputes the cycle summary amounts from its line-item breakdown.
     */
    private void calculateCycle(BillingCycle cycle) {
        List<BillingCycleLineItem> lineItems = lineItemRepository.findByBillingCycleId(cycle.getId());

        long baseAmount = lineItems.stream()
                .filter(lineItem -> lineItem.contributesToBaseAmount())
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();

        long depositAmount = lineItems.stream()
                .filter(lineItem -> lineItem.contributesToBaseDeposit())
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();

        long extraAmount = lineItems.stream()
                .filter(lineItem -> lineItem.contributesToExtraAmount())
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();

        long lateFeeAmount = lineItems.stream()
                .filter(lineItem -> lineItem.contributesToLateFeeAmount())
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();

        long discountAmount = lineItems.stream()
                .filter(lineItem -> lineItem.contributesToDiscountAmount())
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();

        cycle.recalculateTotals(baseAmount, depositAmount, extraAmount, lateFeeAmount, discountAmount);
    }

    /**
     * Enforces type-specific edit windows for an existing line item.
     */
    private void ensureLineEditableForCurrentDate(BillingCycle cycle, BillingCycleLineItem lineItem) {
        ensureCycleStillEditable(cycle);

        if (lineItem.getType() == BillingCycleLineItemType.LATE_FEE
                && !cycle.isEditableForLateFee(LocalDate.now())) {
            throw new ValidationException("Late fee can be edited only after due date");
        }
    }

    /**
     * The one gate on changing a bill: is it still open?
     *
     * <p>A rent cycle is generated ten days before it goes live, and that window
     * is when it is meant to be edited. The FIRST cycle of a tenancy never gets
     * one — it is created and activated in the same transaction at onboarding —
     * so it stays editable until paid instead. Without that it was the only bill
     * nobody could ever touch, not even to discount it on the day it was raised.
     *
     * <p>Every later cycle keeps the lock, and a charge arising after one goes
     * live belongs on a one-off bill, which has its own path and stays editable
     * until paid.
     */
    private void ensureCycleStillEditable(BillingCycle cycle) {
        if (cycle.isPaid()) {
            throw new ValidationException("Paid billing cycle cannot be edited");
        }

        if (cycle.isCancelled()) {
            throw new ValidationException("Cancelled billing cycle cannot be edited");
        }

        if (cycle.getCategory() == BillingCycleCategory.RENT_CYCLE
                && cycle.isLocked()
                && !cycle.isFirstCycle()) {
            throw new ValidationException(
                    "This bill is already live and can no longer be changed."
                            + " Raise a one-off bill for the charge instead.");
        }
    }

    private long requiredAmount(AdjustBillingLineItemRequest request) {
        if (request.amountPaise() == null) {
            throw new ValidationException("Billing line amount is required");
        }

        return request.amountPaise();
    }

    private void syncDepositMovementAfterLineChange(
            UUID actorUserId,
            BillingCycle cycle,
            BillingCycleLineItem lineItem) {
        if (lineItem.getSettlementAmountPaise() > 0
                && lineItem.getAmountPaise() == 0) {
            depositManagerService.upsertBillingLineDeduction(
                    actorUserId,
                    cycle.getTenancyId(),
                    cycle.getId(),
                    lineItem.getId(),
                    lineItem.getSettlementAmountPaise(),
                    lineItem.getLabel());
        }
    }

    private String cleanDescription(String description) {
        if (description == null || description.isBlank()) {
            return null;
        }

        return description.trim();
    }

    private void publishLineItemEvent(
            BillingCycleLineItem lineItem,
            BillingLineItemNotificationAction action) {
        eventPublisher.publishEvent(BillingLineItemNotificationEvent.from(lineItem, action));
    }
}
