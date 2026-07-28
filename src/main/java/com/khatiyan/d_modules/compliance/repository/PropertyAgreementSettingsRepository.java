package com.khatiyan.d_modules.compliance.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.compliance.model.PropertyAgreementSettings;

public interface PropertyAgreementSettingsRepository extends JpaRepository<PropertyAgreementSettings, UUID> {

    Optional<PropertyAgreementSettings> findByPropertyId(UUID propertyId);
}
