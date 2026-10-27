package com.khatiyan.c_shared.valkey;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Whether Valkey may be asked, for every part of the app that uses it
 * (2026-10-18).
 *
 * <p>One breaker for all of them. Valkey's timeout is two seconds, so without
 * it every request in an outage would wait those seconds before falling back.
 * After a failure Valkey is left alone for {@link #RETRY_AFTER}, then one caller
 * brings it back while the others keep using their fallbacks.
 *
 * <p><b>Bringing it back</b> runs every {@link ValkeyOutageListener} first. The
 * auth cache raises its generation there, so nothing cached before the outage
 * is read after it. Only when they all succeed is Valkey trusted again.
 *
 * <p><b>It starts down</b>, with the retry already due. The first use is a
 * recovery, so a backend that starts while Valkey holds entries from an earlier
 * run never trusts them.
 */
@Slf4j
@Component
public class ValkeyHealth {

    public static final Duration RETRY_AFTER = Duration.ofSeconds(10);

    private final Supplier<List<ValkeyOutageListener>> listeners;
    private final LongSupplier nanoClock;
    private final AtomicBoolean recovering = new AtomicBoolean();
    /** Counted so a recovery that overlapped a fresh failure does not claim Valkey is up. */
    private final AtomicLong failures = new AtomicLong();
    private volatile boolean up = false;
    private volatile long retryAt;

    @Autowired
    public ValkeyHealth(ObjectProvider<ValkeyOutageListener> listeners) {
        this(() -> listeners.orderedStream().toList(), System::nanoTime);
    }

    /** With listeners and a clock of our choosing, so tests need not sleep. */
    public ValkeyHealth(Supplier<List<ValkeyOutageListener>> listeners, LongSupplier nanoClock) {
        this.listeners = listeners;
        this.nanoClock = nanoClock;
        this.retryAt = nanoClock.getAsLong();
    }

    /** Whether Valkey may be asked now. May bring it back first, on one caller. */
    public boolean available() {
        if (up) {
            return true;
        }
        if (nanoClock.getAsLong() - retryAt < 0) {
            return false;
        }
        if (!recovering.compareAndSet(false, true)) {
            return false;
        }
        try {
            if (up) {
                return true;
            }
            long failuresBefore = failures.get();
            for (ValkeyOutageListener listener : listeners.get()) {
                listener.onValkeyRecovering();
            }
            if (failures.get() != failuresBefore) {
                return false;
            }
            up = true;
            log.info("Valkey is answering; using it again");
            return true;
        } catch (RuntimeException stillDown) {
            failures.incrementAndGet();
            retryAt = nanoClock.getAsLong() + RETRY_AFTER.toNanos();
            log.warn("Valkey is still not answering; retrying in {}s reason={}",
                    RETRY_AFTER.toSeconds(), stillDown.getMessage());
            return false;
        } finally {
            recovering.set(false);
        }
    }

    /** A Valkey command failed, or its connection dropped. */
    public void failed(Throwable cause) {
        failures.incrementAndGet();
        retryAt = nanoClock.getAsLong() + RETRY_AFTER.toNanos();
        boolean wasUp = up;
        up = false;
        if (!wasUp) {
            return;
        }
        log.warn("Valkey stopped answering; using fallbacks for {}s reason={}",
                RETRY_AFTER.toSeconds(), cause == null ? "unknown" : cause.getMessage());
        for (ValkeyOutageListener listener : listeners.get()) {
            try {
                listener.onValkeyDown();
            } catch (RuntimeException listenerFailure) {
                log.warn("Valkey outage listener failed listener={}", listener.getClass().getSimpleName(), listenerFailure);
            }
        }
    }
}
