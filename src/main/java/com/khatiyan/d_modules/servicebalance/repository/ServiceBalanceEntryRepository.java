package com.khatiyan.d_modules.servicebalance.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntry;

public interface ServiceBalanceEntryRepository extends JpaRepository<ServiceBalanceEntry, UUID> {

    Page<ServiceBalanceEntry> findByAccountIdOrderByCreatedAtDesc(UUID accountId, Pageable pageable);

    List<ServiceBalanceEntry> findTop10ByAccountIdOrderByCreatedAtDesc(UUID accountId);

    boolean existsByIdempotencyKey(String idempotencyKey);

    /**
     * What the ledger says this account's available balance should be.
     *
     * <p>The reconciliation job compares this with the counter on the account
     * row. They are the same number reached two ways, and a disagreement means
     * something moved a counter without writing an entry.
     */
    @Query("select coalesce(sum(e.availableDeltaPaise), 0) from ServiceBalanceEntry e where e.accountId = :accountId")
    long sumAvailableDeltas(UUID accountId);

    /** The same check for held money. */
    @Query("select coalesce(sum(e.reservedDeltaPaise), 0) from ServiceBalanceEntry e where e.accountId = :accountId")
    long sumReservedDeltas(UUID accountId);
}
