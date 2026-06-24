package com.khatiyan.d_modules.property.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.property.model.RoomActivity;

/**
 * Persistence access for the append-only room activity feed.
 */
@Repository
public interface RoomActivityRepository extends JpaRepository<RoomActivity, UUID> {

    List<RoomActivity> findByPropertyIdOrderByOccurredAtDesc(UUID propertyId, Pageable pageable);
}
