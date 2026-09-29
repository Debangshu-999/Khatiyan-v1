package com.khatiyan.c_shared.concurrency;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.StaleVersionException;

/**
 * An action on an existing record (2026-09-28/29).
 *
 * <p>{@link #claim} is one line in the service, right after the record is
 * loaded and access is checked. It compares the version the screen loaded,
 * then marks the record changed, so its version bumps even when the action
 * only touches rows under it (a line on a bill, a movement on a deposit).
 * Any two actions on the same record then clash, whatever rows they write.
 */
public final class VersionGuard {

    private VersionGuard() {
    }

    /**
     * The request's record: refused if the screen loaded an older version,
     * then bumped. Takes the held version, so a second claim in the same
     * request (another module's record) only bumps.
     */
    public static void claim(BaseEntity root) {
        check(root.getVersion(), ExpectedVersionHolder.take());
        bump(root);
    }

    /**
     * The request's record, compared but not changed: an action that only
     * depends on it, such as sending a cash code. Bumping here would make the
     * same screen's next step (Mark paid) look stale against itself.
     */
    public static void verify(BaseEntity root) {
        check(root.getVersion(), ExpectedVersionHolder.take());
    }

    /** Another record this action changes: bumped, never compared. */
    public static void bump(BaseEntity record) {
        record.markChanged();
    }

    /** Refuses a write built on a version that is no longer current. */
    public static void check(long currentVersion, ExpectedVersion expected) {
        if (expected != null && expected.isPresent() && expected.value() != currentVersion) {
            throw new StaleVersionException();
        }
    }
}
