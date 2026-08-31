package com.khatiyan.d_modules.property.model;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * How many beds a sharing type means.
 *
 * <p>Fixed for the named sizes, and open for a dormitory — which is the whole
 * reason bed count lives on the mold rather than being derived from the type at
 * read time. A six-bed dorm and a ten-bed dorm are two molds because they are
 * two different products.
 */
public final class SharingBeds {

    private SharingBeds() {
    }

    /** @return the bed count a type implies, or null when the owner must say */
    public static Integer fixedFor(RoomType sharingType) {
        return switch (sharingType) {
            case SINGLE -> 1;
            case DOUBLE -> 2;
            case TRIPLE -> 3;
            case FOUR_SHARING -> 4;
            case DORMITORY -> null;
        };
    }

    /**
     * Settles the bed count for a mold, refusing a request that contradicts the
     * sharing type.
     *
     * <p>A "double sharing" mold with three beds is not a stricter version of
     * double sharing; it is a triple wearing the wrong label, and every filter
     * and listing downstream would repeat the lie.
     */
    public static int resolve(RoomType sharingType, Integer requested) {
        Integer fixed = fixedFor(sharingType);

        if (fixed != null) {
            if (requested != null && !requested.equals(fixed)) {
                throw new ValidationException(
                        "A %s room has %d bed%s".formatted(
                                sharingType.name().toLowerCase().replace('_', ' '),
                                fixed,
                                fixed == 1 ? "" : "s"));
            }
            return fixed;
        }

        // Five, not two. Four-sharing is its own occupancy, so a dormitory is
        // what a room becomes once it is larger than that — a "3-bed dormitory"
        // would be a triple under another name, and would sort and filter as
        // something it is not.
        if (requested == null || requested < 5) {
            throw new ValidationException("A dormitory needs a bed count of at least 5");
        }
        if (requested > 60) {
            throw new ValidationException("A dormitory cannot have more than 60 beds");
        }
        return requested;
    }
}
