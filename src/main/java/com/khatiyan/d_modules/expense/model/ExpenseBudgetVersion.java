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
 * The default monthly budget from one month onwards.
 *
 * <p>A month's default is the version with the latest {@code effectiveMonth}
 * on or before it. Editing the budget adds or replaces the version for the
 * month the edit takes effect, and never touches earlier versions, so past
 * months keep reporting against the budget they actually had.
 */
@Entity
@Table(name = "expense_budget_versions", schema = "expense")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExpenseBudgetVersion extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "effective_month", nullable = false, updatable = false)
    private LocalDate effectiveMonth;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(name = "created_by_user_id")
    private UUID createdByUserId;

    private ExpenseBudgetVersion(UUID propertyId, LocalDate effectiveMonth, long amountPaise, UUID createdByUserId) {
        requireNonNegative(amountPaise);
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.effectiveMonth = effectiveMonth.withDayOfMonth(1);
        this.amountPaise = amountPaise;
        this.createdByUserId = createdByUserId;
    }

    public static ExpenseBudgetVersion create(
            UUID propertyId, LocalDate effectiveMonth, long amountPaise, UUID createdByUserId) {
        return new ExpenseBudgetVersion(propertyId, effectiveMonth, amountPaise, createdByUserId);
    }

    /** A second edit in the same month replaces that month's figure rather than stacking. */
    public void changeAmount(long amountPaise, UUID actorUserId) {
        requireNonNegative(amountPaise);
        this.amountPaise = amountPaise;
        this.createdByUserId = actorUserId;
    }

    private static void requireNonNegative(long amountPaise) {
        if (amountPaise < 0) {
            throw new ValidationException("Budget amount cannot be negative");
        }
    }
}
