package com.khatiyan.d_modules.tenancy.repository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequestStatus;

/**
 * Repository for tenant room change request workflows.
 */
public interface TenancyRoomChangeRequestRepository extends JpaRepository<TenancyRoomChangeRequest, UUID> {

    @Query("""
        SELECT request
        FROM TenancyRoomChangeRequest request
        WHERE request.tenancyId = :tenancyId
          AND request.status IN :statuses
        """)
    Optional<TenancyRoomChangeRequest> findOpenByTenancyId(
            UUID tenancyId,
            List<TenancyRoomChangeRequestStatus> statuses);

    @Query("""
        SELECT request
        FROM TenancyRoomChangeRequest request
        WHERE request.tenantUserId = :tenantUserId
        ORDER BY request.createdAt DESC
        """)
    List<TenancyRoomChangeRequest> findByTenantUserId(UUID tenantUserId);

    @Query("""
        SELECT request
        FROM TenancyRoomChangeRequest request
        WHERE request.tenancyId = :tenancyId
        ORDER BY request.createdAt DESC
        """)
    List<TenancyRoomChangeRequest> findByTenancyId(UUID tenancyId);

    @Query("""
        SELECT request
        FROM TenancyRoomChangeRequest request
        WHERE request.propertyId = :propertyId
        ORDER BY request.createdAt DESC
        """)
    List<TenancyRoomChangeRequest> findByPropertyId(UUID propertyId);

    @Query("""
        SELECT request.id
        FROM TenancyRoomChangeRequest request
        WHERE request.status = :status
          AND request.effectiveTransferDate <= :today
        ORDER BY request.effectiveTransferDate ASC
        """)
    List<UUID> findDueForExecutionIds(
            TenancyRoomChangeRequestStatus status,
            LocalDate today,
            Pageable pageable);

    /**
     * Requests left unreviewed past the review window, oldest first.
     */
    @Query("""
        SELECT request.id
        FROM TenancyRoomChangeRequest request
        WHERE request.status = :status
          AND request.createdAt <= :cutoff
        ORDER BY request.createdAt ASC
        """)
    List<UUID> findStaleForExpiryIds(
            TenancyRoomChangeRequestStatus status,
            Instant cutoff,
            Pageable pageable);
}
