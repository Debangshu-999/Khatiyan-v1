package com.khatiyan.c_shared.concurrency;

import java.util.function.Supplier;

import org.springframework.dao.OptimisticLockingFailureException;

import jakarta.persistence.OptimisticLockException;

/**
 * For writes that are safe to repeat on your own data (2026-09-28): marking a
 * notification or chat read, registering this device.
 *
 * <p>Two of your devices doing the same thing at once should both succeed, not
 * tell you "changed by someone else". On a clash the call runs once more, now
 * reading the row the other device just saved, and usually finds nothing left
 * to do. A second clash is a real one and goes to the client as 409.
 *
 * <p>Call it from OUTSIDE the transaction (the controller), so each attempt is
 * its own transaction. Inside one, the first clash has already doomed it.
 */
public final class RetryOnConflict {

    private RetryOnConflict() {
    }

    public static <T> T once(Supplier<T> call) {
        try {
            return call.get();
        } catch (OptimisticLockingFailureException | OptimisticLockException clash) {
            return call.get();
        }
    }

    public static void once(Runnable call) {
        once(() -> {
            call.run();
            return null;
        });
    }
}
