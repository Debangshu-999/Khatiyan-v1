package com.khatiyan.d_modules.tenancy.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;

/**
 * Repository for tenancy exit request workflows.
 */
public interface TenancyExitRequestRepository extends JpaRepository<TenancyExitRequest, UUID> {

    @Query("""
        SELECT request
        FROM TenancyExitRequest request
        WHERE request.tenancyId = :tenancyId
          AND request.status IN :statuses
        """)
    Optional<TenancyExitRequest> findOpenByTenancyId(UUID tenancyId, List<TenancyExitRequestStatus> statuses);

    @Query("""
        SELECT request
        FROM TenancyExitRequest request
        WHERE request.tenantUserId = :tenantUserId
        ORDER BY request.createdAt DESC
        """)
    List<TenancyExitRequest> findByTenantUserId(UUID tenantUserId);

    @Query("""
        SELECT request
        FROM TenancyExitRequest request
        WHERE request.tenancyId = :tenancyId
        ORDER BY request.createdAt DESC
        """)
    List<TenancyExitRequest> findByTenancyId(UUID tenancyId);

    @Query("""
        SELECT request
        FROM TenancyExitRequest request
        WHERE request.propertyId = :propertyId
        ORDER BY request.createdAt DESC
        """)
    List<TenancyExitRequest> findByPropertyId(UUID propertyId);

    @Query("""
        SELECT request.id
        FROM TenancyExitRequest request
        WHERE request.status = :status
          AND request.approvedCheckoutDate <= :today
        ORDER BY request.approvedCheckoutDate ASC
        """)
    List<UUID> findDueForExecutionIds(TenancyExitRequestStatus status, LocalDate today, Pageable pageable);
}
