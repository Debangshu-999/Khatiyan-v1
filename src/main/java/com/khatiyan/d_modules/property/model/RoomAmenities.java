package com.khatiyan.d_modules.property.model;

import java.util.HashSet;
import java.util.Set;

import com.khatiyan.c_shared.exception.ValidationException;

/** Shared rules for the owner's own amenity entries, on a mold or a room. */
public final class RoomAmenities {

    public static final int MAX_CUSTOM = 10;
    public static final int MAX_CUSTOM_LENGTH = 80;

    private RoomAmenities() {
    }

    /**
     * Trims, drops blanks, and refuses a list that has grown past useful.
     *
     * <p>De-duplicated case-insensitively on the way in. "Balcony" and "balcony"
     * are one amenity to a reader and two rows to a primary key, and the set
     * would then render the same thing twice.
     *
     * <p>Which spelling survives a collision is arbitrary — the input is a Set,
     * so there is no "first" to prefer. If that ever matters, the caller has to
     * send an ordered list instead.
     */
    public static Set<String> cleanCustom(Set<String> raw) {
        if (raw == null) {
            return new HashSet<>();
        }

        Set<String> seen = new HashSet<>();
        Set<String> cleaned = new HashSet<>();
        for (String entry : raw) {
            String trimmed = entry == null ? "" : entry.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            if (trimmed.length() > MAX_CUSTOM_LENGTH) {
                throw new ValidationException(
                        "An amenity name cannot be longer than " + MAX_CUSTOM_LENGTH + " characters");
            }
            if (seen.add(trimmed.toLowerCase())) {
                cleaned.add(trimmed);
            }
        }

        if (cleaned.size() > MAX_CUSTOM) {
            throw new ValidationException("A room cannot list more than " + MAX_CUSTOM + " custom amenities");
        }
        return cleaned;
    }
}
