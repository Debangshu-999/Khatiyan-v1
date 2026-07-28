package com.khatiyan.d_modules.expense.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.expense.model.IncomeEntry;

@Repository
public interface IncomeEntryRepository extends JpaRepository<IncomeEntry, UUID> {

    Optional<IncomeEntry> findByIdAndPropertyId(UUID id, UUID propertyId);

    boolean existsByReversesIncomeId(UUID reversesIncomeId);

    @Query("""
        SELECT income
        FROM IncomeEntry income
        WHERE income.propertyId = :propertyId
          AND income.receivedDate >= :start
          AND income.receivedDate < :end
        ORDER BY income.receivedDate DESC, income.createdAt DESC
    """)
    List<IncomeEntry> findForPeriod(
            @Param("propertyId") UUID propertyId,
            @Param("start") LocalDate start,
            @Param("end") LocalDate end);

    @Query("""
        SELECT COALESCE(SUM(income.amountPaise), 0)
        FROM IncomeEntry income
        WHERE income.propertyId = :propertyId
          AND income.receivedDate >= :start
          AND income.receivedDate < :end
    """)
    long sumNetForPeriod(
            @Param("propertyId") UUID propertyId,
            @Param("start") LocalDate start,
            @Param("end") LocalDate end);
}