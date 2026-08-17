package com.khatiyan.d_modules.discovery.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Authorization chokepoint for the owner-facing half of discovery.
 *
 * <p>
 * Two different things live here and they belong to different permissions:
 *
 * <ul>
 *   <li>The <b>public listing</b> — headline, description, photos, and the
 *       publish toggle — is governed by
 *       {@link ManagerResource#PROPERTY_SETTINGS}, not by a discovery resource
 *       of its own. It is the outward-facing half of the property record, so
 *       whoever may edit the property may edit how it is advertised.</li>
 *   <li><b>Curated local places</b> are {@link ManagerResource#NEARBY_PLACES}.
 *       They are day-to-day upkeep rather than a change to the property.</li>
 * </ul>
 *
 * <p>
 * Tenant-facing discovery (browsing, searching, viewing a public profile)
 * authorizes on nothing here — a prospective tenant is not a manager.
 */
@Component
public class DiscoveryAccessPolicy {

    private final PropertyModule propertyModule;

    public DiscoveryAccessPolicy(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    public void ensureCanViewListing(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.PROPERTY_SETTINGS);
    }

    /** Editing listing content, publishing, or taking the listing down. */
    public void ensureCanManageListing(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.PROPERTY_SETTINGS);
    }

    public void ensureCanViewNearbyPlaces(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.NEARBY_PLACES);
    }

    public void ensureCanManageNearbyPlaces(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.NEARBY_PLACES);
    }
}
