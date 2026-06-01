package com.khatiyan.d_modules.discovery.listener;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.discovery.service.PropertyDiscoveryService;
import com.khatiyan.d_modules.property.event.PropertyCreatedEvent;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class PropertyDiscoveryProfileEventListener {

    private final PropertyDiscoveryService propertyDiscoveryService;

    public PropertyDiscoveryProfileEventListener(PropertyDiscoveryService propertyDiscoveryService) {
        this.propertyDiscoveryService = propertyDiscoveryService;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void createDraftDiscoveryProfile(PropertyCreatedEvent event) {
        try {
            propertyDiscoveryService.createDraftProfileAfterPropertyCreation(
                    event.propertyId(),
                    event.discoveryHeadline(),
                    event.discoveryDescription(),
                    event.discoveryProfileImageUrl());
            log.info("Draft discovery profile created after property commit propertyId={} ownerId={}",
                    event.propertyId(),
                    event.ownerId());
        } catch (RuntimeException exception) {
            log.error("Draft discovery profile creation failed after property commit propertyId={} ownerId={}",
                    event.propertyId(),
                    event.ownerId(),
                    exception);
        }
    }
}
