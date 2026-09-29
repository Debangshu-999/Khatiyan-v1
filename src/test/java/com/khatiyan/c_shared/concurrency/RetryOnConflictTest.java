package com.khatiyan.c_shared.concurrency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/** Repeat-safe writes on your own data retry once on a clash (2026-09-28). */
class RetryOnConflictTest {

    @Test
    void aSingleClashIsRetriedAndSucceeds() {
        AtomicInteger calls = new AtomicInteger();

        String result = RetryOnConflict.once(() -> {
            if (calls.incrementAndGet() == 1) {
                throw new ObjectOptimisticLockingFailureException("raced", null);
            }
            return "ok";
        });

        assertThat(result).isEqualTo("ok");
        assertThat(calls).hasValue(2);
    }

    @Test
    void aSecondClashIsARealOneAndPropagates() {
        AtomicInteger calls = new AtomicInteger();

        assertThatThrownBy(() -> RetryOnConflict.once(() -> {
            calls.incrementAndGet();
            throw new ObjectOptimisticLockingFailureException("raced", null);
        })).isInstanceOf(OptimisticLockingFailureException.class);
        assertThat(calls).hasValue(2);
    }

    @Test
    void otherFailuresAreNotRetried() {
        AtomicInteger calls = new AtomicInteger();

        assertThatThrownBy(() -> RetryOnConflict.once(() -> {
            calls.incrementAndGet();
            throw new IllegalStateException("broken");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(calls).hasValue(1);
    }
}
