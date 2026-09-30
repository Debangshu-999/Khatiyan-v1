package com.khatiyan.d_modules.property.service;

import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.d_modules.property.api.dto.PropertyVisitSlotsResponse;
import com.khatiyan.d_modules.property.api.dto.SaveVisitSlotsRequest;
import com.khatiyan.d_modules.property.model.ManagerResource;
import com.khatiyan.d_modules.property.model.PropertyVisitSettings;
import com.khatiyan.d_modules.property.model.PropertyVisitSettings.SlotTimes;
import com.khatiyan.d_modules.property.repository.PropertyRepository;
import com.khatiyan.d_modules.property.repository.PropertyVisitSettingsRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * A property's visit slots (user, 2026-09-30): the times tenants can book a
 * visit, set per day of the week, and how many visitors one slot takes.
 *
 * <p>Edited under PROPERTY_SETTINGS: the owner, and managers with that access.
 *
 * <p><b>Stale edits.</b> The first setup has no version to send, so it is its
 * own call, refused as stale if someone else set the slots up first. Every
 * later change, a save or clearing days, sends the version the screen loaded
 * and is refused with 409 STALE if it moved. Each reply is flushed first, so
 * it carries the new version and the screen can chain its next save.
 */
@Slf4j
@Service
@Transactional
public class PropertyVisitSlotService {

    private final PropertyRepository propertyRepository;
    private final PropertyVisitSettingsRepository settingsRepository;
    private final ManagerAccessPolicy managerAccessPolicy;

    public PropertyVisitSlotService(
            PropertyRepository propertyRepository,
            PropertyVisitSettingsRepository settingsRepository,
            ManagerAccessPolicy managerAccessPolicy) {
        this.propertyRepository = propertyRepository;
        this.settingsRepository = settingsRepository;
        this.managerAccessPolicy = managerAccessPolicy;
    }

    @Transactional(readOnly = true)
    public PropertyVisitSlotsResponse get(UUID actorUserId, UUID propertyId) {
        managerAccessPolicy.ensureCanView(actorUserId, propertyId, ManagerResource.PROPERTY_SETTINGS);
        requireProperty(propertyId);
        return settingsRepository.findByPropertyId(propertyId)
                .map(PropertyVisitSlotsResponse::from)
                .orElseGet(() -> PropertyVisitSlotsResponse.notSetUp(propertyId));
    }

    /** The first slots. Refused as stale if someone else has set them up since the screen loaded. */
    public PropertyVisitSlotsResponse create(UUID actorUserId, UUID propertyId, SaveVisitSlotsRequest request) {
        managerAccessPolicy.ensureCanManage(actorUserId, propertyId, ManagerResource.PROPERTY_SETTINGS);
        requireProperty(propertyId);
        if (settingsRepository.existsByPropertyId(propertyId)) {
            throw new StaleVersionException();
        }

        PropertyVisitSettings settings = PropertyVisitSettings.create(propertyId);
        settings.replaceDays(request.days(), times(request), request.visitorsPerSlot());
        try {
            settings = settingsRepository.saveAndFlush(settings);
        } catch (DataIntegrityViolationException raced) {
            // Two first setups at the same moment: the one-row-per-property
            // constraint lets one in, and the other is told to refresh.
            throw new StaleVersionException();
        }

        log.info("Visit slots set up propertyId={} actorUserId={} days={} slotsPerDay={}",
                propertyId, actorUserId, request.days().size(), request.slots().size());
        return PropertyVisitSlotsResponse.from(settings);
    }

    /** These days take exactly these slots, replacing what they had. Needs the version the screen loaded. */
    public PropertyVisitSlotsResponse save(UUID actorUserId, UUID propertyId, SaveVisitSlotsRequest request) {
        managerAccessPolicy.ensureCanManage(actorUserId, propertyId, ManagerResource.PROPERTY_SETTINGS);
        PropertyVisitSettings settings = requireSettings(propertyId);
        VersionGuard.claim(settings);

        settings.replaceDays(request.days(), times(request), request.visitorsPerSlot());
        settings = settingsRepository.saveAndFlush(settings);

        log.info("Visit slots saved propertyId={} actorUserId={} days={} slotsPerDay={}",
                propertyId, actorUserId, request.days().size(), request.slots().size());
        return PropertyVisitSlotsResponse.from(settings);
    }

    /** These days take no visits. Needs the version the screen loaded. */
    public PropertyVisitSlotsResponse clearDays(UUID actorUserId, UUID propertyId, Set<DayOfWeek> days) {
        managerAccessPolicy.ensureCanManage(actorUserId, propertyId, ManagerResource.PROPERTY_SETTINGS);
        PropertyVisitSettings settings = requireSettings(propertyId);
        VersionGuard.claim(settings);

        settings.clearDays(days);
        settings = settingsRepository.saveAndFlush(settings);

        log.info("Visit days cleared propertyId={} actorUserId={} days={}", propertyId, actorUserId, days);
        return PropertyVisitSlotsResponse.from(settings);
    }

    private static List<SlotTimes> times(SaveVisitSlotsRequest request) {
        return request.slots().stream()
                .map(slot -> new SlotTimes(slot.startTime(), slot.endTime()))
                .toList();
    }

    private void requireProperty(UUID propertyId) {
        propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));
    }

    private PropertyVisitSettings requireSettings(UUID propertyId) {
        requireProperty(propertyId);
        return settingsRepository.findByPropertyId(propertyId)
                .orElseThrow(() -> new NotFoundException("Visit slots", propertyId));
    }
}
