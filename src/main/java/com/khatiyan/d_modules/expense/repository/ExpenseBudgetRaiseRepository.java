package com.khatiyan.d_modules.expense.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.expense.model.ExpenseBudgetRaise;

@Repository
public interface ExpenseBudgetRaiseRepository extends JpaRepository<ExpenseBudgetRaise, UUID> {

    List<ExpenseBudgetRaise> findByPropertyIdAndBudgetMonthOrderByCreatedAtDesc(UUID propertyId, LocalDate budgetMonth);

    @Query("""
        SELECT COALESCE(SUM(raise.amountPaise), 0)
        FROM ExpenseBudgetRaise raise
        WHERE raise.propertyId = :propertyId AND raise.budgetMonth = :budgetMonth
    """)
    long sumForMonth(@Param("propertyId") UUID propertyId, @Param("budgetMonth") LocalDate budgetMonth);
}
