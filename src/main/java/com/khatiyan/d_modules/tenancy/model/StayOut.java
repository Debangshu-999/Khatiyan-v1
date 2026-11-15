package com.khatiyan.d_modules.tenancy.model;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.model.MealType;

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
 * A tenant's declared stay out (user, 2026-11-08): the nights they will be
 * away, and the meals that takes them off.
 *
 * <p>The leaving day keeps the meals up to and including {@code lastMealHere},
 * and the return day starts again at {@code firstMealBack}. No last meal means
 * gone before the day's first one, no first meal back means back after the
 * day's last. Every day in between is off. Meals run in the order of the day
 * ({@link #MEAL_ORDER}), not the enum's, which puts dinner before snacks.
 *
 * <p>For PG and hostel stays, monthly ones only. A cancelled stay out takes
 * nobody off anything, and is kept for the record.
 */
@Entity
@Table(name = "stay_outs", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StayOut extends BaseEntity {

    /** The longest a single stay out may run. Longer than this is an exit, not a trip. */
    public static final int MAX_NIGHTS = 60;

    /** The longest reason a tenant can give. */
    public static final int MAX_REASON = 200;

    /** Meals in the order they are served. */
    public static final List<MealType> MEAL_ORDER =
            List.of(MealType.BREAKFAST, MealType.LUNCH, MealType.EVENING_SNACKS, MealType.DINNER);

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "tenancy_id", nullable = false, updatable = false)
    private UUID tenancyId;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "tenant_user_id", nullable = false, updatable = false)
    private UUID tenantUserId;

    @Column(name = "leave_date", nullable = false)
    private LocalDate leaveDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "last_meal_here", length = 20)
    private MealType lastMealHere;

    @Column(name = "return_date", nullable = false)
    private LocalDate returnDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "first_meal_back", length = 20)
    private MealType firstMealBack;

    /** The tenant's own words, optional (user, 2026-11-08). */
    @Column(length = MAX_REASON)
    private String reason;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    public static StayOut declare(
            UUID tenancyId, UUID propertyId, UUID tenantUserId,
            LocalDate leaveDate, MealType lastMealHere, LocalDate returnDate, MealType firstMealBack,
            String reason) {
        StayOut stay = new StayOut();
        stay.id = UUID.randomUUID();
        stay.tenancyId = tenancyId;
        stay.propertyId = propertyId;
        stay.tenantUserId = tenantUserId;
        stay.set(leaveDate, lastMealHere, returnDate, firstMealBack, reason);
        return stay;
    }

    /** The whole stay out, before it starts. */
    public void change(LocalDate leaveDate, MealType lastMealHere, LocalDate returnDate, MealType firstMealBack,
            String reason) {
        set(leaveDate, lastMealHere, returnDate, firstMealBack, reason);
    }

    /** Only the coming back, once it has started: back early or staying longer. */
    public void changeReturn(LocalDate returnDate, MealType firstMealBack, String reason) {
        set(this.leaveDate, this.lastMealHere, returnDate, firstMealBack, reason);
    }

    public void cancel() {
        this.cancelledAt = Instant.now();
    }

    public boolean isCancelled() {
        return cancelledAt != null;
    }

    /** Whether this stay out takes its tenant off {@code meal} on {@code date}. */
    public boolean isAwayFor(LocalDate date, MealType meal) {
        if (isCancelled() || date.isBefore(leaveDate) || date.isAfter(returnDate)) {
            return false;
        }
        int rank = MEAL_ORDER.indexOf(meal);
        if (date.equals(leaveDate)) {
            return lastMealHere == null || rank > MEAL_ORDER.indexOf(lastMealHere);
        }
        if (date.equals(returnDate)) {
            return firstMealBack == null || rank < MEAL_ORDER.indexOf(firstMealBack);
        }
        return true;
    }

    /** Away on the night of {@code date}: from the leaving day to the night before the return. */
    public boolean isAwayOnNightOf(LocalDate date) {
        return !isCancelled() && !date.isBefore(leaveDate) && date.isBefore(returnDate);
    }

    /** Whether it shares a night with a stay out from {@code otherLeave} to {@code otherReturn}. */
    public boolean overlaps(LocalDate otherLeave, LocalDate otherReturn) {
        return !isCancelled() && leaveDate.isBefore(otherReturn) && otherLeave.isBefore(returnDate);
    }

    private void set(LocalDate leaveDate, MealType lastMealHere, LocalDate returnDate, MealType firstMealBack,
            String reason) {
        if (leaveDate == null || returnDate == null) {
            throw new ValidationException("Choose when you leave and when you are back.");
        }
        if (!returnDate.isAfter(leaveDate)) {
            throw new ValidationException("Come back at least a day after you leave.");
        }
        if (ChronoUnit.DAYS.between(leaveDate, returnDate) > MAX_NIGHTS) {
            throw new ValidationException("A stay out can be up to " + MAX_NIGHTS + " nights.");
        }
        this.leaveDate = leaveDate;
        this.lastMealHere = lastMealHere;
        this.returnDate = returnDate;
        this.firstMealBack = firstMealBack;
        String said = reason == null ? null : reason.strip();
        if (said != null && said.length() > MAX_REASON) {
            throw new ValidationException("Keep the reason under " + MAX_REASON + " characters.");
        }
        this.reason = said == null || said.isEmpty() ? null : said;
    }
}
