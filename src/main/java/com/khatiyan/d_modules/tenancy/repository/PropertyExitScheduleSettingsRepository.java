package com.khatiyan.d_modules.tenancy.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.tenancy.model.PropertyExitScheduleSettings;

public interface PropertyExitScheduleSettingsRepository
        extends JpaRepository<PropertyExitScheduleSettings, UUID> {

    Optional<PropertyExitScheduleSettings> findByPropertyId(UUID propertyId);
}
