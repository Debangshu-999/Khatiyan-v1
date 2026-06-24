package com.khatiyan.d_modules.expense.model;

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

/** The recurring default monthly budget for a property (set once, editable). */
@Entity
@Table(name = "expense_budget_settings", schema = "expense")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExpenseBudgetSettings extends BaseEntity {

    @Id
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "default_monthly_budget_paise", nullable = false)
    private long defaultMonthlyBudgetPaise;

    @Column(name = "created_by_user_id")
    private UUID createdByUserId;

    private ExpenseBudgetSettings(UUID propertyId, long defaultMonthlyBudgetPaise, UUID createdByUserId) {
        requireNonNegative(defaultMonthlyBudgetPaise);
        this.propertyId = propertyId;
        this.defaultMonthlyBudgetPaise = defaultMonthlyBudgetPaise;
        this.createdByUserId = createdByUserId;
    }

    public static ExpenseBudgetSettings create(UUID propertyId, long defaultMonthlyBudgetPaise, UUID createdByUserId) {
        return new ExpenseBudgetSettings(propertyId, defaultMonthlyBudgetPaise, createdByUserId);
    }

    public void updateDefault(long defaultMonthlyBudgetPaise, UUID actorUserId) {
        requireNonNegative(defaultMonthlyBudgetPaise);
        this.defaultMonthlyBudgetPaise = defaultMonthlyBudgetPaise;
        this.createdByUserId = actorUserId;
    }

    private static void requireNonNegative(long amountPaise) {
        if (amountPaise < 0) {
            throw new ValidationException("Budget amount cannot be negative");
        }
    }
}
