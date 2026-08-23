package com.khatiyan.d_modules.expense.model;

import java.util.Locale;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** A property-scoped grouping for expenses (Salary, Utilities, custom, ...). */
@Entity
@Table(name = "expense_categories", schema = "expense")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExpenseCategory extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(nullable = false)
    private String name;

    @Column(name = "normalized_name", nullable = false)
    private String normalizedName;

    @Column(name = "system_key")
    private String systemKey;

    @Column(name = "is_system", nullable = false)
    private boolean system;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private ExpenseCategory(UUID propertyId, String name, String systemKey) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.name = name.trim();
        this.normalizedName = normalize(name);
        this.systemKey = systemKey;
        this.system = systemKey != null;
        this.active = true;
    }

    public static ExpenseCategory system(UUID propertyId, ExpenseCategoryType type) {
        return new ExpenseCategory(propertyId, type.displayName(), type.name());
    }

    public static ExpenseCategory custom(UUID propertyId, String name) {
        return new ExpenseCategory(propertyId, name, null);
    }

    public void rename(String name) {
        if (system) {
            throw new IllegalStateException("System expense categories cannot be renamed");
        }
        this.name = name.trim();
        this.normalizedName = normalize(name);
    }

    /**
     * Brings a deleted category back, under whatever spelling was just typed.
     *
     * <p>Deleting is a soft delete, but (property_id, normalized_name) is UNIQUE
     * across active and inactive rows alike — so re-creating a deleted name could
     * never insert. It reported "a category with this name already exists" about
     * a category nobody could see, which reads as a bug.
     *
     * <p>Reviving is also the only behaviour that keeps history: the expense rows
     * already pointing at this category stay attached to it.
     */
    public void restore(String name) {
        if (system) {
            throw new IllegalStateException("System expense categories are never deleted");
        }
        this.name = name.trim();
        this.normalizedName = normalize(name);
        this.active = true;
    }

    public void deactivate() {
        if (system) {
            throw new IllegalStateException("System expense categories cannot be deactivated");
        }
        this.active = false;
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}