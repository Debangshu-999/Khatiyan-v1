package com.khatiyan.d_modules.expense.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.expense.model.ExpenseBudgetSettings;

@Repository
public interface ExpenseBudgetSettingsRepository extends JpaRepository<ExpenseBudgetSettings, UUID> {

    Optional<ExpenseBudgetSettings> findByPropertyId(UUID propertyId);
}
