package com.khatiyan.d_modules.property.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.discovery.DiscoveryModule;
import com.khatiyan.d_modules.property.api.dto.CreatePropertyRequest;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyExitPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.UpdatePropertyExitPolicyRequest;
import com.khatiyan.d_modules.property.api.dto.UpdatePropertyRequest;
import com.khatiyan.d_modules.property.event.PropertyCreatedEvent;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.model.PropertyDamageCharge;
import com.khatiyan.d_modules.property.repository.PropertyManagerRepository;
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
    private final PropertyManagerRepository propertyManagerRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final DiscoveryModule discoveryModule;
    private final ReferenceCodeGenerator referenceCodeGenerator;

    public PropertyService(
            PropertyRepository propertyRepository,
            PropertyManagerRepository propertyManagerRepository,
            ApplicationEventPublisher eventPublisher,
            @Lazy DiscoveryModule discoveryModule,
            ReferenceCodeGenerator referenceCodeGenerator) {
        this.propertyRepository = propertyRepository;
        this.propertyManagerRepository = propertyManagerRepository;
        this.eventPublisher = eventPublisher;
        this.discoveryModule = discoveryModule;
        this.referenceCodeGenerator = referenceCodeGenerator;
    }

    /**
     * Loads an active property and verifies that it belongs to the given owner.
     */
    Property getOwnedActiveProperty(UUID ownerId, UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));

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
                referenceCodeGenerator.nextCode("PROP"),
                ownerId,
                request.name(),
                request.address(),
                request.area(),
                request.city(),
                request.state(),
                request.pincode(),
                request.latitude(),
                request.longitude(),
                request.type(),
                request.pgFor(),
                request.preferredFor(),
                request.foodIncluded(),
                request.includedMeals(),
                request.electricityIncluded(),
                request.bathroomType(),
                request.availableSharingTypes(),
                request.facilities(),
                request.customFacilities(),
                request.dailyGuestAcRatePaise(),
                request.dailyGuestNonAcRatePaise(),
                request.rentLateFeePerDayPaise(),
                request.rentGraceDays(),
                request.standardDepositPaise(),
                request.noticePeriod());

        Property saved = propertyRepository.save(property);
        log.info(
                "Property created propertyId={} ownerId={} name={} city={}",
                saved.getId(),
                ownerId,
                saved.getName(),
                saved.getCity());

        eventPublisher.publishEvent(new PropertyCreatedEvent(
                saved.getId(),
                ownerId,
                request.discoveryHeadline(),
                request.discoveryDescription(),
                request.discoveryProfileImageUrl(),
                toImageRefs(request.discoveryImages())));

        return PropertyResponse.from(saved);
    }

    /** Null-safe translation from the request shape to the event's. */
    private List<PropertyCreatedEvent.ImageRef> toImageRefs(List<CreatePropertyRequest.DiscoveryImage> images) {
        if (images == null || images.isEmpty()) {
            return List.of();
        }
        return images.stream()
                .map(image -> new PropertyCreatedEvent.ImageRef(image.url(), image.publicId()))
                .toList();
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
     * Lists every active property the user can operate — owned properties plus
     * properties where the user is an active manager. Powers the unified owner /
     * manager workspace.
     */
    @Transactional(readOnly = true)
    public List<PropertyResponse> listManageableProperties(UUID userId) {
        Map<UUID, Property> byId = new LinkedHashMap<>();
        for (Property property : propertyRepository.findByOwnerIdAndActiveTrue(userId)) {
            byId.put(property.getId(), property);
        }

        List<UUID> managedIds = propertyManagerRepository.findActivePropertyIdsByManagerUserId(userId);
        if (!managedIds.isEmpty()) {
            for (Property property : propertyRepository.findByIdInAndActiveTrue(managedIds)) {
                byId.putIfAbsent(property.getId(), property);
            }
        }

        return byId.values().stream()
                .map(property -> PropertyResponse.from(property))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PropertyResponse> listActiveProperties() {
        return propertyRepository.findByActiveTrue()
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
                .orElseThrow(() -> new NotFoundException("Property", propertyId));

        return PropertyResponse.from(property);
    }

    /**
     * Returns the current billing policy that future billing cycles should
     * snapshot for this property.
     */
    @Transactional(readOnly = true)
    public PropertyBillingPolicyResponse getBillingPolicy(UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));

        return PropertyBillingPolicyResponse.from(property);
    }

    /**
     * Returns a property's exit policies (damage schedule + move-out checklist)
     * for internal module reads — the compliance assembler and deposit settlement.
     */
    @Transactional(readOnly = true)
    public PropertyExitPolicyResponse getExitPolicy(UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));

        return PropertyExitPolicyResponse.from(property);
    }

    /**
     * Replaces a property's exit policies.
     *
     * <p>
     * Unlike the rest of property configuration this is NOT owner-scoped: exit
     * policies are governed by {@code TENANCY_RULES}, so a manager granted that
     * at MANAGE may edit them. The caller has already authorized; this only
     * loads the property.
     */
    @Transactional
    public PropertyExitPolicyResponse updateExitPolicies(
            UUID actorUserId, UUID propertyId, UpdatePropertyExitPolicyRequest request) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));

        List<PropertyDamageCharge> damageCharges = request.damageCharges() == null
                ? List.of()
                : request.damageCharges().stream()
                        .map(input -> PropertyDamageCharge.of(input.name(), input.chargePaise()))
                        .toList();

        property.updateExitPolicies(damageCharges, request.exitChecklist(), request.prematureExitPolicy());

        log.info(
                "Property exit policies updated propertyId={} actorUserId={} damageCharges={} checklistItems={}",
                propertyId,
                actorUserId,
                damageCharges.size(),
                property.getExitChecklist().size());

        return PropertyExitPolicyResponse.from(property);
    }

    /**
     * Updates editable details on an owner-owned property.
     */
    @Transactional
    public PropertyResponse updateProperty(UUID actorUserId, UUID propertyId, UpdatePropertyRequest request) {
        // NOT owner-scoped: a manager holding PROPERTY_SETTINGS at MANAGE may
        // edit the property. The caller has already authorized; this only loads.
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));

        property.updateDetails(
                request.name(),
                request.address(),
                request.area(),
                request.city(),
                request.state(),
                request.pincode(),
                request.latitude(),
                request.longitude(),
                request.type(),
                request.pgFor(),
                request.preferredFor(),
                request.foodIncluded(),
                request.includedMeals(),
                request.electricityIncluded(),
                request.bathroomType(),
                request.availableSharingTypes(),
                request.facilities(),
                request.customFacilities(),
                request.dailyGuestAcRatePaise(),
                request.dailyGuestNonAcRatePaise(),
                request.rentLateFeePerDayPaise(),
                request.rentGraceDays(),
                request.standardDepositPaise(),
                request.noticePeriod());

        log.info(
                "Property updated propertyId={} actorUserId={} name={} city={}",
                propertyId,
                actorUserId,
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
        discoveryModule.unlistPropertyProfileForDeactivation(propertyId);
        property.deactivate();

        log.info("Property deactivated propertyId={} ownerId={}", propertyId, ownerId);
    }

    @Transactional
    public void markDiscoveryProfileCreated(UUID propertyId) {
        Property property = propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));

        property.markDiscoveryProfileCreated();
        propertyRepository.save(property);
        log.info("Property discovery profile marked created propertyId={}", propertyId);
    }

}
