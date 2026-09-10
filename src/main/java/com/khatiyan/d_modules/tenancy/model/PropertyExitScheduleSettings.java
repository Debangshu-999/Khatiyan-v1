package com.khatiyan.d_modules.tenancy.model;

import java.time.LocalTime;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Per-property clock time used by configured tenancy exits. */
@Entity
@Table(name = "property_exit_schedule_settings", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyExitScheduleSettings extends BaseEntity {

    public static final LocalTime DEFAULT_EXECUTION_TIME = LocalTime.of(0, 10);

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, unique = true, updatable = false)
    private UUID propertyId;

    @Column(name = "execution_time", nullable = false)
    private LocalTime executionTime;

    public static PropertyExitScheduleSettings create(UUID propertyId, LocalTime executionTime) {
        PropertyExitScheduleSettings settings = new PropertyExitScheduleSettings();
        settings.id = UUID.randomUUID();
        settings.propertyId = propertyId;
        settings.executionTime = normalize(executionTime);
        return settings;
    }

    public void update(LocalTime executionTime) {
        this.executionTime = normalize(executionTime);
    }

    private static LocalTime normalize(LocalTime executionTime) {
        LocalTime value = executionTime != null ? executionTime : DEFAULT_EXECUTION_TIME;
        return value.withSecond(0).withNano(0);
    }
}
