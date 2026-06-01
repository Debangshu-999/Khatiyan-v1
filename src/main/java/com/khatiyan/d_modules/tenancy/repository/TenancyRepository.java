package com.khatiyan.d_modules.tenancy.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

@Repository
public interface TenancyRepository extends JpaRepository<Tenancy, UUID> {

    Optional<Tenancy> findByUserIdAndActiveTrue(UUID userId);

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
        WHERE tenancy.active = true
          AND tenancy.billingStarted = true
          AND tenancy.billingType = :billingType
        ORDER BY tenancy.createdAt ASC
        """)
    List<Tenancy> findActiveBillingStartedByBillingType(TenancyBillingType billingType);

    @Query("""
        SELECT tenancy
        FROM Tenancy tenancy
        WHERE tenancy.active = true
          AND tenancy.endDate IS NOT NULL
          AND tenancy.endDate BETWEEN :startDate AND :endDate
        ORDER BY tenancy.endDate ASC, tenancy.createdAt ASC
        """)
    List<Tenancy> findActiveEndingBetween(LocalDate startDate, LocalDate endDate);

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


}
