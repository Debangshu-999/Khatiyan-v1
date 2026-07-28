package com.khatiyan.d_modules.compliance.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementMode;
import com.khatiyan.d_modules.compliance.model.PropertyAgreementSettings;
import com.khatiyan.d_modules.compliance.repository.PropertyAgreementSettingsRepository;
import com.khatiyan.d_modules.property.PropertyModule;

/**
 * Authoring side of tenancy agreements: the per-property default clause set and
 * agreement mode. Per-tenancy instances + acceptance are added in the next
 * increment.
 */
@Service
public class AgreementService {

    private final PropertyAgreementSettingsRepository propertySettingsRepository;
    private final PropertyModule propertyModule;

    public AgreementService(
            PropertyAgreementSettingsRepository propertySettingsRepository,
            PropertyModule propertyModule) {
        this.propertySettingsRepository = propertySettingsRepository;
        this.propertyModule = propertyModule;
    }

    /**
     * Owner view of a property's agreement settings; seeds the sensible starter
     * clause set (mode OFF) on first access so the owner never starts blank.
     */
    @Transactional
    public PropertyAgreementSettings getOrSeedPropertySettings(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        return propertySettingsRepository.findByPropertyId(propertyId)
            .orElseGet(() -> propertySettingsRepository.save(
                PropertyAgreementSettings.create(propertyId, AgreementMode.OFF, AgreementDefaults.starterClauses())));
    }

    @Transactional
    public PropertyAgreementSettings updatePropertySettings(
            UUID actorUserId, UUID propertyId, AgreementMode mode, List<AgreementClause> defaultClauses) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        PropertyAgreementSettings settings = propertySettingsRepository.findByPropertyId(propertyId).orElse(null);
        if (settings == null) {
            settings = PropertyAgreementSettings.create(propertyId, mode, defaultClauses);
        } else {
            settings.update(mode, defaultClauses);
        }
        return propertySettingsRepository.save(settings);
    }
}
