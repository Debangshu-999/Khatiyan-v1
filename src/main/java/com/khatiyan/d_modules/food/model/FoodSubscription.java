package com.khatiyan.d_modules.food.model;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.MapKeyEnumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One version of a tenancy's food plan (2026-09-29).
 *
 * <p>It applies from {@code effectiveFrom} up to, not including,
 * {@code effectiveUntil} (IST dates, open when null). A change never touches
 * today: it ends this version tonight and starts another tomorrow, so what a
 * tenant eats on a day is decided by the date alone and no job runs at
 * midnight. The week names a profile for every day: a normal plan repeats one,
 * a hybrid plan mixes them.
 */
@Entity
@Table(name = "food_subscriptions", schema = "food")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FoodSubscription extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "tenancy_id", nullable = false, updatable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id", nullable = false, updatable = false)
    private UUID tenantUserId;

    /** When the tenant chose it. */
    @Column(name = "started_at", nullable = false, updatable = false)
    private Instant startedAt;

    @Column(name = "effective_from", nullable = false, updatable = false)
    private LocalDate effectiveFrom;

    /** The first day it no longer applies. Null while it runs on. */
    @Column(name = "effective_until")
    private LocalDate effectiveUntil;

    /** When it was ended, and why. The end itself is {@code effectiveUntil}. */
    @Column(name = "ended_at")
    private Instant endedAt;

    @Column(name = "end_reason", length = 120)
    private String endReason;

    /** A profile for each day of the week, all seven. */
    @ElementCollection(fetch = FetchType.EAGER)
    @Fetch(FetchMode.SUBSELECT)
    @CollectionTable(
            name = "food_subscription_days",
            schema = "food",
            joinColumns = @JoinColumn(name = "subscription_id"))
    @MapKeyEnumerated(EnumType.STRING)
    @MapKeyColumn(name = "day_of_week")
    @Column(name = "profile_id", nullable = false)
    private Map<DayOfWeek, UUID> days = new HashMap<>();

    private FoodSubscription(
            UUID propertyId, UUID tenancyId, UUID tenantUserId, Map<DayOfWeek, UUID> week, LocalDate from) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.startedAt = Instant.now();
        this.effectiveFrom = from;
        this.days.putAll(requireWeek(week));
    }

    /** A plan that starts on {@code from} and runs on. */
    public static FoodSubscription start(
            UUID propertyId, UUID tenancyId, UUID tenantUserId, Map<DayOfWeek, UUID> week, LocalDate from) {
        return new FoodSubscription(propertyId, tenancyId, tenantUserId, week, from);
    }

    /** The same profile on all seven days: a normal plan. */
    public static Map<DayOfWeek, UUID> everyDay(UUID profileId) {
        Map<DayOfWeek, UUID> week = new EnumMap<>(DayOfWeek.class);
        for (DayOfWeek day : DayOfWeek.values()) {
            week.put(day, profileId);
        }
        return week;
    }

    public static Map<DayOfWeek, UUID> requireWeek(Map<DayOfWeek, UUID> week) {
        if (week == null || week.size() != 7 || week.values().stream().anyMatch(java.util.Objects::isNull)) {
            throw new ValidationException("Choose a plan for every day of the week");
        }
        return week;
    }

    /** Whether it applies on {@code date}. */
    public boolean covers(LocalDate date) {
        return !effectiveFrom.isAfter(date) && (effectiveUntil == null || effectiveUntil.isAfter(date));
    }

    /** The profile eaten on {@code date}'s weekday. */
    public UUID profileOn(LocalDate date) {
        return days.get(date.getDayOfWeek());
    }

    public Map<DayOfWeek, UUID> week() {
        Map<DayOfWeek, UUID> copy = new EnumMap<>(DayOfWeek.class);
        copy.putAll(days);
        return Collections.unmodifiableMap(copy);
    }

    /** More than one profile across the week. */
    public boolean isHybrid() {
        // A loaded plan's values() is Hibernate's Set-wrapped view: stream().distinct()
        // trusts it and skips the work, so count through a real set (2026-09-29).
        return profilesUsed().size() > 1;
    }

    public Set<UUID> profilesUsed() {
        return Set.copyOf(days.values());
    }

    /** The weekdays a profile is eaten on, Monday first. */
    public List<DayOfWeek> daysOn(UUID profileId) {
        return days.entrySet().stream()
                .filter(entry -> entry.getValue().equals(profileId))
                .map(Map.Entry::getKey)
                .sorted()
                .collect(Collectors.toList());
    }

    public boolean sameWeek(Map<DayOfWeek, UUID> week) {
        return days.equals(new HashMap<>(week));
    }

    /** A plan that has not started yet takes a different week. */
    public void replaceWeek(Map<DayOfWeek, UUID> week) {
        requireWeek(week);
        days.clear();
        days.putAll(week);
    }

    /** It stops applying on {@code until}: the day after its last day. */
    public void endOn(LocalDate until, String reason) {
        this.effectiveUntil = until.isBefore(effectiveFrom) ? effectiveFrom : until;
        this.endedAt = Instant.now();
        if (reason == null || reason.isBlank()) {
            this.endReason = null;
        } else {
            String normalized = reason.trim();
            this.endReason = normalized.length() > 120 ? normalized.substring(0, 120) : normalized;
        }
    }

    /** Runs on again, as if it had never been ended. */
    public void reopen() {
        this.effectiveUntil = null;
        this.endedAt = null;
        this.endReason = null;
    }
}
