package com.khatiyan.d_modules.billing.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;

/**
 * Repository for live billing cycles.
 *
 * <p>
 * Billing cycles are the editable payable workspace before payment succeeds.
 */
public interface BillingCycleRepository extends JpaRepository<BillingCycle, UUID> {

    /**
     * Loads one cycle for tenant self-view.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.id = :cycleId
          AND cycle.tenantUserId = :tenantUserId
        """)
    Optional<BillingCycle> findByIdForTenant(UUID cycleId, UUID tenantUserId);

    /**
     * Lists tenant billing cycles newest first.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.tenantUserId = :tenantUserId
        ORDER BY cycle.periodStartDate DESC, cycle.cycleNumber DESC
        """)
    List<BillingCycle> findByTenantUserId(UUID tenantUserId);

    /**
     * Lists all cycles for one tenancy, newest first.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.tenancyId = :tenancyId
        ORDER BY cycle.cycleNumber DESC
        """)
    List<BillingCycle> findByTenancyId(UUID tenancyId);

    /**
     * Lists cycles for a property, newest first.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.propertyId = :propertyId
        ORDER BY cycle.periodStartDate DESC, cycle.cycleNumber DESC
        """)
    List<BillingCycle> findByPropertyId(UUID propertyId);

    /**
     * Finds the latest cycle for one tenancy.
     *
     * <p>
     * Call with PageRequest.of(0, 1).
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.tenancyId = :tenancyId
        ORDER BY cycle.cycleNumber DESC
        """)
    List<BillingCycle> findLatestByTenancyId(UUID tenancyId, Pageable pageable);

    /**
     * Prevents duplicate cycle generation for the same tenancy cycle number.
     */
    @Query("""
        SELECT COUNT(cycle) > 0
        FROM BillingCycle cycle
        WHERE cycle.tenancyId = :tenancyId
          AND cycle.cycleNumber = :cycleNumber
        """)
    boolean existsByTenancyIdAndCycleNumber(UUID tenancyId, int cycleNumber);

    /**
     * Finds cycles that crossed due date and should become overdue.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.status = :status
          AND cycle.rentDueDate < :today
        ORDER BY cycle.rentDueDate ASC
        """)
    List<BillingCycle> findPastDueCycles(BillingCycleStatus status, LocalDate today);

    /**
     * Finds unpaid/overdue cycles for which late fee recalculation may be needed.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.status IN :statuses
          AND cycle.rentDueDate < :today
        ORDER BY cycle.rentDueDate ASC
        """)
    List<BillingCycle> findCyclesEligibleForLateFee(List<BillingCycleStatus> statuses, LocalDate today);

    /**
     * Finds currently open cycles for a property.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.propertyId = :propertyId
          AND cycle.status IN :statuses
        ORDER BY cycle.rentDueDate ASC
        """)
    List<BillingCycle> findByPropertyIdAndStatuses(UUID propertyId, List<BillingCycleStatus> statuses);
}