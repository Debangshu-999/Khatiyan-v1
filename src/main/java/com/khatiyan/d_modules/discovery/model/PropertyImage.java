package com.khatiyan.d_modules.discovery.model;

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

/**
 * One image in a property's discovery gallery.
 *
 * <p>Order is explicit rather than by creation time: the owner can promote any
 * image to the cover, so "first added" and "shown first" are different things.
 * The row at {@code sortOrder} 0 is the cover.
 */
@Entity
@Table(name = "property_images", schema = "discovery")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyImage extends BaseEntity {

    /** A listing is a gallery, not an album. Ten is plenty and bounds the payload. */
    public static final int MAX_PER_PROPERTY = 10;

    /**
     * A label, not a description.
     *
     * <p>50, while the column is 60: the extra ten are slack, so tightening the
     * limit never needs a migration and an older row that used them still loads.
     */
    public static final int MAX_CAPTION_LENGTH = 50;

    private static final int MAX_URL_LENGTH = 600;
    private static final int MAX_PUBLIC_ID_LENGTH = 255;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(nullable = false, length = MAX_URL_LENGTH)
    private String url;

    /**
     * Cloudinary handle. Nullable only for rows carried over from the single
     * image column, which predate the upload pipeline; without it the asset
     * cannot be deleted from storage.
     */
    @Column(name = "public_id", length = MAX_PUBLIC_ID_LENGTH)
    private String publicId;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    /**
     * What the photo is OF — "Double room", "Dining", "Building exterior".
     *
     * <p>Nullable, and staying that way: every image uploaded before captions
     * existed has none, and an owner who cannot think of a label should still be
     * able to add the photo.
     */
    @Column(length = MAX_CAPTION_LENGTH)
    private String caption;

    private PropertyImage(UUID propertyId, String url, String publicId, int sortOrder, String caption) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.url = requireUrl(url);
        this.publicId = normalizePublicId(publicId);
        this.sortOrder = sortOrder;
        this.caption = normalizeCaption(caption);
    }

    public static PropertyImage of(UUID propertyId, String url, String publicId, int sortOrder) {
        return new PropertyImage(propertyId, url, publicId, sortOrder, null);
    }

    public static PropertyImage of(UUID propertyId, String url, String publicId, int sortOrder, String caption) {
        return new PropertyImage(propertyId, url, publicId, sortOrder, caption);
    }

    /** Blank is stored as null: "" and "no caption" are the same fact. */
    private static String normalizeCaption(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() > MAX_CAPTION_LENGTH ? trimmed.substring(0, MAX_CAPTION_LENGTH) : trimmed;
    }

    /** Renaming what the photo is of. Blank clears it. */
    public void recaption(String value) {
        this.caption = normalizeCaption(value);
    }

    /** Reordering rewrites the block for a property; only the slot ever moves. */
    public void moveTo(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    private String requireUrl(String value) {
        if (value == null || value.isBlank()) {
            throw new ValidationException("Image URL is required");
        }
        String trimmed = value.trim();
        if (trimmed.length() > MAX_URL_LENGTH) {
            throw new ValidationException("Image URL is too long");
        }
        return trimmed;
    }

    private String normalizePublicId(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() > MAX_PUBLIC_ID_LENGTH) {
            throw new ValidationException("Image handle is too long");
        }
        return trimmed;
    }
}
