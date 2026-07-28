package com.khatiyan.d_modules.payment.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.payment.model.OwnerLinkedAccount;

@Repository
public interface OwnerLinkedAccountRepository extends JpaRepository<OwnerLinkedAccount, UUID> {

    List<OwnerLinkedAccount> findByOwnerUserIdOrderByCreatedAtAsc(UUID ownerUserId);

    /** The account rent is transferred to. At most one exists per owner. */
    Optional<OwnerLinkedAccount> findByOwnerUserIdAndPrimaryTrue(UUID ownerUserId);

    /** Ownership-scoped lookup so one owner can never touch another's account. */
    Optional<OwnerLinkedAccount> findByIdAndOwnerUserId(UUID id, UUID ownerUserId);
}
