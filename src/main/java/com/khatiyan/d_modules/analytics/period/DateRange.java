package com.khatiyan.d_modules.analytics.period;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

/** An IST date range, both ends inclusive. */
public record DateRange(LocalDate from, LocalDate to) {

    public DateRange {
        Objects.requireNonNull(from, "from");
        Objects.requireNonNull(to, "to");
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("Range ends before it starts: " + from + " to " + to);
        }
    }

    public long days() {
        return ChronoUnit.DAYS.between(from, to) + 1;
    }
}
