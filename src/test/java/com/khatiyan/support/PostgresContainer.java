package com.khatiyan.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * The throwaway database every {@link IntegrationTest} shares.
 *
 * <p>Registered through {@code @ServiceConnection} rather than by setting
 * {@code spring.datasource.*} by hand, so the URL, credentials and driver come
 * from the container itself and cannot drift out of step with it.
 *
 * <p><b>One container, not one per class.</b> The bean is a singleton in a
 * context Spring caches across test classes, so the image starts once per build
 * and every test that boots the context reuses it. Postgres is pinned to the
 * same major version production runs, because the whole point is to run the
 * real migrations against the real engine — a different major would let a
 * migration pass here and fail there.
 */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresContainer {

    /** Matches the server the app is deployed against. */
    private static final DockerImageName IMAGE = DockerImageName.parse("postgres:16-alpine");

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>(IMAGE);
    }

    /** Never point the full-context harness at the application's local cache. */
    @Bean
    @ServiceConnection(name = "redis")
    GenericContainer<?> testValkeyContainer() {
        return new GenericContainer<>(DockerImageName.parse("valkey/valkey:8-alpine"))
                .withExposedPorts(6379);
    }

    @Bean
    DynamicPropertyRegistrar testServiceProperties(
            @Qualifier("testValkeyContainer") GenericContainer<?> testValkeyContainer) {
        return registry -> {
            // Also feeds the rate-limit client, which reads properties directly
            // rather than Spring Boot's RedisConnectionDetails.
            registry.add("spring.data.redis.host", testValkeyContainer::getHost);
            registry.add("spring.data.redis.port", () -> testValkeyContainer.getMappedPort(6379));
            registry.add("spring.data.redis.password", () -> "");
            registry.add("spring.data.redis.database", () -> 0);
            registry.add("app.jwt.secret", () -> "harness-only-not-production-01234567890123456789012345678901");
        };
    }
}
