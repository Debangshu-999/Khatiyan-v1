package com.khatiyan.c_shared.valkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

/** One fill per key at a time (2026-10-18). */
class SingleFlightTest {

    private final SingleFlight singleFlight = new SingleFlight();

    @Test
    void concurrentMissesForOneKeyMakeOneCallAndShareItsAnswer() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<String>> answers = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                answers.add(pool.submit(() -> singleFlight.run("geo:search:salt lake", () -> {
                    calls.incrementAndGet();
                    await(release);
                    return "Salt Lake Sector V";
                })));
            }
            // Let every caller arrive while the first is still working.
            Thread.sleep(200);
            release.countDown();
            for (Future<String> answer : answers) {
                assertThat(answer.get(5, TimeUnit.SECONDS)).isEqualTo("Salt Lake Sector V");
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(calls).hasValue(1);
        assertThat(singleFlight.inFlight()).isZero();
    }

    @Test
    void aFailureIsNotHandedToTheCallersWaitingOnIt() throws Exception {
        CountDownLatch leaderStarted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<String> leader = pool.submit(() -> singleFlight.run("ai:answer", () -> {
                leaderStarted.countDown();
                await(release);
                throw new IllegalStateException("this person is out of searches");
            }));
            await(leaderStarted);
            Future<String> waiter = pool.submit(() -> singleFlight.run("ai:answer", () -> "their own answer"));
            Thread.sleep(100);
            release.countDown();

            assertThat(waiter.get(5, TimeUnit.SECONDS)).isEqualTo("their own answer");
            assertThatThrownBy(() -> leader.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(IllegalStateException.class);
        } finally {
            pool.shutdownNow();
        }
        assertThat(singleFlight.inFlight()).isZero();
    }

    @Test
    void differentKeysDoNotWaitOnEachOther() {
        assertThat(singleFlight.run("a", () -> 1)).isEqualTo(1);
        assertThat(singleFlight.run("b", () -> 2)).isEqualTo(2);
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
