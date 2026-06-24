package com.khatiyan.d_modules.expense.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.expense.model.Expense;
import com.khatiyan.d_modules.expense.model.ExpenseSourceRefType;

@Repository
public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

    Optional<Expense> findByIdAndPropertyId(UUID id, UUID propertyId);

    Optional<Expense> findBySourceRefTypeAndSourceRefId(ExpenseSourceRefType sourceRefType, UUID sourceRefId);

    boolean existsByReversesExpenseId(UUID reversesExpenseId);

    @Query("""
        SELECT expense
        FROM Expense expense
        WHERE expense.propertyId = :propertyId
          AND expense.incurredDate >= :start
          AND expense.incurredDate < :end
        ORDER BY expense.incurredDate DESC, expense.createdAt DESC
    """)
    List<Expense> findForPeriod(
            @Param("propertyId") UUID propertyId,
            @Param("start") LocalDate start,
            @Param("end") LocalDate end);

    @Query("""
        SELECT COALESCE(SUM(expense.amountPaise), 0)
        FROM Expense expense
        WHERE expense.propertyId = :propertyId
          AND expense.incurredDate >= :start
          AND expense.incurredDate < :end
    """)
    long sumNetForPeriod(
            @Param("propertyId") UUID propertyId,
            @Param("start") LocalDate start,
            @Param("end") LocalDate end);
}
