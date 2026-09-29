package com.khatiyan.d_modules.analytics.snapshot;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.support.IntegrationTest;

@IntegrationTest
@Transactional
class PropertyDailySnapshotWriterTest {

    @Autowired private PropertyDailySnapshotWriter writer;
    @Autowired private JdbcTemplate jdbc;

    @Test
    void writingTheSameDayTwiceOverwritesInsteadOfDuplicating() {
        UUID property = UUID.randomUUID();
        LocalDate day = LocalDate.of(2026, 9, 25);
        writer.upsert(new PropertyDailySnapshot(property, day, 28, 5, 1, 2, 5, 1, 7500000, 1200000, 4000000, Instant.now()));
        writer.upsert(new PropertyDailySnapshot(property, day, 28, 6, 0, 2, 6, 1, 6000000, 0, 4100000, Instant.now()));

        Integer rows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM analytics.property_daily_snapshot WHERE property_id = ?", Integer.class, property);
        Integer occupied = jdbc.queryForObject(
                "SELECT occupied_beds FROM analytics.property_daily_snapshot WHERE property_id = ?", Integer.class, property);
        assertThat(rows).isEqualTo(1);
        assertThat(occupied).isEqualTo(6);
    }
}
