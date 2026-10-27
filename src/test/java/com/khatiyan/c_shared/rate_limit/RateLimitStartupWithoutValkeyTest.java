package com.khatiyan.c_shared.rate_limit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.ServerSocket;
import java.net.Socket;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.data.redis.autoconfigure.DataRedisProperties;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import com.khatiyan.c_shared.valkey.ValkeyHealth;

/**
 * The backend starts when Valkey does not answer (2026-10-17).
 *
 * <p>It failed to start because Valkey, through Docker Desktop's port relay,
 * took the connection and then said nothing for its two seconds. The rate
 * limiter opened its connection while the app started, so that one stall
 * stopped Tomcat, and with it login. The beans are wired here as the app wires
 * them, against a socket that does exactly that: takes the connection and never
 * replies.
 */
class RateLimitStartupWithoutValkeyTest {

    @Test
    void theRateLimiterStartsAndAnswersFromTheDatabaseWhenValkeyTakesTheConnectionButNeverReplies() throws Exception {
        try (ServerSocket silent = new ServerSocket(0)) {
            List<Socket> held = new ArrayList<>();
            Thread acceptor = new Thread(() -> {
                try {
                    while (!silent.isClosed()) {
                        held.add(silent.accept());
                    }
                } catch (Exception closed) {
                    // The test is over.
                }
            });
            acceptor.setDaemon(true);
            acceptor.start();

            DataRedisProperties properties = new DataRedisProperties();
            properties.setHost("127.0.0.1");
            properties.setPort(silent.getLocalPort());
            properties.setTimeout(Duration.ofMillis(500));
            try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
                context.registerBean(DataRedisProperties.class, () -> properties);
                context.register(ValkeyHealth.class, RateLimitConfig.class, RateLimitService.class);

                // Starting asks nothing of Valkey.
                context.refresh();
                assertThat(held).isEmpty();

                // The first limit checked tries Valkey, hears nothing, and memory answers.
                RateLimitResult result = context.getBean(RateLimitService.class).consume("rl:test:ip:127.0.0.1", 300, 60);
                assertThat(result.allowed()).isTrue();
            } finally {
                for (Socket socket : held) {
                    socket.close();
                }
            }
        }
    }
}
