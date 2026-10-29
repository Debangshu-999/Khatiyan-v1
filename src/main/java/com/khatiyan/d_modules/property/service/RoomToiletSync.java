package com.khatiyan.d_modules.property.service;

import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.repository.RoomMoldRepository;
import com.khatiyan.d_modules.property.repository.RoomRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Re-sets the toilet on every room type and room of a property when its
 * bathroom type changes (user, 2026-10-29): attached becomes common, or the
 * other way, and nobody ticks it by hand.
 */
@Slf4j
@Component
public class RoomToiletSync {

    private final RoomRepository rooms;
    private final RoomMoldRepository molds;

    public RoomToiletSync(RoomRepository rooms, RoomMoldRepository molds) {
        this.rooms = rooms;
        this.molds = molds;
    }

    @Transactional
    public void sync(UUID propertyId, BathroomType bathroom) {
        molds.findByPropertyIdOrderBySharingTypeAscConditioningAscBedCountAsc(propertyId)
                .forEach(mold -> mold.matchToilet(bathroom));
        rooms.findByPropertyId(propertyId).forEach(room -> room.matchToilet(bathroom));
        log.info("Room toilets set from the bathroom type propertyId={} bathroom={}", propertyId, bathroom);
    }
}
