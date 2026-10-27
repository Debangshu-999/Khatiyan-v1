package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

import com.khatiyan.d_modules.analytics.AnalyticsFixtures;
import com.khatiyan.support.IntegrationTest;

/** Full-schema V6206 -> shared-hold upgrade on a sibling database inside the disposable test container. */
@IntegrationTest
class BedHoldMigrationIntegrationTest {
    private final JdbcTemplate admin;
    private final PostgreSQLContainer<?> postgres;

    @Autowired
    BedHoldMigrationIntegrationTest(JdbcTemplate admin, PostgreSQLContainer<?> postgres) {
        this.admin = admin;
        this.postgres = postgres;
    }

    @Test
    void backfillsLegacyLivePromisesWithoutDoubleCountingRoomReservations() throws Exception {
        String database = "booking_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        if (!database.matches("booking_upgrade_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe test database name");
        URI original = URI.create(postgres.getJdbcUrl().substring("jdbc:".length()));
        URI sibling = new URI(original.getScheme(), null, original.getHost(), original.getPort(),
                "/" + database, original.getQuery(), null);
        String url = "jdbc:" + sibling;
        admin.execute("CREATE DATABASE " + database);
        try {
            DriverManagerDataSource datasource = new DriverManagerDataSource(url, postgres.getUsername(), postgres.getPassword());
            Flyway.configure().dataSource(datasource).locations("classpath:db/migration").target("6206").load().migrate();
            JdbcTemplate jdbc = new JdbcTemplate(datasource);
            AnalyticsFixtures fx = new AnalyticsFixtures(jdbc);
            LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
            UUID property = fx.property(Instant.now());
            UUID waitingRoom = fx.room(property, 1, 1, 0, "OCCUPIED", true);
            UUID freedRoom = fx.room(property, 1, 0, 1, "VACANT", true);
            UUID moverRoom = fx.room(property, 1, 1, 0, "OCCUPIED", true);
            UUID target = fx.room(property, 1, 0, 1, "VACANT", true);
            UUID departing = fx.monthlyStay(property, waitingRoom, "ON_NOTICE", today.minusMonths(3), today.plusDays(3));
            UUID departed = fx.monthlyStay(property, freedRoom, "EXITED", today.minusMonths(3), today.minusDays(1));
            UUID mover = fx.monthlyStay(property, moverRoom, "ACTIVE", today.minusMonths(3), null);
            fx.roomChange(property, mover, moverRoom, target, "APPROVED", null);
            UUID move = jdbc.queryForObject("SELECT id FROM tenancy.tenancy_room_change_requests WHERE tenancy_id = ?", UUID.class, mover);
            UUID waiting = fx.monthlyStay(property, waitingRoom, "SCHEDULED", today.plusDays(8), null);
            UUID held = fx.monthlyStay(property, freedRoom, "PENDING_ACCEPTANCE", today.plusDays(8), null);
            UUID moveBooking = fx.monthlyStay(property, moverRoom, "SCHEDULED", today.plusDays(8), null);
            UUID cancelled = fx.monthlyStay(property, waitingRoom, "CANCELLED", today.plusDays(8), null);
            jdbc.update("UPDATE tenancy.tenancies SET future_vacancy_tenancy_id = ? WHERE id IN (?, ?)", departing, waiting, cancelled);
            jdbc.update("UPDATE tenancy.tenancies SET future_vacancy_tenancy_id = ? WHERE id = ?", departed, held);
            jdbc.update("UPDATE tenancy.tenancies SET future_vacancy_source_id = ? WHERE id = ?", move, moveBooking);
            int reservedBefore = jdbc.queryForObject("SELECT sum(reserved_count) FROM property.rooms WHERE property_id = ?", Integer.class, property);
            Instant created = jdbc.queryForObject("SELECT created_at FROM tenancy.tenancies WHERE id = ?", java.sql.Timestamp.class, waiting).toInstant();

            // V6207 and V6208, the two this test is about. It stops there so a
            // migration written later does not change what is counted here.
            Flyway upgrade = Flyway.configure().dataSource(datasource).locations("classpath:db/migration").target("6208").load();
            assertThat(upgrade.migrate().migrationsExecuted).isEqualTo(2);
            upgrade.validate();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM tenancy.bed_holds WHERE property_id = ?", Integer.class, property)).isEqualTo(3);
            assertThat(jdbc.queryForObject("SELECT state FROM tenancy.bed_holds WHERE owner_id = ?", String.class, waiting)).isEqualTo("WAITING");
            assertThat(jdbc.queryForObject("SELECT state FROM tenancy.bed_holds WHERE owner_id = ?", String.class, held)).isEqualTo("HELD");
            assertThat(jdbc.queryForObject("SELECT departing_tenancy_id FROM tenancy.bed_holds WHERE owner_id = ?", UUID.class, moveBooking)).isEqualTo(mover);
            assertThat(jdbc.queryForObject("SELECT created_at FROM tenancy.bed_holds WHERE owner_id = ?", java.sql.Timestamp.class, waiting).toInstant()).isEqualTo(created);
            assertThat(jdbc.queryForObject("SELECT sum(reserved_count) FROM property.rooms WHERE property_id = ?", Integer.class, property)).isEqualTo(reservedBefore);

            // Synchronization remains attached after the upgrade; cancellation
            // relinquishes the shared source but does not rewrite the hold's audit source.
            jdbc.update("UPDATE tenancy.tenancies SET is_active = false, status = 'CANCELLED' WHERE id = ?", waiting);
            assertThat(jdbc.queryForObject("SELECT state FROM tenancy.bed_holds WHERE owner_id = ?", String.class, waiting)).isEqualTo("RELEASED");

            // Everything written since still applies over the backfilled data,
            // and the booking schema arrives. Its four first tables are named, so a table added later does not break this.
            Flyway latest = Flyway.configure().dataSource(datasource).locations("classpath:db/migration").load();
            assertThat(latest.migrate().success).isTrue();
            latest.validate();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'booking'"
                    + " AND table_name IN ('settings', 'requests', 'offers', 'actions')", Integer.class)).isEqualTo(4);
        } finally {
            admin.execute("DROP DATABASE " + database + " WITH (FORCE)");
        }
    }
}
