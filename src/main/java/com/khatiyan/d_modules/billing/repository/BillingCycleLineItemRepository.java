package com.khatiyan.d_modules.billing.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.billing.model.BillingCycleLineItem;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemStatus;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;

/**
 * Repository for editable billing cycle line items.
 */
public interface BillingCycleLineItemRepository extends JpaRepository<BillingCycleLineItem, UUID> {

    /**
     * Loads all line items for a cycle in display order.
     */
    @Query("""
        SELECT lineItem
        FROM BillingCycleLineItem lineItem
        WHERE lineItem.billingCycleId = :billingCycleId
          AND lineItem.status = 'ADDED'
        ORDER BY lineItem.displayOrder ASC
        """)
    List<BillingCycleLineItem> findByBillingCycleId(UUID billingCycleId);

    /**
     * Loads line items for multiple cycles.
     */
    @Query("""
        SELECT lineItem
        FROM BillingCycleLineItem lineItem
        WHERE lineItem.billingCycleId IN :billingCycleIds
          AND lineItem.status = 'ADDED'
        ORDER BY lineItem.billingCycleId ASC, lineItem.displayOrder ASC
        """)
    List<BillingCycleLineItem> findByBillingCycleIds(List<UUID> billingCycleIds);

    /**
     * Loads all line items for one tenancy, including pending rows that are not
     * attached to a billing cycle yet.
     */
    @Query("""
        SELECT lineItem
        FROM BillingCycleLineItem lineItem
        WHERE lineItem.tenancyId = :tenancyId
        ORDER BY lineItem.createdAt DESC, lineItem.displayOrder ASC
        """)
    List<BillingCycleLineItem> findByTenancyId(UUID tenancyId);

    /**
     * Loads all line items for one tenant-owned tenancy.
     */
    @Query("""
        SELECT lineItem
        FROM BillingCycleLineItem lineItem
        WHERE lineItem.tenancyId = :tenancyId
          AND lineItem.tenantUserId = :tenantUserId
        ORDER BY lineItem.createdAt DESC, lineItem.displayOrder ASC
        """)
    List<BillingCycleLineItem> findByTenancyIdForTenant(UUID tenancyId, UUID tenantUserId);

    /**
     * Loads one line item only if it belongs to the given cycle.
     */
    @Query("""
        SELECT lineItem
        FROM BillingCycleLineItem lineItem
        WHERE lineItem.id = :lineItemId
          AND lineItem.billingCycleId = :billingCycleId
          AND lineItem.status = 'ADDED'
        """)
    Optional<BillingCycleLineItem> findByIdAndBillingCycleId(UUID lineItemId, UUID billingCycleId);

    /**
     * Loads one pending line item for tenancy-scoped edits before it is attached
     * to a generated cycle.
     */
    @Query("""
        SELECT lineItem
        FROM BillingCycleLineItem lineItem
        WHERE lineItem.id = :lineItemId
          AND lineItem.tenancyId = :tenancyId
          AND lineItem.status = :status
        """)
    Optional<BillingCycleLineItem> findByIdAndTenancyIdAndStatus(
            UUID lineItemId,
            UUID tenancyId,
            BillingCycleLineItemStatus status);

    /**
     * Gives the current max display order for appending a new line item.
     */
    @Query("""
        SELECT COALESCE(MAX(lineItem.displayOrder), 0)
        FROM BillingCycleLineItem lineItem
        WHERE lineItem.billingCycleId = :billingCycleId
          AND lineItem.status = 'ADDED'
        """)
    int findMaxDisplayOrder(UUID billingCycleId);

    /**
     * Finds an existing line item of a specific type for scheduler updates.
     *
     * <p>
     * Used mainly for late fee recalculation so the scheduler updates one line
     * instead of inserting duplicate late-fee lines every day.
     */
    @Query("""
        SELECT lineItem
        FROM BillingCycleLineItem lineItem
        WHERE lineItem.billingCycleId = :billingCycleId
          AND lineItem.type = :type
          AND lineItem.status = 'ADDED'
        ORDER BY lineItem.displayOrder ASC
        """)
    List<BillingCycleLineItem> findByBillingCycleIdAndType(
            UUID billingCycleId,
            BillingCycleLineItemType type);

    /**
     * Loads pending owner-created items that existed before this cycle generation
     * began.
     */
    @Query("""
        SELECT lineItem
        FROM BillingCycleLineItem lineItem
        WHERE lineItem.tenancyId = :tenancyId
          AND lineItem.status = :status
          AND lineItem.createdAt < :generationCutoff
        ORDER BY lineItem.createdAt ASC, lineItem.displayOrder ASC
        """)
    List<BillingCycleLineItem> findPendingByTenancyIdBefore(
            UUID tenancyId,
            BillingCycleLineItemStatus status,
            Instant generationCutoff);
}
