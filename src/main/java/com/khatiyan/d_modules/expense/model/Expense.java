package com.khatiyan.d_modules.expense.model;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One immutable expense ledger row for a property. Corrections are made by
 * adding a {@link ExpenseEntryType#REVERSAL} row (negative amount) pointing back
 * at the original via {@code reversesExpenseId} — rows are never mutated or
 * deleted, so a month's net spend is simply {@code SUM(amount_paise)}.
 */
@Entity
@Table(name = "expenses", schema = "expense")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Expense extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "category_id", nullable = false)
    private UUID categoryId;

    /** Receiver / organisation the money was paid to. */
    @Column(name = "paid_to", length = 160)
    private String paidTo;

    /** Positive for charges; negative for {@link ExpenseEntryType#REVERSAL} rows. */
    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(name = "incurred_date", nullable = false)
    private LocalDate incurredDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type", nullable = false, length = 16)
    private ExpenseEntryType entryType;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_ref_type", length = 24)
    private ExpenseSourceRefType sourceRefType;

    @Column(name = "source_ref_id")
    private UUID sourceRefId;

    @Column(name = "reverses_expense_id")
    private UUID reversesExpenseId;

    @Column(length = 500)
    private String description;

    @Column(name = "created_by_user_id")
    private UUID createdByUserId;

    private Expense(
            UUID propertyId,
            UUID categoryId,
            String paidTo,
            long amountPaise,
            LocalDate incurredDate,
            ExpenseEntryType entryType,
            ExpenseSourceRefType sourceRefType,
            UUID sourceRefId,
            UUID reversesExpenseId,
            String description,
            UUID createdByUserId) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.categoryId = categoryId;
        this.paidTo = normalize(paidTo);
        this.amountPaise = amountPaise;
        this.incurredDate = incurredDate;
        this.entryType = entryType;
        this.sourceRefType = sourceRefType;
        this.sourceRefId = sourceRefId;
        this.reversesExpenseId = reversesExpenseId;
        this.description = normalize(description);
        this.createdByUserId = createdByUserId;
    }

    /** Owner/manager-entered charge. */
    public static Expense manual(
            UUID propertyId, UUID categoryId, String paidTo, long amountPaise,
            LocalDate incurredDate, String description, UUID createdByUserId) {
        requirePositive(amountPaise);
        requirePayee(paidTo);
        return new Expense(propertyId, categoryId, paidTo, amountPaise, incurredDate,
                ExpenseEntryType.MANUAL, null, null, null, description, createdByUserId);
    }

    /** Materialised from a recurring template by the monthly job. */
    public static Expense fromRecurring(
            UUID propertyId, UUID categoryId, String paidTo, long amountPaise, LocalDate incurredDate,
            String description, UUID recurringExpenseId, UUID createdByUserId) {
        requirePositive(amountPaise);
        requirePayee(paidTo);
        return new Expense(propertyId, categoryId, paidTo, amountPaise, incurredDate,
                ExpenseEntryType.RECURRING, ExpenseSourceRefType.RECURRING_EXPENSE, recurringExpenseId,
                null, description, createdByUserId);
    }

    /** Written by an event listener from a salary payment / deposit payout. */
    public static Expense auto(
            UUID propertyId, UUID categoryId, String paidTo, long amountPaise, LocalDate incurredDate,
            ExpenseSourceRefType sourceRefType, UUID sourceRefId, String description) {
        requirePositive(amountPaise);
        return new Expense(propertyId, categoryId, paidTo, amountPaise, incurredDate,
                ExpenseEntryType.AUTO, sourceRefType, sourceRefId, null, description, null);
    }

    /** Correction: a negative row that nets out an existing entry. */
    public static Expense reversalOf(Expense original, String reason, UUID createdByUserId, LocalDate reversedOn) {
        return new Expense(original.propertyId, original.categoryId, original.paidTo, -original.amountPaise,
                reversedOn, ExpenseEntryType.REVERSAL, null, null, original.id, reason, createdByUserId);
    }

    private static void requirePositive(long amountPaise) {
        if (amountPaise <= 0) {
            throw new ValidationException("Expense amount must be positive");
        }
    }

    private static void requirePayee(String paidTo) {
        if (paidTo == null || paidTo.isBlank()) {
            throw new ValidationException("Paid to is required");
        }
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}