package com.khatiyan.d_modules.billing.damage;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DamageRecordRepository extends JpaRepository<DamageRecord, UUID> {

    List<DamageRecord> findByPropertyIdAndStatusInOrderByCodeDescSplitNumberAsc(UUID propertyId, Collection<DamageRecordStatus> statuses);

    // Page scalar IDs first: a collection fetch join must never paginate in memory.
    @Query("SELECT r.id FROM DamageRecord r WHERE r.propertyId = :propertyId AND r.status IN :statuses ORDER BY r.code DESC, COALESCE(r.splitNumber, 0) ASC")
    Page<UUID> findPageIds(@Param("propertyId") UUID propertyId,
            @Param("statuses") Collection<DamageRecordStatus> statuses, Pageable pageable);

    @Query("SELECT DISTINCT r FROM DamageRecord r LEFT JOIN FETCH r.shares WHERE r.id IN :ids")
    List<DamageRecord> findPageRecords(@Param("ids") Collection<UUID> ids);

    interface Counts {
        long getOpenCount();
        long getHistoryCount();
        long getNotChargedCount();
    }

    // Matches charged on the response: every share must have a live, non-cancelled bill.
    @Query(value = """
            SELECT COUNT(*) FILTER (WHERE r.status = 'OPEN') AS "openCount",
                   COUNT(*) FILTER (WHERE r.status IN ('REPAIRED', 'REPLACED')) AS "historyCount",
                   COUNT(*) FILTER (WHERE r.status = 'OPEN' AND r.responsibility <> 'NONE' AND (
                       NOT EXISTS (SELECT 1 FROM billing.damage_record_shares s WHERE s.record_id = r.id)
                       OR EXISTS (SELECT 1 FROM billing.damage_record_shares s
                                  LEFT JOIN billing.billing_cycles b ON b.id = s.bill_id
                                  WHERE s.record_id = r.id AND (b.id IS NULL OR b.status = 'CANCELLED')
                                    AND NOT s.waived AND s.deposit_paise < s.amount_paise)
                   )) AS "notChargedCount"
            FROM billing.damage_records r WHERE r.property_id = :propertyId
            """, nativeQuery = true)
    Counts countForProperty(@Param("propertyId") UUID propertyId);

    Optional<DamageRecord> findByIdAndPropertyId(UUID id, UUID propertyId);

    /** Every split of one damage. */
    List<DamageRecord> findByPropertyIdAndCode(UUID propertyId, String code);

    @Query("SELECT DISTINCT r FROM DamageRecord r JOIN r.shares s WHERE s.tenancyId = :tenancyId ORDER BY r.createdAt DESC")
    List<DamageRecord> findByShareTenancyId(@Param("tenancyId") UUID tenancyId);

    /** The records on one Damage bill, oldest first, the order its lines were raised in. */
    @Query("SELECT DISTINCT r FROM DamageRecord r JOIN r.shares s WHERE s.billId = :billId ORDER BY r.createdAt ASC")
    List<DamageRecord> findByShareBillId(@Param("billId") UUID billId);
}
