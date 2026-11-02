package com.khatiyan.d_modules.food.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "food_module_settings", schema = "food")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FoodModuleSetting extends BaseEntity {

    @Id
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "is_enabled", nullable = false)
    private boolean enabled;

    /** Record meal attendance (user, 2026-11-01). */
    @Column(name = "attendance_enabled", nullable = false)
    private boolean attendanceEnabled;

    /** When it was last turned on. A meal already under way then is not recorded. */
    @Column(name = "attendance_enabled_at")
    private Instant attendanceEnabledAt;

    private FoodModuleSetting(UUID propertyId, boolean enabled) {
        this.propertyId = propertyId;
        this.enabled = enabled;
    }

    public static FoodModuleSetting create(UUID propertyId, boolean enabled) {
        return new FoodModuleSetting(propertyId, enabled);
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public void setAttendanceEnabled(boolean enabled, Instant at) {
        if (enabled && !this.attendanceEnabled) {
            this.attendanceEnabledAt = at;
        }
        this.attendanceEnabled = enabled;
    }
}
