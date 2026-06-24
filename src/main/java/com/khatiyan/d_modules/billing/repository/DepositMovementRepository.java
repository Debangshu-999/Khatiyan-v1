package com.khatiyan.d_modules.billing.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.billing.model.DepositMovement;

/**
 * Repository for immutable deposit ledger movements.
 */
public interface DepositMovementRepository extends JpaRepository<DepositMovement, UUID> {

    /**
     * Lists all movements for one deposit account newest first.
     */
    @Query("""
        SELECT movement
        FROM DepositMovement movement
        WHERE movement.depositAccountId = :depositAccountId
        ORDER BY movement.createdAt DESC
        """)
    List<DepositMovement> findByDepositAccountId(UUID depositAccountId);

    /**
     * Lists movements for multiple deposit accounts newest first per account.
     */
    @Query("""
        SELECT movement
        FROM DepositMovement movement
        WHERE movement.depositAccountId IN :depositAccountIds
        ORDER BY movement.depositAccountId ASC, movement.createdAt DESC
        """)
    List<DepositMovement> findByDepositAccountIds(List<UUID> depositAccountIds);

    /**
     * Lists deposit movements linked to one billing cycle.
     */
    @Query("""
        SELECT movement
        FROM DepositMovement movement
        WHERE movement.billingCycleId = :billingCycleId
        ORDER BY movement.createdAt ASC
        """)
    List<DepositMovement> findByBillingCycleId(UUID billingCycleId);

    /**
     * Loads the deposit movement linked to one billing cycle line item.
     */
    @Query("""
        SELECT movement
        FROM DepositMovement movement
        WHERE movement.billingCycleLineItemId = :billingCycleLineItemId
        """)
    Optional<DepositMovement> findByBillingCycleLineItemId(UUID billingCycleLineItemId);
}
