package com.khatiyan.d_modules.tenancy.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.khatiyan.d_modules.tenancy.model.StayOut;

public interface StayOutRepository extends JpaRepository<StayOut, UUID> {

    /** A tenant's own, newest first, cancelled ones left out. */
    List<StayOut> findByTenancyIdAndCancelledAtIsNullOrderByLeaveDateDesc(UUID tenancyId);

    /** Live stay outs at a property touching the days {@code from} to {@code to}, inclusive. */
    @Query("""
            SELECT s FROM StayOut s
            WHERE s.propertyId = :propertyId
              AND s.cancelledAt IS NULL
              AND s.leaveDate <= :to
              AND s.returnDate >= :from
            ORDER BY s.leaveDate, s.returnDate
            """)
    List<StayOut> findLiveAtProperty(
            @Param("propertyId") UUID propertyId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Stay outs at a property that ended (back) on or after {@code from} and before {@code before}, newest first. */
    @Query("""
            SELECT s FROM StayOut s
            WHERE s.propertyId = :propertyId
              AND s.cancelledAt IS NULL
              AND s.returnDate >= :from
              AND s.returnDate < :before
            ORDER BY s.returnDate DESC, s.leaveDate DESC
            """)
    List<StayOut> findPastAtProperty(
            @Param("propertyId") UUID propertyId, @Param("from") LocalDate from, @Param("before") LocalDate before);
}
