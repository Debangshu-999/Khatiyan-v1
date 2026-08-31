package com.khatiyan.d_modules.property.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomMold;
import com.khatiyan.d_modules.property.model.RoomType;

@Repository
public interface RoomMoldRepository extends JpaRepository<RoomMold, UUID> {

    List<RoomMold> findByPropertyIdOrderBySharingTypeAscConditioningAscBedCountAsc(UUID propertyId);

    List<RoomMold> findByPropertyIdAndActiveTrueOrderBySharingTypeAscConditioningAscBedCountAsc(UUID propertyId);

    Optional<RoomMold> findByIdAndPropertyId(UUID id, UUID propertyId);

    /** The uniqueness the shape index enforces, checked before the insert so the refusal can be read. */
    boolean existsByPropertyIdAndSharingTypeAndConditioningAndBedCount(
            UUID propertyId, RoomType sharingType, RoomConditioning conditioning, int bedCount);

    long countByPropertyIdAndActiveTrue(UUID propertyId);
}
