package com.khatiyan.d_modules.property.model;

import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One photo of a room type.
 *
 * <p>Carries the Cloudinary {@code publicId} alongside the URL so the asset can
 * be deleted later. It is nullable because an image can arrive as a plain URL —
 * the backfill of an older property, say — and a photo we cannot clean up is
 * still better than no photo.
 *
 * <p>Position is the list's, not the row's: the first image is the one shown, so
 * "which is the cover" is a fact about the order rather than a flag two rows
 * could both set.
 */
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MoldImage {

    private static final int MAX_URL = 600;
    private static final int MAX_PUBLIC_ID = 255;

    @Column(nullable = false, length = MAX_URL)
    private String url;

    @Column(name = "public_id", length = MAX_PUBLIC_ID)
    private String publicId;

    private MoldImage(String url, String publicId) {
        this.url = url;
        this.publicId = publicId;
    }

    public static MoldImage of(String url, String publicId) {
        String trimmedUrl = url == null ? "" : url.trim();
        if (trimmedUrl.isEmpty()) {
            throw new ValidationException("A room type image needs a URL");
        }
        if (trimmedUrl.length() > MAX_URL) {
            throw new ValidationException("That image URL is too long");
        }

        String trimmedId = publicId == null || publicId.isBlank() ? null : publicId.trim();
        if (trimmedId != null && trimmedId.length() > MAX_PUBLIC_ID) {
            throw new ValidationException("That image reference is too long");
        }

        return new MoldImage(trimmedUrl, trimmedId);
    }
}
