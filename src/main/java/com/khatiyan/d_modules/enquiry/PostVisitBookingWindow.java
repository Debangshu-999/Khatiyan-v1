package com.khatiyan.d_modules.enquiry;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Objects;

/** Public date contract owned by enquiry; no dependency back into booking or lead. */
public final class PostVisitBookingWindow {
    public static final int DAYS = 30;
    public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    private PostVisitBookingWindow() {}

    public static LocalDate endsOn(LocalDate visitDate) {
        return Objects.requireNonNull(visitDate).plusDays(DAYS);
    }

    /** Exclusive midnight after the last eligible local date. */
    public static Instant expiresAt(LocalDate visitDate) {
        return endsOn(visitDate).plusDays(1).atStartOfDay(ZONE).toInstant();
    }
}
