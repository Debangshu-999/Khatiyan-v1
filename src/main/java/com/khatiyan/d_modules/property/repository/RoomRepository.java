package com.khatiyan.d_modules.property.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.property.model.Room;
import com.khatiyan.d_modules.property.model.RoomStatus;

/**
 * Persistence access for rooms inside a property.
 *
 * <p>Room numbers are unique only among active rooms in the same property.
 * This repository keeps service code readable while the database enforces
 * the final uniqueness guarantee through a partial unique index.
 */
@Repository
public interface RoomRepository extends JpaRepository<Room, UUID> {

    Optional<Room> findByIdAndActiveTrue(UUID id);

    Optional<Room> findByIdAndPropertyIdAndActiveTrue(UUID id, UUID propertyId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        SELECT r FROM Room r
        WHERE r.id = :roomId
          AND r.propertyId = :propertyId
          AND r.active = true
    """)
    Optional<Room> findActiveRoomForUpdate(
        @Param("propertyId") UUID propertyId,
        @Param("roomId") UUID roomId
    );

    List<Room> findByPropertyIdAndActiveTrue(UUID propertyId);

    List<Room> findByPropertyIdAndStatusAndActiveTrue(UUID propertyId, RoomStatus status);

    boolean existsByPropertyIdAndRoomNumberAndActiveTrue(UUID propertyId, String roomNumber);

    boolean existsByPropertyIdAndRoomNumberAndActiveTrueAndIdNot(
        UUID propertyId,
        String roomNumber,
        UUID id
    );

    @Query("""
        SELECT r.roomNumber FROM Room r
        WHERE r.propertyId = :propertyId
          AND r.active = true
          AND r.roomNumber IN :roomNumbers
    """)
    List<String> findActiveRoomNumbers(
        @Param("propertyId") UUID propertyId,
        @Param("roomNumbers") Collection<String> roomNumbers
    );
}
