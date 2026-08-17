package com.khatiyan.d_modules.tenancy.repository;

import java.time.Instant;
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

    /**
     * Requests left unreviewed past the review window, oldest first.
     */
    @Query("""
        SELECT request.id
        FROM TenancyExitRequest request
        WHERE request.status = :status
          AND request.createdAt <= :cutoff
        ORDER BY request.createdAt ASC
        """)
    List<UUID> findStaleForExpiryIds(TenancyExitRequestStatus status, Instant cutoff, Pageable pageable);

    /**
     * The tenancy's most recent request, whatever its state.
     *
     * <p>Used to decide whether a new request is a re-raise of one that expired
     * or was rejected. Only the latest matters — an older lapsed request cannot
     * be revived once the tenant has raised something since.
     */
    @Query("""
        SELECT request
        FROM TenancyExitRequest request
        WHERE request.tenancyId = :tenancyId
        ORDER BY request.createdAt DESC
        LIMIT 1
        """)
    Optional<TenancyExitRequest> findLatestByTenancyId(UUID tenancyId);
}
