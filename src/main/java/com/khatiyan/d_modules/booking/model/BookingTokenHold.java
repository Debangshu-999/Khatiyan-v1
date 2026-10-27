package com.khatiyan.d_modules.booking.model;

import java.time.Instant;
import java.util.Objects;

/**
 * The token facts the state rules need. {@code dueAt} is empty until terms are
 * agreed. A claim the property has not answered stops the clock, so a slow
 * answer can never cost the tenant the bed.
 */
public record BookingTokenHold(boolean required, Instant dueAt, boolean claimWaiting) {

    public BookingTokenHold {
        if (!required && (dueAt != null || claimWaiting)) {
            throw new IllegalArgumentException("A waived token has no deadline and no claim");
        }
        if (claimWaiting && dueAt == null) {
            throw new IllegalArgumentException("A claim can only wait on a token that fell due");
        }
    }

    /** The owner holds the bed without a token. */
    public static BookingTokenHold waived() {
        return new BookingTokenHold(false, null, false);
    }

    /** A token will be owed, but terms are not agreed yet. */
    public static BookingTokenHold toBeAgreed() {
        return new BookingTokenHold(true, null, false);
    }

    public static BookingTokenHold due(Instant dueAt, boolean claimWaiting) {
        return new BookingTokenHold(true, Objects.requireNonNull(dueAt), claimWaiting);
    }

    public boolean isRunning() {
        return required && dueAt != null;
    }

    public boolean lapsedAt(Instant now) {
        return isRunning() && !claimWaiting && !now.isBefore(dueAt);
    }
}
