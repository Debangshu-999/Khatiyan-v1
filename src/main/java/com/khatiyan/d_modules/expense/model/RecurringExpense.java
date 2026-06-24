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
 * A monthly recurring expense template (leased-building rent, internet, ...).
 * The monthly job materialises one {@link Expense} per active template and
 * stamps {@code lastGeneratedMonth} so a month is never generated twice.
 */
@Entity
@Table(name = "recurring_expenses", schema = "expense")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RecurringExpense extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "category_id", nullable = false)
    private UUID categoryId;

    /** Receiver / organisation each generated expense is paid to. */
    @Column(name = "paid_to", nullable = false, length = 160)
    private String paidTo;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(length = 500)
    private String description;

    /** Day of month (1..28) each generated expense is recorded for. */
    @Column(name = "day_of_month", nullable = false)
    private int dayOfMonth;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "last_generated_month")
    private LocalDate lastGeneratedMonth;

    @Column(name = "created_by_user_id")
    private UUID createdByUserId;

    private RecurringExpense(UUID propertyId, UUID categoryId, String paidTo, long amountPaise,
            String description, int dayOfMonth, UUID createdByUserId) {
        requirePositive(amountPaise);
        requirePayee(paidTo);
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.categoryId = categoryId;
        this.paidTo = paidTo.trim();
        this.amountPaise = amountPaise;
        this.description = normalize(description);
        this.dayOfMonth = clampDay(dayOfMonth);
        this.active = true;
        this.createdByUserId = createdByUserId;
    }

    public static RecurringExpense create(UUID propertyId, UUID categoryId, String paidTo, long amountPaise,
            String description, int dayOfMonth, UUID createdByUserId) {
        return new RecurringExpense(propertyId, categoryId, paidTo, amountPaise, description, dayOfMonth, createdByUserId);
    }

    public void update(UUID categoryId, String paidTo, long amountPaise, String description, int dayOfMonth) {
        requirePositive(amountPaise);
        requirePayee(paidTo);
        this.categoryId = categoryId;
        this.paidTo = paidTo.trim();
        this.amountPaise = amountPaise;
        this.description = normalize(description);
        this.dayOfMonth = clampDay(dayOfMonth);
    }

    /** True when this active template still needs an expense for the given month. */
    public boolean shouldGenerateFor(LocalDate month) {
        LocalDate firstOfMonth = month.withDayOfMonth(1);
        return active && (lastGeneratedMonth == null || lastGeneratedMonth.isBefore(firstOfMonth));
    }

    public void markGeneratedFor(LocalDate month) {
        this.lastGeneratedMonth = month.withDayOfMonth(1);
    }

    public void deactivate() {
        this.active = false;
    }

    private static int clampDay(int dayOfMonth) {
        if (dayOfMonth < 1 || dayOfMonth > 28) {
            throw new ValidationException("Recurring expense day must be between 1 and 28");
        }
        return dayOfMonth;
    }

    private static void requirePositive(long amountPaise) {
        if (amountPaise <= 0) {
            throw new ValidationException("Recurring expense amount must be positive");
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