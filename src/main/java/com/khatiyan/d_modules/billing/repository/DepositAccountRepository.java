package com.khatiyan.d_modules.billing.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.billing.model.DepositAccount;
import com.khatiyan.d_modules.billing.model.DepositAccountStatus;

/**
 * Repository for tenancy deposit accounts.
 */
public interface DepositAccountRepository extends JpaRepository<DepositAccount, UUID> {

    /**
     * Finds the deposit account attached to a tenancy.
     */
    @Query("""
        SELECT account
        FROM DepositAccount account
        WHERE account.tenancyId = :tenancyId
        """)
    Optional<DepositAccount> findByTenancyId(UUID tenancyId);

    /**
     * Finds the active deposit account for a tenant.
     */
    @Query("""
        SELECT account
        FROM DepositAccount account
        WHERE account.tenantUserId = :tenantUserId
          AND account.status = :status
        """)
    Optional<DepositAccount> findByTenantUserIdAndStatus(UUID tenantUserId, DepositAccountStatus status);

    /**
     * Lists deposit accounts for one property.
     */
    @Query("""
        SELECT account
        FROM DepositAccount account
        WHERE account.propertyId = :propertyId
        ORDER BY account.createdAt DESC
        """)
    List<DepositAccount> findByPropertyId(UUID propertyId);

    /**
     * Prevents duplicate deposit account creation for the same tenancy.
     */
    @Query("""
        SELECT COUNT(account) > 0
        FROM DepositAccount account
        WHERE account.tenancyId = :tenancyId
        """)
    boolean existsByTenancyId(UUID tenancyId);
}