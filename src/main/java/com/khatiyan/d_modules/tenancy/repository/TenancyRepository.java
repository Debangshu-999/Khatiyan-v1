package com.khatiyan.d_modules.tenancy.repository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

import jakarta.persistence.LockModeType;

@Repository
public interface TenancyRepository extends JpaRepository<Tenancy, UUID> {

    Optional<Tenancy> findByReferenceCode(String referenceCode);

    /** Locks one tenancy while a scheduled workflow re-validates its state. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT tenancy FROM Tenancy tenancy WHERE tenancy.id = :tenancyId")
    Optional<Tenancy> findByIdForUpdate(UUID tenancyId);

    Optional<Tenancy> findByUserIdAndActiveTrue(UUID userId);

    /** Serialises tenant request creation, including the first request. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT tenancy FROM Tenancy tenancy WHERE tenancy.userId = :userId AND tenancy.active = true")
    Optional<Tenancy> findByUserIdAndActiveTrueForUpdate(UUID userId);

    @Query("""
        SELECT tenancy
        FROM Tenancy tenancy
        WHERE tenancy.userId = :userId
        ORDER BY tenancy.createdAt DESC
        """)
    List<Tenancy> findByUserId(UUID userId);

    @Query("""
        SELECT tenancy
        FROM Tenancy tenancy
        WHERE tenancy.userId = :userId
          AND tenancy.active = true
        ORDER BY tenancy.createdAt DESC
        """)
    List<Tenancy> findActiveByUserId(UUID userId);

    @Query("""
        SELECT tenancy
        FROM Tenancy tenancy
        WHERE tenancy.propertyId = :propertyId
        ORDER BY tenancy.createdAt DESC
        """)
    List<Tenancy> findByPropertyId(UUID propertyId);

    @Query("""
        SELECT tenancy
        FROM Tenancy tenancy
        WHERE tenancy.propertyId = :propertyId
          AND tenancy.active = true
        ORDER BY tenancy.createdAt DESC
    """)
    List<Tenancy> findByPropertyIdAndActiveTrue(UUID propertyId);

    @Query("""
        SELECT tenancy
        FROM Tenancy tenancy
        WHERE tenancy.propertyId = :propertyId
          AND tenancy.active = false
        ORDER BY tenancy.createdAt DESC
    """)
    List<Tenancy> findByPropertyIdAndActiveFalse(UUID propertyId);

    Page<Tenancy> findByPropertyIdAndActive(UUID propertyId, boolean active, Pageable pageable);

    @Query("""
        SELECT tenancy
        FROM Tenancy tenancy
        WHERE tenancy.active = true
          AND tenancy.billingStarted = true
          AND tenancy.billingType = :billingType
        ORDER BY tenancy.createdAt ASC
        """)
    List<Tenancy> findActiveBillingStartedByBillingType(TenancyBillingType billingType);

    /**
     * Stays on NOTICE whose checkout falls in a range: it filters on endDate,
     * which only a notice carries while live. Deliberately so: its one reader
     * is the notice checkout reminder, which reads endDate. Fixed terms have
     * their own run-up ({@code AgreementExpiryReminderService}), and anything
     * else wanting a stay's end reads {@code Tenancy.checkoutDate()}.
     */
    @Query("""
        SELECT tenancy
        FROM Tenancy tenancy
        WHERE tenancy.active = true
          AND tenancy.endDate IS NOT NULL
          AND tenancy.endDate BETWEEN :startDate AND :endDate
        ORDER BY tenancy.endDate ASC, tenancy.createdAt ASC
        """)
    List<Tenancy> findActiveEndingBetween(LocalDate startDate, LocalDate endDate);

