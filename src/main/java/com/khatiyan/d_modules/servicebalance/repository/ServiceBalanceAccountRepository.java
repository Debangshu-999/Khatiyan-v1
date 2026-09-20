package com.khatiyan.d_modules.servicebalance.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;

public interface ServiceBalanceAccountRepository extends JpaRepository<ServiceBalanceAccount, UUID> {

    Optional<ServiceBalanceAccount> findByOwnerUserId(UUID ownerUserId);
}
