package com.khatiyan.d_modules.discovery.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.discovery.api.dto.PropertyContactResponse;
import com.khatiyan.d_modules.discovery.model.PropertyContactManager;
import com.khatiyan.d_modules.discovery.repository.PropertyContactManagerRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Who a listing says to call.
 *
 * <p>The owner is always first and is not stored — every property has exactly
 * one, they are always reachable, and a row for them would allow a listing with
 * no contact at all. Managers are chosen from the property's active managers and
 * can be taken off again.
 *
 * <p>Being a contact is not a permission. It says a prospect may call this
 * person; it says nothing about what they can do inside the app.
 */
@Slf4j
@Service
public class PropertyContactService {

    private final PropertyContactManagerRepository contactRepository;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final DiscoveryAccessPolicy discoveryAccessPolicy;

    public PropertyContactService(
            PropertyContactManagerRepository contactRepository,
            PropertyModule propertyModule,
            AuthModule authModule,
            DiscoveryAccessPolicy discoveryAccessPolicy) {
        this.contactRepository = contactRepository;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.discoveryAccessPolicy = discoveryAccessPolicy;
    }

    @Transactional(readOnly = true)
    public List<PropertyContactResponse> listManagedContacts(UUID actorUserId, UUID propertyId) {
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);
        return listContacts(propertyId);
    }

    /**
     * The owner, then every listed manager in the order they were added.
     *
     * <p>Unauthenticated: the public profile reads this too, and the caller has
     * already established whether the property is visible.
     */
    @Transactional(readOnly = true)
    public List<PropertyContactResponse> listContacts(UUID propertyId) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        List<PropertyContactResponse> contacts = new ArrayList<>();

        authModule.findById(property.ownerId())
                .map(owner -> toResponse(owner, true))
                .ifPresent(contacts::add);

        for (PropertyContactManager listed : contactRepository.findByPropertyIdOrderByCreatedAtAsc(propertyId)) {
            authModule.findById(listed.getManagerUserId())
                    .map(manager -> toResponse(manager, false))
                    .ifPresent(contacts::add);
        }

        return contacts;
    }

    @Transactional
    public List<PropertyContactResponse> addManagerContact(UUID actorUserId, UUID propertyId, UUID managerUserId) {
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);

        // Only somebody who actually manages this property. Without this the
        // endpoint would publish any user's phone number on any listing.
        if (!propertyModule.findActiveManagerUserIds(propertyId).contains(managerUserId)) {
            throw new ValidationException("That person does not manage this property");
        }

        // Adding the same manager twice is a no-op, not an error: the button is
        // gone from the picker by then, so a second call is a stale tap rather
        // than a mistake worth interrupting anyone over.
        if (!contactRepository.existsByPropertyIdAndManagerUserId(propertyId, managerUserId)) {
            contactRepository.save(PropertyContactManager.of(propertyId, managerUserId));
            log.info("Property contact added propertyId={} managerUserId={} actorUserId={}",
                    propertyId, managerUserId, actorUserId);
        }

        return listContacts(propertyId);
    }

    @Transactional
    public List<PropertyContactResponse> removeManagerContact(UUID actorUserId, UUID propertyId, UUID managerUserId) {
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);

        PropertyContactManager listed = contactRepository
                .findByPropertyIdAndManagerUserId(propertyId, managerUserId)
                .orElseThrow(() -> new NotFoundException("Property contact", managerUserId));

        contactRepository.delete(listed);
        log.info("Property contact removed propertyId={} managerUserId={} actorUserId={}",
                propertyId, managerUserId, actorUserId);

        return listContacts(propertyId);
    }

    /**
     * Drops a manager's contact entry when they stop managing the property.
     *
     * <p>No access check and no failure if there is nothing to drop: this runs
     * from the removal that already checked its own actor, and a manager who was
     * never a contact is the ordinary case.
     */
    @Transactional
    public void removeManagerFromAllContacts(UUID propertyId, UUID managerUserId) {
        contactRepository.findByPropertyIdAndManagerUserId(propertyId, managerUserId)
                .ifPresent(listed -> {
                    contactRepository.delete(listed);
                    log.info("Property contact cleared with manager removal propertyId={} managerUserId={}",
                            propertyId, managerUserId);
                });
    }

    private PropertyContactResponse toResponse(UserSummaryResponse user, boolean owner) {
        return new PropertyContactResponse(
                user.id(),
                user.fullName(),
                user.phone(),
                // Verified only — an unverified address is one nobody has proved
                // they can read, so offering it invites a message into a void.
                user.emailVerified() ? user.email() : null,
                owner);
    }
}
