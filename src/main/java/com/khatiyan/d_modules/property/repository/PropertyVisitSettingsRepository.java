package com.khatiyan.d_modules.property.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.property.model.PropertyVisitSettings;

public interface PropertyVisitSettingsRepository extends JpaRepository<PropertyVisitSettings, UUID> {

    Optional<PropertyVisitSettings> findByPropertyId(UUID propertyId);

    boolean existsByPropertyId(UUID propertyId);
}
