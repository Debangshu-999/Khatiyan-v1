package com.khatiyan.d_modules.property.service;

import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.api.dto.ManagerLookupResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyManagerResponse;
import com.khatiyan.d_modules.property.event.ManagerAssignedEvent;
import com.khatiyan.d_modules.property.event.ManagerRemovedEvent;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.model.PropertyManager;
import com.khatiyan.d_modules.property.repository.PropertyManagerRepository;
import com.khatiyan.d_modules.property.repository.PropertyRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Application service for assigning manager users to owner properties.
 *
 * <p>Owners always manage their own properties. Managers need an active
 * assignment row in order to manage a property.
 */
@Slf4j
@Service
public class PropertyManagerService {

    private final PropertyService propertyService;
    private final PropertyRepository propertyRepository;
    private final PropertyManagerRepository propertyManagerRepository;
    private final AuthModule authModule;
    private final ApplicationEventPublisher eventPublisher;

    public PropertyManagerService(
            PropertyService propertyService,
            PropertyRepository propertyRepository,
            PropertyManagerRepository propertyManagerRepository,
            AuthModule authModule,
            ApplicationEventPublisher eventPublisher) {
        this.propertyService = propertyService;
        this.propertyRepository = propertyRepository;
        this.propertyManagerRepository = propertyManagerRepository;
        this.authModule = authModule;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Assigns a manager to an owner-owned property, provisioning the manager user
     * by phone if needed.
     */
    @Transactional
    public PropertyManagerResponse addManager(
            UUID ownerId,
            UUID propertyId,
            String managerPhone,
            String managerFullName) {
        Property property = propertyService.getOwnedActiveProperty(ownerId, propertyId);

        UUID managerUserId = authModule.provisionManagerUser(
                managerPhone,
                managerFullName,
                ownerId);

        if (property.getOwnerId().equals(managerUserId)) {
            throw new ValidationException("Owner cannot be assigned as manager");
        }

        if (propertyManagerRepository.existsByPropertyIdAndManagerUserIdAndActiveTrue(
                property.getId(),
                managerUserId)) {
            throw new ValidationException("Manager is already assigned to this property");
        }

        PropertyManager manager = PropertyManager.assign(
                property.getId(),
                managerUserId,
                ownerId);

        PropertyManager saved = propertyManagerRepository.save(manager);

        log.info(
                "Property manager assigned propertyId={} managerUserId={} ownerId={}",
                property.getId(),
                managerUserId,
                ownerId);

        eventPublisher.publishEvent(new ManagerAssignedEvent(
                property.getId(),
                managerUserId,
                ownerId));

        return toResponse(saved);
    }

    /**
     * Looks up a phone number before assignment so the owner can confirm who
     * they are adding, mirroring the tenant-lookup flow.
     */
    @Transactional(readOnly = true)
    public ManagerLookupResponse lookupManager(UUID ownerId, UUID propertyId, String phone) {
        Property property = propertyService.getOwnedActiveProperty(ownerId, propertyId);

        return authModule.findByPhone(phone)
                .map(user -> {
                    if (user.role() != UserRole.USER && user.role() != UserRole.OWNER) {
                        return new ManagerLookupResponse(true, user.fullName(), false, false,
                                "This phone belongs to an account that cannot be a manager.");
                    }
                    if (user.id().equals(property.getOwnerId())) {
                        return new ManagerLookupResponse(true, user.fullName(), false, false,
                                "This is the property owner.");
                    }
                    if (propertyManagerRepository.existsByPropertyIdAndManagerUserIdAndActiveTrue(property.getId(), user.id())) {
                        return new ManagerLookupResponse(true, user.fullName(), true, false,
                                "Already a manager of this property.");
                    }
                    return new ManagerLookupResponse(true, user.fullName(), false, true,
                            "Existing user — will be assigned as a manager.");
                })
                .orElseGet(() -> new ManagerLookupResponse(false, null, false, true,
                        "New user — an account will be created and assigned."));
    }

    /**
     * Lists active managers for an owner-owned property.
     */
    @Transactional(readOnly = true)
    public List<PropertyManagerResponse> listManagers(UUID ownerId, UUID propertyId) {
        Property property = propertyService.getOwnedActiveProperty(ownerId, propertyId);

        return propertyManagerRepository.findByPropertyIdAndActiveTrue(property.getId())
                .stream()
                .map(manager -> toResponse(manager))
                .toList();
    }

    /**
     * Lists active manager user ids for module-to-module notification delivery.
     */
    @Transactional(readOnly = true)
    public List<UUID> findActiveManagerUserIds(UUID propertyId) {
        return propertyManagerRepository.findActiveManagerUserIdsByPropertyId(propertyId);
    }

    /**
     * Moves a manager from one owner-owned property to another in a single
     * transaction — deactivates the current assignment and creates a new one.
     */
    @Transactional
    public PropertyManagerResponse shiftManager(
            UUID ownerId,
            UUID fromPropertyId,
            UUID managerUserId,
            UUID toPropertyId) {
        Property fromProperty = propertyService.getOwnedActiveProperty(ownerId, fromPropertyId);
        Property toProperty = propertyService.getOwnedActiveProperty(ownerId, toPropertyId);

        if (fromProperty.getId().equals(toProperty.getId())) {
            throw new ValidationException("Choose a different target property");
        }

        PropertyManager current = propertyManagerRepository
                .findByPropertyIdAndManagerUserIdAndActiveTrue(fromProperty.getId(), managerUserId)
                .orElseThrow(() -> new NotFoundException("PropertyManager_", managerUserId));

        if (toProperty.getOwnerId().equals(managerUserId)) {
            throw new ValidationException("Owner cannot be assigned as manager");
        }

        if (propertyManagerRepository.existsByPropertyIdAndManagerUserIdAndActiveTrue(toProperty.getId(), managerUserId)) {
            throw new ValidationException("Manager is already assigned to the target property");
        }

        current.deactivate();

        PropertyManager moved = PropertyManager.assign(toProperty.getId(), managerUserId, ownerId);
        PropertyManager saved = propertyManagerRepository.save(moved);

        log.info(
                "Property manager shifted fromPropertyId={} toPropertyId={} managerUserId={} ownerId={}",
                fromProperty.getId(),
                toProperty.getId(),
                managerUserId,
                ownerId);

        eventPublisher.publishEvent(new ManagerRemovedEvent(fromProperty.getId(), managerUserId, ownerId));
        eventPublisher.publishEvent(new ManagerAssignedEvent(toProperty.getId(), managerUserId, ownerId));

        return toResponse(saved);
    }

    /**
     * Removes a manager assignment from an owner-owned property.
     */
    @Transactional
    public void removeManager(UUID ownerId, UUID propertyId, UUID managerUserId) {
        Property property = propertyService.getOwnedActiveProperty(ownerId, propertyId);

        PropertyManager manager = propertyManagerRepository
                .findByPropertyIdAndManagerUserIdAndActiveTrue(property.getId(), managerUserId)
                .orElseThrow(() -> new NotFoundException("PropertyManager_", managerUserId));

        manager.deactivate();

        log.info(
                "Property manager removed propertyId={} managerUserId={} ownerId={}",
                property.getId(),
                managerUserId,
                ownerId);

        eventPublisher.publishEvent(new ManagerRemovedEvent(
                property.getId(),
                managerUserId,
                ownerId));
    }

    /**
     * Returns true when the actor owns the property or is actively assigned as a
     * manager.
     */
    @Transactional(readOnly = true)
    public boolean canManageProperty(UUID actorUserId, UUID propertyId) {
        if (propertyRepository.existsByIdAndOwnerIdAndActiveTrue(propertyId, actorUserId)) {
            return true;
        }

        return propertyManagerRepository.existsByPropertyIdAndManagerUserIdAndActiveTrue(
                propertyId,
                actorUserId);
    }

    /**
     * Throws when the actor cannot manage the property.
     */
    @Transactional(readOnly = true)
    public void ensureCanManageProperty(UUID actorUserId, UUID propertyId) {
        if (!canManageProperty(actorUserId, propertyId)) {
            throw new ForbiddenException("You cannot manage this property");
        }
    }

    private PropertyManagerResponse toResponse(PropertyManager manager) {
        UserSummaryResponse managerUser = authModule.findById(manager.getManagerUserId())
                .orElseThrow(() -> new NotFoundException("User_", manager.getManagerUserId()));

        return PropertyManagerResponse.from(manager, managerUser);
    }
}
