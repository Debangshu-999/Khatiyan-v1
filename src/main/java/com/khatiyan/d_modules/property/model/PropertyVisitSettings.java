package com.khatiyan.d_modules.property.model;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * When tenants can book a visit to a property (2026-09-30): its slots, day by
 * day, and how many visitors one slot takes.
 *
 * <p>One row per property, and every save checks and bumps its version, so two
 * people editing the slots at once can never both win. A day with no slots
 * takes no visits.
 *
 * <p>The rules are checked here with messages a person can act on, and held
 * again by the database (V6176) against a race: a slot ends after it starts,
 * and two slots on one day never overlap.
 */
@Entity
@Table(name = "property_visit_settings", schema = "property")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyVisitSettings extends BaseEntity {

    public static final int MAX_SLOTS_PER_DAY = 5;
    public static final int MAX_VISITORS_PER_SLOT = 50;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "property_visit_slots",
            schema = "property",
            joinColumns = @JoinColumn(name = "settings_id"))
    private List<VisitSlot> slots = new ArrayList<>();

    private PropertyVisitSettings(UUID propertyId) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
    }

    /** A property's first visit slots. */
    public static PropertyVisitSettings create(UUID propertyId) {
        return new PropertyVisitSettings(propertyId);
    }

    private static void checkVisitorsPerSlot(int visitorsPerSlot) {
        if (visitorsPerSlot < 1 || visitorsPerSlot > MAX_VISITORS_PER_SLOT) {
            throw new ValidationException("Visitors per slot must be between 1 and " + MAX_VISITORS_PER_SLOT);
        }
    }

    /**
     * These days take exactly these slots, and whatever they had is replaced
     * (user, 2026-09-30). The times are checked once, then copied to each day.
     */
    public void replaceDays(Set<DayOfWeek> days, List<SlotTimes> times, int visitorsPerSlot) {
        if (days == null || days.isEmpty()) {
            throw new ValidationException("Choose at least one day");
        }
        checkVisitorsPerSlot(visitorsPerSlot);
        List<SlotTimes> ordered = checkedTimes(times);
        slots.removeIf(slot -> days.contains(slot.getDayOfWeek()));
        for (DayOfWeek day : days) {
            for (SlotTimes slot : ordered) {
                slots.add(VisitSlot.on(day, slot.startTime(), slot.endTime(), visitorsPerSlot));
            }
        }
    }

    /** These days take no visits. */
    public void clearDays(Set<DayOfWeek> days) {
        if (days == null || days.isEmpty()) {
            throw new ValidationException("Choose at least one day");
        }
        slots.removeIf(slot -> days.contains(slot.getDayOfWeek()));
    }

    /** One day's slots, earliest first: Slot 1 is the first of these. */
    public List<VisitSlot> slotsOn(DayOfWeek day) {
        return slots.stream()
                .filter(slot -> slot.getDayOfWeek() == day)
                .sorted(Comparator.comparing(VisitSlot::getStartTime))
                .toList();
    }

    /**
     * The times, earliest first, if they make a day's slots: 1 to 5 of them,
     * each ending after it starts, none overlapping. No minimum length (user,
     * 2026-09-30). Slots are numbered in the order returned.
     */
    static List<SlotTimes> checkedTimes(List<SlotTimes> times) {
        if (times == null || times.isEmpty()) {
            throw new ValidationException("Add at least one slot");
        }
        if (times.size() > MAX_SLOTS_PER_DAY) {
            throw new ValidationException("A day can have at most " + MAX_SLOTS_PER_DAY + " slots");
        }
        if (times.stream().anyMatch(slot -> slot == null || slot.startTime() == null || slot.endTime() == null)) {
            throw new ValidationException("Pick a start and end time for every slot");
        }
        // To the minute, which is what is stored: 10:00:30 would otherwise pass
        // here and then land as a zero-length slot.
        List<SlotTimes> ordered = times.stream()
                .map(slot -> new SlotTimes(
                        slot.startTime().truncatedTo(ChronoUnit.MINUTES),
                        slot.endTime().truncatedTo(ChronoUnit.MINUTES)))
                .sorted(Comparator.comparing(SlotTimes::startTime))
                .toList();
        for (int index = 0; index < ordered.size(); index++) {
            SlotTimes slot = ordered.get(index);
            if (!slot.endTime().isAfter(slot.startTime())) {
                throw new ValidationException("Slot " + (index + 1) + " must end after it starts, on the same day");
            }
            if (index > 0 && slot.startTime().isBefore(ordered.get(index - 1).endTime())) {
                throw new ValidationException("Slot " + index + " and Slot " + (index + 1) + " overlap");
            }
        }
        return ordered;
    }

    /** A slot's times, before they are given a day. */
    public record SlotTimes(LocalTime startTime, LocalTime endTime) {
    }
}
