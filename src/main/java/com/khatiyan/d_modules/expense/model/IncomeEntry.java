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
 * One immutable manual-income ledger row for a property. Mirrors
 * {@link Expense}:
 * corrections add a {@link IncomeEntryType#REVERSAL} row (negative amount)
 * pointing back at the original via {@code reversesIncomeId} — rows are never
 * mutated or deleted, so a month's net manual income is
 * {@code SUM(amount_paise)}.
 *
 * <p>
 * Rent and one-off bills (penalties, extra charges) are NOT stored here — they
 * come from the billing module at read time. This ledger is only for income
 * that
 * does not flow through billing.
 */

@Entity
@Table(name = "income_entries", schema = "expense")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IncomeEntry extends BaseEntity {
    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    /** Free-text income source / bucket, e.g. "Parking", "Laundry", "Misc". */
    @Column(nullable = false, length = 120)
    private String source;

    /** Who the money came from (optional payer name). */
    @Column(name = "received_from", length = 160)
    private String receivedFrom;

    /** Positive for income; negative for {@link IncomeEntryType#REVERSAL} rows. */
    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(name = "received_date", nullable = false)
    private LocalDate receivedDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type", nullable = false, length = 16)
    private IncomeEntryType entryType;

    @Column(name = "reverses_income_id")
    private UUID reversesIncomeId;

    @Column(length = 500)
    private String description;

    @Column(name = "created_by_user_id")
    private UUID createdByUserId;

    private IncomeEntry(
            UUID propertyId,
            String source,
            String receivedFrom,
            long amountPaise,
            LocalDate receivedDate,
            IncomeEntryType entryType,
            UUID reversesIncomeId,
            String description,
            UUID createdByUserId) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.source = normalize(source);
        this.receivedFrom = normalize(receivedFrom);
        this.amountPaise = amountPaise;
        this.receivedDate = receivedDate;
        this.entryType = entryType;
        this.reversesIncomeId = reversesIncomeId;
        this.description = normalize(description);
        this.createdByUserId = createdByUserId;
    }

    /** Owner/manager-entered income. */
    public static IncomeEntry manual(
            UUID propertyId, String source, String receivedFrom, long amountPaise,
            LocalDate receivedDate, String description, UUID createdByUserId) {
        requirePositive(amountPaise);
        requireSource(source);
        return new IncomeEntry(propertyId, source, receivedFrom, amountPaise, receivedDate,
                IncomeEntryType.MANUAL, null, description, createdByUserId);
    }

    /** Correction: a negative row that nets out an existing entry. */
    public static IncomeEntry reversalOf(IncomeEntry original, String reason, UUID createdByUserId,
            LocalDate reversedOn) {
        return new IncomeEntry(original.propertyId, original.source, original.receivedFrom, -original.amountPaise,
                reversedOn, IncomeEntryType.REVERSAL, original.id, reason, createdByUserId);
    }

    private static void requirePositive(long amountPaise) {
        if (amountPaise <= 0) {
            throw new ValidationException("Income amount must be positive");
        }
    }

    private static void requireSource(String source) {
        if (source == null || source.isBlank()) {
            throw new ValidationException("Income source is required");
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