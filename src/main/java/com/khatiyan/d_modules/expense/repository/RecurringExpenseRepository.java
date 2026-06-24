package com.khatiyan.d_modules.expense.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.expense.model.RecurringExpense;

@Repository
public interface RecurringExpenseRepository extends JpaRepository<RecurringExpense, UUID> {

    List<RecurringExpense> findByPropertyIdOrderByCreatedAtDesc(UUID propertyId);

    List<RecurringExpense> findByActiveTrue();

    Optional<RecurringExpense> findByIdAndPropertyId(UUID id, UUID propertyId);
}
