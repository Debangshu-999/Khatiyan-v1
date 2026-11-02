package com.khatiyan.d_modules.property.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.property.model.RoomItemCondition;

@Repository
public interface RoomItemConditionRepository extends JpaRepository<RoomItemCondition, UUID> {

    List<RoomItemCondition> findByRoomIdOrderByItemNameAsc(UUID roomId);

    Optional<RoomItemCondition> findByRoomIdAndItemKey(UUID roomId, String itemKey);
}
