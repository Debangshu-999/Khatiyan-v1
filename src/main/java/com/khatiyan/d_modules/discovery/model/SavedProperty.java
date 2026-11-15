package com.khatiyan.d_modules.discovery.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A property someone saved from its listing (user, 2026-11-14), with the
 * bookmark on the profile. Nothing but the pair and when: the card shown on
 * the Saved properties screen is read live, so it is never stale.
 */
@Entity
@Table(name = "saved_properties", schema = "discovery")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SavedProperty extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    public static SavedProperty of(UUID userId, UUID propertyId) {
        SavedProperty saved = new SavedProperty();
        saved.id = UUID.randomUUID();
        saved.userId = userId;
        saved.propertyId = propertyId;
        return saved;
    }
}
