package com.khatiyan.d_modules.tenancy.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A property's roll call (user, 2026-11-15): off by default, a window the owner
 * sets with no default, automatic check-in off by default, a 100 m radius.
 */
@Entity
@Table(name = "roll_call_settings", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RollCallSetting extends BaseEntity {

    public static final int RADIUS_METERS = 100;

    @Id
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "auto_check_in", nullable = false)
    private boolean autoCheckIn;

    @Column(name = "window_start_minute")
    private Integer windowStartMinute;

    @Column(name = "window_end_minute")
    private Integer windowEndMinute;

    @Column(name = "radius_meters", nullable = false)
    private int radiusMeters = RADIUS_METERS;

    public static RollCallSetting offFor(UUID propertyId) {
        RollCallSetting setting = new RollCallSetting();
        setting.propertyId = propertyId;
        return setting;
    }

    public RollCallWindow window() {
        return RollCallWindow.of(windowStartMinute, windowEndMinute);
    }

    /** On only with a window: the switch cannot be on without one. */
    public boolean isOn() {
        return enabled && window() != null;
    }

    public void update(boolean enabled, boolean autoCheckIn, Integer windowStartMinute, Integer windowEndMinute) {
        this.enabled = enabled;
        this.autoCheckIn = autoCheckIn;
        this.windowStartMinute = windowStartMinute;
        this.windowEndMinute = windowEndMinute;
    }
}
