package com.khatiyan.d_modules.discovery.model;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "property_local_places", schema = "discovery")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyLocalPlace extends BaseEntity {

    private static final int MAX_NAME_LENGTH = 120;
    private static final int MAX_DESCRIPTION_LENGTH = 800;
    private static final int MAX_PHONE_LENGTH = 20;
    private static final int MAX_ADDRESS_LENGTH = 300;
    private static final int MAX_URL_LENGTH = 600;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(nullable = false, length = MAX_NAME_LENGTH)
    private String name;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "property_local_place_tags",
            schema = "discovery",
            joinColumns = @JoinColumn(name = "local_place_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "tag", nullable = false, length = 40)
    private Set<PropertyLocalPlaceTag> tags = EnumSet.noneOf(PropertyLocalPlaceTag.class);

    @Column(length = MAX_DESCRIPTION_LENGTH)
    private String description;

    @Column(length = MAX_PHONE_LENGTH)
    private String phone;

    @Column(name = "address_text", length = MAX_ADDRESS_LENGTH)
    private String addressText;

    @Column(precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(precision = 10, scale = 7)
    private BigDecimal longitude;

    @Column(name = "directions_url", length = MAX_URL_LENGTH)
    private String directionsUrl;

    @Column(name = "photo_url", length = MAX_URL_LENGTH)
    private String photoUrl;

    @Column(name = "owner_recommended", nullable = false)
    private boolean ownerRecommended;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private PropertyLocalPlace(UUID propertyId, String name, Set<PropertyLocalPlaceTag> tags,
                               String description, String phone,
                               String addressText, BigDecimal latitude, BigDecimal longitude,
                               String directionsUrl, String photoUrl, boolean ownerRecommended) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.active = true;
        update(name, tags, description, phone, addressText,
                latitude, longitude, directionsUrl, photoUrl, ownerRecommended);
    }

    public static PropertyLocalPlace create(UUID propertyId, String name, Set<PropertyLocalPlaceTag> tags,
                                            String description, String phone,
                                            String addressText, BigDecimal latitude, BigDecimal longitude,
                                            String directionsUrl, String photoUrl, boolean ownerRecommended) {
        return new PropertyLocalPlace(propertyId, name, tags, description, phone,
                addressText, latitude, longitude, directionsUrl, photoUrl, ownerRecommended);
    }

    public void update(String name, Set<PropertyLocalPlaceTag> tags, String description, String phone, String addressText,
                       BigDecimal latitude, BigDecimal longitude, String directionsUrl,
                       String photoUrl, boolean ownerRecommended) {
        this.name = normalizeRequired(name, MAX_NAME_LENGTH, "Place name");
        replaceTags(tags);
        this.description = normalizeNullable(description, MAX_DESCRIPTION_LENGTH, "Description");
        this.phone = normalizeNullable(phone, MAX_PHONE_LENGTH, "Phone");
        this.addressText = normalizeNullable(addressText, MAX_ADDRESS_LENGTH, "Address");
        this.latitude = latitude;
        this.longitude = longitude;
        this.directionsUrl = normalizeNullable(directionsUrl, MAX_URL_LENGTH, "Directions URL");
        this.photoUrl = normalizeNullable(photoUrl, MAX_URL_LENGTH, "Photo URL");
        this.ownerRecommended = ownerRecommended;
    }

    /**
     * Backfill-only coordinate write: fills absent coordinates from a server-side
     * geocode and never overwrites a point the admin pinned on the map.
     */
    public void backfillCoordinates(BigDecimal latitude, BigDecimal longitude) {
        if (this.latitude != null || this.longitude != null) {
            return;
        }
        if (latitude == null || longitude == null) {
            return;
        }
        this.latitude = latitude;
        this.longitude = longitude;
    }

    public Set<PropertyLocalPlaceTag> getTags() {
        return Collections.unmodifiableSet(new TreeSet<>(tags));
    }

    public void deactivate() {
        this.active = false;
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

    private void replaceTags(Set<PropertyLocalPlaceTag> values) {
        this.tags.clear();
        if (values == null || values.isEmpty()) {
            return;
        }

        this.tags.addAll(values);
    }
}
