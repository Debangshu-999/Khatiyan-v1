package com.khatiyan.d_modules.analytics.snapshot;

import java.sql.Timestamp;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** Upserts on (property, day): running a night twice overwrites, it never duplicates. */
@Repository
public class PropertyDailySnapshotWriter {

    private final NamedParameterJdbcTemplate jdbc;

    public PropertyDailySnapshotWriter(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void upsert(PropertyDailySnapshot s) {
        jdbc.update("""
                INSERT INTO analytics.property_daily_snapshot (property_id, snapshot_date, total_beds, occupied_beds,
                    reserved_beds, unavailable_beds, active_monthly_stays, active_daily_stays, dues_outstanding_paise,
                    dues_overdue_paise, deposits_held_paise, captured_at)
                VALUES (:propertyId, :day, :total, :occupied, :reserved, :unavailable, :monthly, :daily,
                    :outstanding, :overdue, :deposits, :capturedAt)
                ON CONFLICT (property_id, snapshot_date) DO UPDATE SET
                    total_beds = EXCLUDED.total_beds,
                    occupied_beds = EXCLUDED.occupied_beds,
                    reserved_beds = EXCLUDED.reserved_beds,
                    unavailable_beds = EXCLUDED.unavailable_beds,
                    active_monthly_stays = EXCLUDED.active_monthly_stays,
                    active_daily_stays = EXCLUDED.active_daily_stays,
                    dues_outstanding_paise = EXCLUDED.dues_outstanding_paise,
                    dues_overdue_paise = EXCLUDED.dues_overdue_paise,
                    deposits_held_paise = EXCLUDED.deposits_held_paise,
                    captured_at = EXCLUDED.captured_at
                """, new MapSqlParameterSource()
                .addValue("propertyId", s.propertyId())
                .addValue("day", s.snapshotDate())
                .addValue("total", s.totalBeds())
                .addValue("occupied", s.occupiedBeds())
                .addValue("reserved", s.reservedBeds())
                .addValue("unavailable", s.unavailableBeds())
                .addValue("monthly", s.activeMonthlyStays())
                .addValue("daily", s.activeDailyStays())
                .addValue("outstanding", s.duesOutstandingPaise())
                .addValue("overdue", s.duesOverduePaise())
                .addValue("deposits", s.depositsHeldPaise())
                .addValue("capturedAt", Timestamp.from(s.capturedAt())));
    }
}