    /** Live stays (not yet pending exit) whose checkout date is before today: what the pending-exit sweep flips. */
    @Query("""
        SELECT tenancy.id
        FROM Tenancy tenancy
        WHERE tenancy.active = true
          AND tenancy.status IN (
              com.khatiyan.d_modules.tenancy.model.TenancyStatus.ACTIVE,
              com.khatiyan.d_modules.tenancy.model.TenancyStatus.ON_NOTICE,
              com.khatiyan.d_modules.tenancy.model.TenancyStatus.ON_PREMATURE_NOTICE)
          AND COALESCE(tenancy.endDate, tenancy.plannedEndDate) < :today
        ORDER BY tenancy.createdAt ASC
        """)
    List<UUID> findLivePastCheckoutIds(LocalDate today);

    /**
     * Active fixed-term tenancies whose agreement ends within a range.
     *
     * <p>Drives the run-up reminders. Only tenancies still running are returned —
     * one already on notice knows perfectly well it is ending, and telling it
     * again would be noise. A range, not one exact date, so a missed night is
     * caught by the next run.
     */
    @Query("""
        SELECT tenancy
        FROM Tenancy tenancy
        WHERE tenancy.active = true
          AND tenancy.status = com.khatiyan.d_modules.tenancy.model.TenancyStatus.ACTIVE
          AND tenancy.agreementEndDate BETWEEN :from AND :to
        ORDER BY tenancy.agreementEndDate ASC, tenancy.createdAt ASC
        """)
    List<Tenancy> findActiveFixedTermsEndingBetween(LocalDate from, LocalDate to);

    @Query("""
        SELECT COUNT(t) > 0 FROM Tenancy t
        WHERE t.userId = :userId AND t.propertyId = :propertyId AND t.active = true
    """)
    boolean existsActiveTenancy(@Param("userId") UUID userId, @Param("propertyId") UUID propertyId);

    @Query("""
        SELECT COUNT(t) > 0 FROM Tenancy t
        WHERE t.roomId = :roomId AND t.active = true
    """)
    boolean existsActiveTenancyForRoom(@Param("roomId") UUID roomId);

    long countByRoomIdAndActiveTrue(UUID roomId);

    boolean existsByFutureVacancySourceIdAndActiveTrue(UUID futureVacancySourceId);

    @Query("SELECT tenancy.futureVacancySourceId FROM Tenancy tenancy WHERE tenancy.active = true AND tenancy.futureVacancySourceId IN :sourceIds")
    List<UUID> findBookedFutureVacancySourceIds(Collection<UUID> sourceIds);

    Optional<Tenancy> findFirstByFutureVacancySourceIdAndActiveTrue(UUID futureVacancySourceId);

    boolean existsByFutureVacancyTenancyIdAndActiveTrue(UUID futureVacancyTenancyId);

    Optional<Tenancy> findFirstByFutureVacancyTenancyIdAndActiveTrue(UUID futureVacancyTenancyId);

    @Query("SELECT tenancy.futureVacancyTenancyId FROM Tenancy tenancy WHERE tenancy.active = true AND tenancy.futureVacancyTenancyId IN :tenancyIds")
    List<UUID> findBookedDepartingTenancyIds(Collection<UUID> tenancyIds);

    /** Locks a room's live stays while onboarding claims at most one booking per departing bed. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT tenancy FROM Tenancy tenancy WHERE tenancy.roomId = :roomId AND tenancy.active = true ORDER BY tenancy.startDate ASC")
    List<Tenancy> findLiveInRoomForUpdate(UUID roomId);

    /** Bookings that were found unable to start. The caller keeps only those still waiting for their bed. */
    List<Tenancy> findByPropertyIdAndActiveTrueAndStartBlockedAtIsNotNull(UUID propertyId);

    /**
     * Every signed booking due to start, whether or not its bed is free yet. The
     * service starts the ready ones and flags the late ones for the owner.
     */
    @Query("""
        SELECT tenancy.id FROM Tenancy tenancy
        WHERE tenancy.active = true
          AND tenancy.status = com.khatiyan.d_modules.tenancy.model.TenancyStatus.SCHEDULED
          AND tenancy.startDate <= :today
        ORDER BY tenancy.startDate ASC, tenancy.createdAt ASC
        """)
    List<UUID> findDueScheduledIds(LocalDate today, Pageable pageable);


}
