package com.khatiyan.d_modules.discovery.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "property_discovery_profiles", schema = "discovery")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyDiscoveryProfile extends BaseEntity {

    private static final int MAX_HEADLINE_LENGTH = 160;
    private static final int MAX_DESCRIPTION_LENGTH = 1000;
    private static final int MAX_URL_LENGTH = 600;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, unique = true)
    private UUID propertyId;

    @Column(nullable = false, length = MAX_HEADLINE_LENGTH)
    private String headline;

    @Column(nullable = false, length = MAX_DESCRIPTION_LENGTH)
    private String description;

    @Column(name = "profile_image_url", length = MAX_URL_LENGTH)
    private String profileImageUrl;

    @Column(name = "public_visible", nullable = false)
    private boolean publicVisible;

    @Column(name = "show_owner_contact", nullable = false)
    private boolean showOwnerContact;

    @Column(name = "show_manager_contact", nullable = false)
    private boolean showManagerContact;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private PropertyDiscoveryProfile(UUID propertyId, String headline, String description, String profileImageUrl) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.headline = normalizeRequired(headline, MAX_HEADLINE_LENGTH, "Headline");
        this.description = normalizeRequired(description, MAX_DESCRIPTION_LENGTH, "Description");
        this.profileImageUrl = normalizeNullable(profileImageUrl, MAX_URL_LENGTH, "Profile image URL");
        this.showOwnerContact = true;
        this.showManagerContact = true;
        this.active = true;
    }

    public static PropertyDiscoveryProfile createDraft(
            UUID propertyId,
            String headline,
            String description,
            String profileImageUrl) {
        return new PropertyDiscoveryProfile(propertyId, headline, description, profileImageUrl);
    }

    public void update(String headline, String description, String profileImageUrl,
                       Boolean showOwnerContact, Boolean showManagerContact) {
        this.headline = normalizeRequired(headline, MAX_HEADLINE_LENGTH, "Headline");
        this.description = normalizeRequired(description, MAX_DESCRIPTION_LENGTH, "Description");
        this.profileImageUrl = normalizeNullable(profileImageUrl, MAX_URL_LENGTH, "Profile image URL");

        if (showOwnerContact != null) {
            this.showOwnerContact = showOwnerContact;
        }

        if (showManagerContact != null) {
            this.showManagerContact = showManagerContact;
        }
    }

    public void publish() {
        validateReadyToPublish();
        this.publicVisible = true;
        if (publishedAt == null) {
            this.publishedAt = Instant.now();
        }
    }

    public void unpublish() {
        this.publicVisible = false;
    }

    public void deactivate() {
        this.active = false;
        this.publicVisible = false;
    }

    public boolean isVisiblePublicly() {
        return active && publicVisible;
    }

    public void repairRequiredDraftFields(String headline, String description) {
        if (this.headline == null || this.headline.isBlank()) {
            this.headline = normalizeRequired(headline, MAX_HEADLINE_LENGTH, "Headline");
        }

        if (this.description == null || this.description.isBlank()) {
            this.description = normalizeRequired(description, MAX_DESCRIPTION_LENGTH, "Description");
        }
    }

    private void validateReadyToPublish() {
        normalizeRequired(headline, MAX_HEADLINE_LENGTH, "Headline");
        normalizeRequired(description, MAX_DESCRIPTION_LENGTH, "Description");
    }

    private String normalizeRequired(String value, int maxLength, String fieldName) {
        String normalized = normalizeNullable(value, maxLength, fieldName);
        if (normalized == null) {
            throw new ValidationException(fieldName + " is required");
        }

        return normalized;
    }

    private String normalizeNullable(String value, int maxLength, String fieldName) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        if (normalized.isBlank()) {
            return null;
        }

        if (normalized.length() > maxLength) {
            throw new ValidationException(fieldName + " must be at most " + maxLength + " characters");
        }

        return normalized;
    }
}
