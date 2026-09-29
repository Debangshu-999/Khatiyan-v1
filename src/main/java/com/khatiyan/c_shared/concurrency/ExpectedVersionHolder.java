package com.khatiyan.c_shared.concurrency;

/**
 * The version this request's screen loaded, from {@code If-Match}, held for
 * the request's thread (2026-09-29).
 *
 * <p><b>One-shot.</b> The first {@link VersionGuard#claim} in a request takes
 * it. An action often reaches other modules (ending a stay also touches its
 * bill and deposit), and their claims must only bump their own record, never
 * compare the stay's version against a bill's.
 *
 * <p>Set and cleared by {@link ExpectedVersionInterceptor}. Jobs, listeners and
 * webhooks never set it, so their claims only bump.
 */
public final class ExpectedVersionHolder {

    private static final ThreadLocal<ExpectedVersion> CURRENT = new ThreadLocal<>();

    private ExpectedVersionHolder() {
    }

    public static void set(ExpectedVersion expected) {
        if (expected == null || !expected.isPresent()) {
            CURRENT.remove();
        } else {
            CURRENT.set(expected);
        }
    }

    /** The held version, removed as it is read. {@code none()} when there is none. */
    public static ExpectedVersion take() {
        ExpectedVersion expected = CURRENT.get();
        CURRENT.remove();
        return expected == null ? ExpectedVersion.none() : expected;
    }

    public static void clear() {
        CURRENT.remove();
    }
}
