package com.khatiyan.c_shared.valkey;

import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * One fill per key at a time (2026-10-18).
 *
 * <p>When many requests miss the same cache key at once, the first one does
 * the work (a database read, a vendor call) and the rest wait for its answer.
 * The entry lives only while that work runs.
 *
 * <p>A failure is not shared. If the first caller's work throws, each waiter
 * does its own, so one vendor refusal or one person's quota error is never
 * handed to everyone else who asked at the same moment.
 */
public final class SingleFlight {

    private final ConcurrentHashMap<String, CompletableFuture<Object>> inFlight = new ConcurrentHashMap<>();

    public <T> T run(String key, Supplier<T> work) {
        return run(key, work, () -> { });
    }

    /**
     * As above, telling the caller when its answer was another caller's, so it
     * can record that as the cache hit it effectively is.
     */
    @SuppressWarnings("unchecked")
    public <T> T run(String key, Supplier<T> work, Runnable whenShared) {
        CompletableFuture<Object> mine = new CompletableFuture<>();
        CompletableFuture<Object> running = inFlight.putIfAbsent(key, mine);
        if (running != null) {
            try {
                T shared = (T) running.join();
                whenShared.run();
                return shared;
            } catch (CompletionException | CancellationException leaderFailed) {
                return work.get();
            }
        }
        try {
            T result = work.get();
            mine.complete(result);
            return result;
        } catch (RuntimeException | Error failure) {
            mine.completeExceptionally(failure);
            throw failure;
        } finally {
            inFlight.remove(key, mine);
        }
    }

    /** Calls in progress. For tests. */
    int inFlight() {
        return inFlight.size();
    }
}
