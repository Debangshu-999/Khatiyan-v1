package com.khatiyan.c_shared.valkey;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

/** One breaker for every Valkey user (2026-10-18). */
class ValkeyHealthTest {

    private long nowNanos = 1_000_000_000L;
    private final List<String> heard = new ArrayList<>();
    private boolean recoveryFails = false;

    private final ValkeyOutageListener listener = new ValkeyOutageListener() {
        @Override
        public void onValkeyDown() {
            heard.add("down");
        }

        @Override
        public void onValkeyRecovering() {
            heard.add("recovering");
            if (recoveryFails) {
                throw new IllegalStateException("still not answering");
            }
        }
    };

    private final ValkeyHealth health = new ValkeyHealth(() -> List.of(listener), () -> nowNanos);

    @Test
    void theFirstUseIsARecoverySoEntriesFromAnEarlierRunAreNeverTrusted() {
        assertThat(health.available()).isTrue();
        assertThat(heard).containsExactly("recovering");

        // Up from then on, with nothing run again.
        assertThat(health.available()).isTrue();
        assertThat(heard).containsExactly("recovering");
    }

    @Test
    void aFailureLeavesValkeyAloneForTenSecondsThenOneRecoveryBringsItBack() {
        health.available();
        heard.clear();

        health.failed(new RuntimeException("timeout"));
        assertThat(heard).containsExactly("down");
        assertThat(health.available()).isFalse();

        nowNanos += ValkeyHealth.RETRY_AFTER.toNanos() - 1;
        assertThat(health.available()).isFalse();

        nowNanos += 1;
        assertThat(health.available()).isTrue();
        assertThat(heard).containsExactly("down", "recovering");
    }

    @Test
    void aRecoveryThatFailsKeepsValkeyDownAndTriesAgainLater() {
        health.available();
        health.failed(new RuntimeException("timeout"));
        recoveryFails = true;
        nowNanos += ValkeyHealth.RETRY_AFTER.toNanos();

        assertThat(health.available()).isFalse();
        assertThat(health.available()).isFalse();

        recoveryFails = false;
        nowNanos += ValkeyHealth.RETRY_AFTER.toNanos();
        assertThat(health.available()).isTrue();
    }

    @Test
    void failingWhileAlreadyDownDoesNotTellTheListenersAgain() {
        health.available();
        health.failed(new RuntimeException("one"));
        health.failed(new RuntimeException("two"));

        assertThat(heard).containsExactly("recovering", "down");
    }

    @Test
    void aFailureDuringARecoveryKeepsValkeyDown() {
        ValkeyHealth[] self = new ValkeyHealth[1];
        ValkeyOutageListener failsMidway = new ValkeyOutageListener() {
            @Override
            public void onValkeyRecovering() {
                // Another request's command fails while this recovery runs.
                self[0].failed(new RuntimeException("dropped again"));
            }
        };
        self[0] = new ValkeyHealth(() -> List.of(failsMidway), () -> nowNanos);

        assertThat(self[0].available()).isFalse();
    }
}
