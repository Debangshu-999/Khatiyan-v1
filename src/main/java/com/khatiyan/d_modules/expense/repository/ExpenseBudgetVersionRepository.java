package com.khatiyan.d_modules.expense.repository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.expense.model.ExpenseBudgetVersion;

@Repository
public interface ExpenseBudgetVersionRepository extends JpaRepository<ExpenseBudgetVersion, UUID> {

    Optional<ExpenseBudgetVersion> findFirstByPropertyIdAndEffectiveMonthLessThanEqualOrderByEffectiveMonthDesc(
            UUID propertyId, LocalDate month);

    Optional<ExpenseBudgetVersion> findByPropertyIdAndEffectiveMonth(UUID propertyId, LocalDate effectiveMonth);

    /**
     * The default budget in force for a month: the latest version effective on
     * or before its first day. Empty when no budget had been set by then.
     */
    default Optional<Long> defaultFor(UUID propertyId, LocalDate month) {
        return findFirstByPropertyIdAndEffectiveMonthLessThanEqualOrderByEffectiveMonthDesc(
                        propertyId, month.withDayOfMonth(1))
                .map(ExpenseBudgetVersion::getAmountPaise);
    }
}
