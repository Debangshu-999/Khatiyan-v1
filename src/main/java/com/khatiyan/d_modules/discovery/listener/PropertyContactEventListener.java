package com.khatiyan.d_modules.discovery.listener;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.discovery.service.PropertyContactService;
import com.khatiyan.d_modules.property.event.ManagerRemovedEvent;

import lombok.extern.slf4j.Slf4j;

/**
 * Takes a manager off the listing when they stop managing the property.
 *
 * <p>A contact entry is a published phone number. Left behind after someone is
 * removed, the listing keeps advertising a person who no longer works there —
 * and the owner has no obvious reason to go looking for it, because they removed
 * the manager and consider the job done.
 *
 * <p>Reacting to the event rather than calling from the property module: contact
 * selection lives in discovery, and discovery already reads property. The
 * reverse would close a module cycle.
 */
@Slf4j
@Component
public class PropertyContactEventListener {

    private final PropertyContactService propertyContactService;

    public PropertyContactEventListener(PropertyContactService propertyContactService) {
        this.propertyContactService = propertyContactService;
    }

    /**
     * {@code @ApplicationModuleListener} is at-least-once, so this has to be
     * idempotent — removing a contact that is already gone does nothing.
     */
    @ApplicationModuleListener
    public void onManagerRemoved(ManagerRemovedEvent event) {
        propertyContactService.removeManagerFromAllContacts(event.propertyId(), event.managerUserId());
    }
}
