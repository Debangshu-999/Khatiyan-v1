package com.khatiyan.d_modules.property.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.api.dto.RoomConditionWrite;
import com.khatiyan.d_modules.property.api.dto.RoomItemConditionResponse;
import com.khatiyan.d_modules.property.model.DamageLevel;
import com.khatiyan.d_modules.property.model.RoomItemCondition;
import com.khatiyan.d_modules.property.repository.RoomItemConditionRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Each room's running item condition (2026-10-29). Unguarded: callers are the
 * guarded property endpoint and the onboarding and damage-record services,
 * which check their own access first.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RoomConditionService {

    private final RoomItemConditionRepository repository;

    @Transactional(readOnly = true)
    public List<RoomItemConditionResponse> list(UUID roomId) {
        return repository.findByRoomIdOrderByItemNameAsc(roomId).stream()
                .map(RoomItemConditionResponse::from)
                .toList();
    }

    /** A move-in checklist: every item set exactly as confirmed. */
    @Transactional
    public void applyMoveIn(UUID roomId, UUID actorUserId, List<RoomConditionWrite> items) {
        if (items == null) {
            return;
        }
        for (RoomConditionWrite item : items) {
            RoomItemCondition condition = findOrCreate(roomId, item.itemName(), item.section());
            condition.set(item.level(), item.photoUrls(), actorUserId);
            repository.save(condition);
        }
        log.info("Room condition set from a move-in checklist roomId={} items={}", roomId, items.size());
    }

    /** A damage: the worse of the two levels, the new photos. Returns the level before. */
    @Transactional
    public DamageLevel raise(UUID roomId, UUID actorUserId, String itemName, String section,
            DamageLevel level, List<String> photoUrls) {
        RoomItemCondition condition = findOrCreate(roomId, itemName, section);
        DamageLevel before = condition.getDamageLevel();
        condition.raise(level, photoUrls, actorUserId);
        repository.save(condition);
        return before;
    }

    /** A repair or replacement: the level and photos set exactly. */
    @Transactional
    public void reset(UUID roomId, UUID actorUserId, String itemName, String section,
            DamageLevel level, List<String> photoUrls) {
        RoomItemCondition condition = findOrCreate(roomId, itemName, section);
        condition.set(level, photoUrls, actorUserId);
        repository.save(condition);
    }

    private RoomItemCondition findOrCreate(UUID roomId, String itemName, String section) {
        String key = RoomItemCondition.keyOf(itemName);
        if (key.isEmpty()) {
            throw new ValidationException("Name the item");
        }
        return repository.findByRoomIdAndItemKey(roomId, key)
                .map(existing -> {
                    existing.rename(itemName, section);
                    return existing;
                })
                .orElseGet(() -> RoomItemCondition.create(roomId, itemName, section));
    }
}
