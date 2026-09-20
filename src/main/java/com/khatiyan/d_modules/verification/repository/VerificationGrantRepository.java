package com.khatiyan.d_modules.verification.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.verification.model.VerificationGrant;
import com.khatiyan.d_modules.verification.model.VerificationGrantStatus;

public interface VerificationGrantRepository extends JpaRepository<VerificationGrant, UUID> {

    List<VerificationGrant> findByTenancyIdOrderByCreatedAtAsc(UUID tenancyId);

    Optional<VerificationGrant> findByTenancyIdAndServiceCode(
            UUID tenancyId, com.khatiyan.d_modules.servicebalance.model.ServiceCode serviceCode);

    List<VerificationGrant> findByTenancyIdAndStatus(UUID tenancyId, VerificationGrantStatus status);

    /**
     * Everything still asked of this tenant.
     *
     * <p>Cancelled grants are left out: a tenancy that went away has nothing
     * for its tenant to do, and showing the row would only raise a question
     * with no useful answer.
     */
    List<VerificationGrant> findByTenantUserIdAndStatusNotOrderByCreatedAtAsc(
            UUID tenantUserId, VerificationGrantStatus excluded);

    /**
     * What this owner has ordered and not yet spent, priced at today's rate.
     *
     * <p>Feeds the exposure guard. Ordered attempts are not dues until a tenant
     * runs them, so nothing else in the system can see this queue building up
     * behind the dues ceiling.
     */
    @Query("""
            select coalesce(sum(g.attemptsGranted - g.attemptsUsed), 0)
            from VerificationGrant g
            where g.ownerUserId = :ownerUserId and g.status = :status
            """)
    long sumUnusedAttempts(UUID ownerUserId, VerificationGrantStatus status);
}
