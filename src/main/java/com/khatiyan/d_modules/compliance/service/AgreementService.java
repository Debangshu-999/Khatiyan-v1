package com.khatiyan.d_modules.compliance.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import com.khatiyan.d_modules.compliance.model.PropertyAgreementSettings;
import com.khatiyan.d_modules.compliance.repository.PropertyAgreementSettingsRepository;

/**
 * Authoring side of tenancy agreements: the per-property default clause set and
 * agreement mode. Per-tenancy instances + acceptance are added in the next
 * increment.
 */
@Service
public class AgreementService {

    private final PropertyAgreementSettingsRepository propertySettingsRepository;
    private final ComplianceAccessPolicy complianceAccessPolicy;

    public AgreementService(
            PropertyAgreementSettingsRepository propertySettingsRepository,
            ComplianceAccessPolicy complianceAccessPolicy) {
        this.propertySettingsRepository = propertySettingsRepository;
        this.complianceAccessPolicy = complianceAccessPolicy;
    }

    /**
     * Owner view of a property's agreement settings; seeds the sensible starter
     * clause set (mode OFF) on first access so the owner never starts blank.
     */
    @Transactional
    public PropertyAgreementSettings getOrSeedPropertySettings(UUID actorUserId, UUID propertyId) {
        // VIEW, even though this seeds on first access: the seed is starter
        // defaults so the screen is never blank, not a policy the actor chose.
        complianceAccessPolicy.ensureCanViewRules(actorUserId, propertyId);
        return propertySettingsRepository.findByPropertyId(propertyId)
            .orElseGet(() -> propertySettingsRepository.save(
                PropertyAgreementSettings.create(propertyId, AgreementTemplate.starter())));
    }

    @Transactional
    public PropertyAgreementSettings updatePropertySettings(
            UUID actorUserId, UUID propertyId, AgreementTemplate template) {
        complianceAccessPolicy.ensureCanManageRules(actorUserId, propertyId);
        PropertyAgreementSettings settings = propertySettingsRepository.findByPropertyId(propertyId).orElse(null);
        if (settings == null) {
            settings = PropertyAgreementSettings.create(propertyId, template);
        } else {
            settings.update(template);
        }
        return propertySettingsRepository.save(settings);
    }
}
