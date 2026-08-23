package com.khatiyan.d_modules.billing.repository;

import java.time.Instant;
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
     * Loads one cycle by its user-facing reference code.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.referenceCode = :referenceCode
        """)
    Optional<BillingCycle> findByReferenceCode(String referenceCode);

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
        ORDER BY cycle.periodStartDate DESC, cycle.cycleNumber DESC NULLS LAST
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
     * Finds the latest RENT cycle for one tenancy — one-off bills (e.g. penalties)
     * are excluded so they never disrupt "current bill" / scheduler logic.
     *
     * <p>
     * Call with PageRequest.of(0, 1).
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.tenancyId = :tenancyId
          AND cycle.category = com.khatiyan.d_modules.billing.model.BillingCycleCategory.RENT_CYCLE
        ORDER BY cycle.cycleNumber DESC
        """)
    List<BillingCycle> findLatestByTenancyId(UUID tenancyId, Pageable pageable);

    /**
     * True if the tenancy has any bill (rent cycle or one-off) still owed. Used to
     * gate tenancy exit — the penalty one-off bill must be paid too.
     */
    boolean existsByTenancyIdAndStatusIn(UUID tenancyId, java.util.Collection<BillingCycleStatus> statuses);

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
          AND cycle.periodEndDate >= :today
        ORDER BY cycle.rentDueDate ASC
        """)
    List<BillingCycle> findPastDueCycles(BillingCycleStatus status, LocalDate today);

    /** Cycles whose payment window has arrived and which must now freeze. */
    List<BillingCycle> findByStatusAndPeriodStartDateLessThanEqual(BillingCycleStatus status, LocalDate periodStartDate);

    /**
     * Finds unpaid/overdue cycles for which late fee recalculation may be needed.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.status IN :statuses
          AND cycle.rentDueDate < :today
          AND cycle.periodEndDate >= :today
        ORDER BY cycle.rentDueDate ASC
        """)
    List<BillingCycle> findCyclesEligibleForLateFee(List<BillingCycleStatus> statuses, LocalDate today);

    /**
     * Finds open cycles whose due date is today for reminder generation.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.status IN :statuses
          AND cycle.rentDueDate = :today
        ORDER BY cycle.rentDueDate ASC, cycle.createdAt ASC
        """)
    List<BillingCycle> findCyclesDueToday(List<BillingCycleStatus> statuses, LocalDate today);

    /**
     * Finds open cycles whose due dates fall inside the reminder look-ahead
     * window.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.status IN :statuses
          AND cycle.rentDueDate BETWEEN :startDate AND :endDate
        ORDER BY cycle.rentDueDate ASC, cycle.createdAt ASC
        """)
    List<BillingCycle> findCyclesDueBetween(
            List<BillingCycleStatus> statuses,
            LocalDate startDate,
            LocalDate endDate);

    /**
     * Finds overdue cycles for reminder generation.
     */
    @Query("""
        SELECT cycle
        FROM BillingCycle cycle
        WHERE cycle.status = com.khatiyan.d_modules.billing.model.BillingCycleStatus.OVERDUE
        ORDER BY cycle.rentDueDate ASC, cycle.createdAt ASC
        """)
    List<BillingCycle> findOverdueCycles();

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

    // ----- Owner dashboard (action center) aggregates -----

    /**
     * Sum of cycle totals for a property whose period starts within a
     * half-open date range. Used for "billed this month".
     *
     * <p>UPCOMING is excluded because such a cycle has not been charged to
     * anyone yet — the owner can still change it — and CANCELLED because it
     * never will be. Counting either would report money as billed that nobody
     * owes.
     */
    @Query("""
        SELECT COALESCE(SUM(cycle.totalAmountPaise), 0)
        FROM BillingCycle cycle
        WHERE cycle.propertyId = :propertyId
          AND cycle.periodStartDate >= :fromDate
          AND cycle.periodStartDate < :toDate
          AND cycle.status <> com.khatiyan.d_modules.billing.model.BillingCycleStatus.CANCELLED
        """)
    long sumTotalForPropertyByPeriodStartBetween(UUID propertyId, LocalDate fromDate, LocalDate toDate);

    /**
     * Sum of cycle totals for a property in a given status whose payment
     * landed within a half-open instant range. Used for "collected this
     * month" and the value of "payments made today".
     */
    @Query("""
        SELECT COALESCE(SUM(cycle.totalAmountPaise), 0)
        FROM BillingCycle cycle
        WHERE cycle.propertyId = :propertyId
          AND cycle.status = :status
          AND cycle.paidAt >= :fromInstant
          AND cycle.paidAt < :toInstant
        """)
    long sumTotalForPropertyByStatusAndPaidAtBetween(
            UUID propertyId,
            BillingCycleStatus status,
            Instant fromInstant,
            Instant toInstant);

    /**
     * Count of cycles for a property in a given status paid within a
     * half-open instant range. Used for "payments made today".
     */
    @Query("""
        SELECT COUNT(cycle)
        FROM BillingCycle cycle
        WHERE cycle.propertyId = :propertyId
          AND cycle.status = :status
          AND cycle.paidAt >= :fromInstant
          AND cycle.paidAt < :toInstant
        """)
    long countForPropertyByStatusAndPaidAtBetween(
            UUID propertyId,
            BillingCycleStatus status,
            Instant fromInstant,
            Instant toInstant);

    /**
     * Sum of cycle totals for a property across a set of statuses. Used for
     * "pending" (UNPAID + OVERDUE).
     */
    @Query("""
        SELECT COALESCE(SUM(cycle.totalAmountPaise), 0)
        FROM BillingCycle cycle
        WHERE cycle.propertyId = :propertyId
          AND cycle.status IN :statuses
        """)
    long sumTotalForPropertyByStatusIn(UUID propertyId, List<BillingCycleStatus> statuses);

    /**
     * Sum of cycle totals for a property in a single status. Used for the
     * overdue amount.
     */
    @Query("""
        SELECT COALESCE(SUM(cycle.totalAmountPaise), 0)
        FROM BillingCycle cycle
        WHERE cycle.propertyId = :propertyId
          AND cycle.status = :status
        """)
    long sumTotalForPropertyByStatus(UUID propertyId, BillingCycleStatus status);

    /**
     * Count of cycles for a property in a single status. Used for the overdue
     * count.
     */
    @Query("""
        SELECT COUNT(cycle)
        FROM BillingCycle cycle
        WHERE cycle.propertyId = :propertyId
          AND cycle.status = :status
        """)
    long countForPropertyByStatus(UUID propertyId, BillingCycleStatus status);

    @Query("""
        SELECT COUNT(cycle)
        FROM BillingCycle cycle
        WHERE cycle.propertyId = :propertyId
         AND cycle.status IN :statuses
        """)
    long countForPropertyByStatusIn(UUID propertyId, List<BillingCycleStatus> statuses);

    /** Discounts given on bills that stand — cancelled bills do not count. */
    @Query("""
        SELECT COALESCE(SUM(cycle.discountAmountPaise), 0)
        FROM BillingCycle cycle
        WHERE cycle.propertyId = :propertyId
          AND cycle.status <> com.khatiyan.d_modules.billing.model.BillingCycleStatus.CANCELLED
        """)
    long sumDiscountForProperty(UUID propertyId);
}
