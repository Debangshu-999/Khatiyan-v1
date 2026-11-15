package com.khatiyan.d_modules.discovery.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.discovery.model.SavedProperty;
import com.khatiyan.d_modules.discovery.repository.SavedPropertyRepository;

/**
 * Saved properties (user, 2026-11-14): the bookmark on a property's profile
 * saves it for the signed-in person, and Saved properties lists them, newest
 * first. Saving twice and removing what was never saved are both no-ops, so a
 * double tap or a retry never errors.
 */
@Service
public class SavedPropertyService {

    private final SavedPropertyRepository savedProperties;
    private final PropertyDiscoveryService discovery;

    public SavedPropertyService(SavedPropertyRepository savedProperties, PropertyDiscoveryService discovery) {
        this.savedProperties = savedProperties;
        this.discovery = discovery;
    }

    /** Saves a listed property. Its own transaction, so a racing duplicate is simply ignored. */
    public void save(UUID userId, UUID propertyId) {
        if (!discovery.isVisible(propertyId)) {
            throw new NotFoundException("Property", propertyId);
        }
        if (savedProperties.existsByUserIdAndPropertyId(userId, propertyId)) {
            return;
        }
        try {
            savedProperties.saveAndFlush(SavedProperty.of(userId, propertyId));
        } catch (DataIntegrityViolationException alreadySaved) {
            // Two taps at once: the other one saved it.
        }
    }

    @Transactional
    public void remove(UUID userId, UUID propertyId) {
        savedProperties.deleteByUserIdAndPropertyId(userId, propertyId);
    }

    /** Every property this person saved, listed or not, for the bookmark's state. */
    @Transactional(readOnly = true)
    public List<UUID> savedPropertyIds(UUID userId) {
        return savedProperties.findPropertyIdsNewestFirst(userId);
    }

    /** The cards of the saved properties still listed, newest saved first, with distances from the point given. */
    @Transactional(readOnly = true)
    public List<PropertyDiscoveryCardResponse> list(UUID userId, BigDecimal latitude, BigDecimal longitude) {
        return discovery.cardsFor(savedProperties.findPropertyIdsNewestFirst(userId), latitude, longitude);
    }
}
