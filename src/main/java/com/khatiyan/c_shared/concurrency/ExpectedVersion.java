package com.khatiyan.c_shared.concurrency;

/**
 * The version of a record the client's screen was showing when it acted,
 * from the {@code If-Match} request header (2026-09-28).
 *
 * <p>Absent when the client sent none. Until every screen sends one, an absent
 * version skips the stale check. A same-moment race is still caught at commit
 * by the row's own {@code @Version}.
 */
public record ExpectedVersion(Long value) {

    public static ExpectedVersion of(long value) {
        return new ExpectedVersion(value);
    }

    public static ExpectedVersion none() {
        return new ExpectedVersion(null);
    }

    public boolean isPresent() {
        return value != null;
    }
}
