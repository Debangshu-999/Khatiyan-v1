package com.khatiyan.d_modules.property.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.property.api.dto.CreatePropertyRequest;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.UpdatePropertyRequest;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.repository.PropertyRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Application service for owner-managed properties.
 *
 * <p>
 * This service owns property registration, property listing, property
 * deactivation, and owner-scoped property access checks. Room behavior
 * belongs to {@code RoomService}.
 */
@Slf4j
@Service
public class PropertyService {

    private final PropertyRepository propertyRepository;

    public PropertyService(PropertyRepository propertyRepository) {
        this.propertyRepository = propertyRepository;
    }

    /**
     * Loads an active property and verifies that it belongs to the given owner.
     */
    Property getOwnedActiveProperty(UUID ownerId, UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property_", propertyId));

        if (!property.getOwnerId().equals(ownerId)) {
            throw new ForbiddenException("You do not own this property");
        }

        return property;
    }

    /**
     * Registers a new property under the authenticated owner.
     */
    @Transactional
    public PropertyResponse createProperty(UUID ownerId, CreatePropertyRequest request) {
        Property property = Property.create(
                ownerId,
                request.name(),
                request.address(),
                request.city(),
                request.pincode(),
                request.latitude(),
                request.longitude(),
                request.type(),
                request.facilities(),
                request.customFacilities(),
                request.dailyGuestAcRatePaise(),
                request.dailyGuestNonAcRatePaise(),
                request.rentLateFeePerDayPaise(),
                request.rentGraceDays(),
                request.standardDepositPaise(),
                request.noticePeriodDays());

        Property saved = propertyRepository.save(property);
        log.info(
                "Property created propertyId={} ownerId={} name={} city={}",
                saved.getId(),
                ownerId,
                saved.getName(),
                saved.getCity());

        return PropertyResponse.from(saved);
    }

    /**
     * Lists all active properties owned by the authenticated owner.
     */
    @Transactional(readOnly = true)
    public List<PropertyResponse> listOwnerProperties(UUID ownerId) {
        return propertyRepository.findByOwnerIdAndActiveTrue(ownerId)
                .stream()
                .map(property -> PropertyResponse.from(property))
                .toList();
    }

    /**
     * Returns one active property after verifying owner access.
     */
    @Transactional(readOnly = true)
    public PropertyResponse getOwnerProperty(UUID ownerId, UUID propertyId) {
        Property property = getOwnedActiveProperty(ownerId, propertyId);
        return PropertyResponse.from(property);
    }

    /**
     * Returns an active property summary for internal module read models.
     */
    @Transactional(readOnly = true)
    public PropertyResponse getActiveProperty(UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property_", propertyId));

        return PropertyResponse.from(property);
    }

    /**
     * Returns the current billing policy that future billing cycles should
     * snapshot for this property.
     */
    @Transactional(readOnly = true)
    public PropertyBillingPolicyResponse getBillingPolicy(UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property_", propertyId));

        return PropertyBillingPolicyResponse.from(property);
    }

    /**
     * Updates editable details on an owner-owned property.
     */
    @Transactional
    public PropertyResponse updateProperty(UUID ownerId, UUID propertyId, UpdatePropertyRequest request) {
        Property property = getOwnedActiveProperty(ownerId, propertyId);

        property.updateDetails(
                request.name(),
                request.address(),
                request.city(),
                request.pincode(),
                request.latitude(),
                request.longitude(),
                request.type(),
                request.facilities(),
                request.customFacilities(),
                request.dailyGuestAcRatePaise(),
                request.dailyGuestNonAcRatePaise(),
                request.rentLateFeePerDayPaise(),
                request.rentGraceDays(),
                request.standardDepositPaise(),
                request.noticePeriodDays());

        log.info(
                "Property updated propertyId={} ownerId={} name={} city={}",
                propertyId,
                ownerId,
                property.getName(),
                property.getCity());

        return PropertyResponse.from(property);
    }

    /**
     * Soft-deactivates an owner-owned property.
     */
    @Transactional
    public void deactivateProperty(UUID ownerId, UUID propertyId) {
        Property property = getOwnedActiveProperty(ownerId, propertyId);
        property.deactivate();

        log.info("Property deactivated propertyId={} ownerId={}", propertyId, ownerId);
    }

}
