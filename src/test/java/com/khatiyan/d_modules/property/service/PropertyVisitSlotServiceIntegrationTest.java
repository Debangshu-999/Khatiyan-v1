package com.khatiyan.d_modules.property.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.c_shared.concurrency.ExpectedVersion;
import com.khatiyan.c_shared.concurrency.ExpectedVersionHolder;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.d_modules.analytics.AnalyticsFixtures;
import com.khatiyan.d_modules.property.api.dto.PropertyVisitSlotsResponse;
import com.khatiyan.d_modules.property.api.dto.SaveVisitSlotsRequest;
import com.khatiyan.d_modules.property.api.dto.SaveVisitSlotsRequest.SlotInput;
import com.khatiyan.support.IntegrationTest;

/**
 * Visit slots against a real database (2026-09-30): the stale-edit refusals,
 * replacing a day's slots with overlapping times, and the rules V6176 holds.
 */
@IntegrationTest
class PropertyVisitSlotServiceIntegrationTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PropertyVisitSlotService service;

    private UUID propertyId;
    private UUID ownerId;

    @BeforeEach
    void fixture() {
        propertyId = new AnalyticsFixtures(jdbc).property(Instant.now());
        ownerId = jdbc.queryForObject("SELECT owner_id FROM property.properties WHERE id = ?", UUID.class, propertyId);
    }

    @AfterEach
    void removeFixture() {
        ExpectedVersionHolder.clear();
        jdbc.update("DELETE FROM property.property_visit_settings WHERE property_id = ?", propertyId);
        jdbc.update("DELETE FROM property.properties WHERE id = ?", propertyId);
    }

    private static SaveVisitSlotsRequest request(Set<DayOfWeek> days, String... times) {
        return request(2, days, times);
    }

    private static SaveVisitSlotsRequest request(int visitorsPerSlot, Set<DayOfWeek> days, String... times) {
        List<SlotInput> slots = new java.util.ArrayList<>();
        for (int index = 0; index < times.length; index += 2) {
            slots.add(new SlotInput(LocalTime.parse(times[index]), LocalTime.parse(times[index + 1])));
        }
        return new SaveVisitSlotsRequest(days, slots, visitorsPerSlot);
    }

    @Test
    void readsAsNotSetUpUntilTheFirstSave() {
        PropertyVisitSlotsResponse slots = service.get(ownerId, propertyId);

        assertThat(slots.configured()).isFalse();
        assertThat(slots.version()).isNull();
        assertThat(slots.days()).hasSize(7).allMatch(day -> day.slots().isEmpty() && day.visitorsPerSlot() == null);
    }

    @Test
    void aSecondFirstSetupIsRefusedAsStale() {
        service.create(ownerId, propertyId, request(EnumSet.allOf(DayOfWeek.class), "10:00", "11:00"));

        assertThatThrownBy(() -> service.create(
                        ownerId, propertyId, request(Set.of(DayOfWeek.MONDAY), "12:00", "13:00")))
                .isInstanceOf(StaleVersionException.class);
    }

    @Test
    void aSaveOnAnOldVersionIsRefusedAndWritesNothing() {
        PropertyVisitSlotsResponse first =
                service.create(ownerId, propertyId, request(EnumSet.allOf(DayOfWeek.class), "10:00", "11:00"));

        ExpectedVersionHolder.set(ExpectedVersion.of(first.version()));
        PropertyVisitSlotsResponse second =
                service.save(ownerId, propertyId, request(Set.of(DayOfWeek.MONDAY), "12:00", "13:00"));
        assertThat(second.version()).isGreaterThan(first.version());

        // The screen that loaded the first version saves again.
        ExpectedVersionHolder.set(ExpectedVersion.of(first.version()));
        assertThatThrownBy(() -> service.save(ownerId, propertyId, request(Set.of(DayOfWeek.MONDAY), "15:00", "16:00")))
                .isInstanceOf(StaleVersionException.class);

        assertThat(service.get(ownerId, propertyId).days().get(0).slots())
                .extracting(PropertyVisitSlotsResponse.Slot::startTime)
                .containsExactly(LocalTime.of(12, 0));
    }

    @Test
    void newSlotsCanOverlapTheOnesTheyReplace() {
        PropertyVisitSlotsResponse first =
                service.create(ownerId, propertyId, request(Set.of(DayOfWeek.MONDAY), "10:00", "11:00", "11:00", "12:00"));

        // Old rows go before new ones are written, or the overlap rule would
        // refuse 10:30 against the 10:00 slot it is replacing.
        ExpectedVersionHolder.set(ExpectedVersion.of(first.version()));
        PropertyVisitSlotsResponse replaced =
                service.save(ownerId, propertyId, request(Set.of(DayOfWeek.MONDAY), "10:30", "11:30"));

        assertThat(replaced.days().get(0).slots())
                .extracting(PropertyVisitSlotsResponse.Slot::number, PropertyVisitSlotsResponse.Slot::startTime)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(1, LocalTime.of(10, 30)));
    }

    @Test
    void clearingADayNeedsTheCurrentVersion() {
        PropertyVisitSlotsResponse first =
                service.create(ownerId, propertyId, request(EnumSet.allOf(DayOfWeek.class), "10:00", "11:00"));

        ExpectedVersionHolder.set(ExpectedVersion.of(first.version()));
        PropertyVisitSlotsResponse cleared = service.clearDays(ownerId, propertyId, Set.of(DayOfWeek.SUNDAY));

        assertThat(cleared.days().get(6).slots()).isEmpty();
        assertThat(cleared.days().get(5).slots()).hasSize(1);

        ExpectedVersionHolder.set(ExpectedVersion.of(first.version()));
        assertThatThrownBy(() -> service.clearDays(ownerId, propertyId, Set.of(DayOfWeek.SATURDAY)))
                .isInstanceOf(StaleVersionException.class);
    }

    @Test
    void anEarlyMorningSlotIsStoredAsItsOwnClockTime() {
        service.create(ownerId, propertyId, request(Set.of(DayOfWeek.MONDAY), "05:00", "06:00"));

        // No time zone shift: 5:00 AM is minute 300 in the table, not 23:30 the day before.
        Integer start = jdbc.queryForObject("""
                SELECT s.start_minute FROM property.property_visit_slots s
                JOIN property.property_visit_settings v ON v.id = s.settings_id
                WHERE v.property_id = ?""", Integer.class, propertyId);
        assertThat(start).isEqualTo(300);
    }

    @Test
    void eachDayKeepsItsOwnVisitorLimit() {
        PropertyVisitSlotsResponse first =
                service.create(ownerId, propertyId, request(2, Set.of(DayOfWeek.MONDAY), "09:00", "11:00"));

        ExpectedVersionHolder.set(ExpectedVersion.of(first.version()));
        PropertyVisitSlotsResponse updated =
                service.save(ownerId, propertyId, request(4, Set.of(DayOfWeek.TUESDAY), "09:00", "11:00"));

        assertThat(updated.days().get(0).visitorsPerSlot()).isEqualTo(2);
        assertThat(updated.days().get(1).visitorsPerSlot()).isEqualTo(4);
    }

    @Test
    void theDatabaseRefusesOverlappingSlotsOnADay() {
        service.create(ownerId, propertyId, request(Set.of(DayOfWeek.MONDAY), "10:00", "11:00"));
        UUID settingsId = jdbc.queryForObject(
                "SELECT id FROM property.property_visit_settings WHERE property_id = ?", UUID.class, propertyId);

        assertThatThrownBy(() -> jdbc.update(
                        "INSERT INTO property.property_visit_slots "
                                + "(settings_id, day_of_week, start_minute, end_minute, visitors_per_slot) "
                                + "VALUES (?, 'MONDAY', 630, 645, 2)", settingsId))
                .isInstanceOf(DataIntegrityViolationException.class);
        // Another day, same times: fine.
        jdbc.update(
                "INSERT INTO property.property_visit_slots "
                        + "(settings_id, day_of_week, start_minute, end_minute, visitors_per_slot) "
                        + "VALUES (?, 'TUESDAY', 630, 645, 2)",
                settingsId);
    }
}
