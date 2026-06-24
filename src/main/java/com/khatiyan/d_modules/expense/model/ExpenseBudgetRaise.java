package com.khatiyan.d_modules.expense.model;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A "raise budget" action: an additive bump on top of the default budget for a
 * given month, recorded as its own row so we can report how much was raised in a
 * month (distinct from the recurring default and from savings).
 */
@Entity
@Table(name = "expense_budget_raises", schema = "expense")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExpenseBudgetRaise extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "budget_month", nullable = false, updatable = false)
    private LocalDate budgetMonth;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(length = 300)
    private String reason;

    @Column(name = "created_by_user_id")
    private UUID createdByUserId;

    private ExpenseBudgetRaise(UUID propertyId, LocalDate budgetMonth, long amountPaise, String reason, UUID createdByUserId) {
        if (amountPaise <= 0) {
            throw new ValidationException("Raise amount must be positive");
        }
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.budgetMonth = budgetMonth.withDayOfMonth(1);
        this.amountPaise = amountPaise;
        this.reason = normalize(reason);
        this.createdByUserId = createdByUserId;
    }

    public static ExpenseBudgetRaise create(
            UUID propertyId, LocalDate budgetMonth, long amountPaise, String reason, UUID createdByUserId) {
        return new ExpenseBudgetRaise(propertyId, budgetMonth, amountPaise, reason, createdByUserId);
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
