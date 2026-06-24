package com.khatiyan.d_modules.expense.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.expense.model.ExpenseCategory;

@Repository
public interface ExpenseCategoryRepository extends JpaRepository<ExpenseCategory, UUID> {

    List<ExpenseCategory> findByPropertyIdAndActiveTrueOrderByNameAsc(UUID propertyId);

    List<ExpenseCategory> findByPropertyId(UUID propertyId);

    Optional<ExpenseCategory> findByIdAndPropertyId(UUID id, UUID propertyId);

    Optional<ExpenseCategory> findByPropertyIdAndSystemKey(UUID propertyId, String systemKey);

    boolean existsByPropertyId(UUID propertyId);

    boolean existsByPropertyIdAndNormalizedName(UUID propertyId, String normalizedName);
}
