package com.khatiyan.c_shared.rate_limit;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.data.redis.autoconfigure.DataRedisProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;

import io.github.bucket4j.distributed.proxy.ProxyManager;
import io.github.bucket4j.redis.lettuce.Bucket4jLettuce;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisURI;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.codec.ByteArrayCodec;
import io.lettuce.core.codec.RedisCodec;
import io.lettuce.core.codec.StringCodec;
import io.lettuce.core.resource.ClientResources;

/**
 * Creates the Valkey/Lettuce connection used by Bucket4j distributed buckets.
 */
@Configuration
public class RateLimitConfig {

    @Bean(destroyMethod = "shutdown")
    // Boot 4 split its auto-configuration into per-technology modules and
    // renamed this along the way: org.springframework.boot.autoconfigure.data
    // .redis.RedisProperties became org.springframework.boot.data.redis
    // .autoconfigure.DataRedisProperties. Same spring.data.redis.* properties
    // behind it, so nothing about the configuration changed.
    //
    // Built on Spring Boot's shared ClientResources when there is one
    // (2026-10-18), so ValkeyDisconnectWatcher hears this client's dropped
    // connections on the same event bus as everyone else's.
    public RedisClient rateLimitRedisClient(
            DataRedisProperties redisProperties, ObjectProvider<ClientResources> clientResources) {
        RedisURI.Builder builder = RedisURI.builder()
                .withHost(redisProperties.getHost())
                .withPort(redisProperties.getPort())
                .withDatabase(redisProperties.getDatabase())
                .withTimeout(redisProperties.getTimeout());

        if (redisProperties.getPassword() != null && !redisProperties.getPassword().isBlank()) {
            builder.withPassword(redisProperties.getPassword().toCharArray());
        }

        ClientResources shared = clientResources.getIfAvailable();
        return shared == null ? RedisClient.create(builder.build()) : RedisClient.create(shared, builder.build());
    }

    /**
     * Opened on first use, not while the app starts (2026-10-17). Opened at
     * startup, a Valkey that did not answer within its two seconds stopped the
     * whole backend from starting, and the database fallback never got its
     * turn. Now a failure to connect is one more Valkey failure, which
     * {@link RateLimitService} answers from memory and tries again later.
     */
    @Lazy
    @Bean(destroyMethod = "close")
    public StatefulRedisConnection<String, byte[]> rateLimitRedisConnection(RedisClient rateLimitRedisClient) {
        return rateLimitRedisClient.connect(RedisCodec.of(StringCodec.UTF8, ByteArrayCodec.INSTANCE));
    }

    @Lazy
    @Bean
    public ProxyManager<String> rateLimitProxyManager(
            StatefulRedisConnection<String, byte[]> rateLimitRedisConnection) {
        return Bucket4jLettuce.casBasedBuilder(rateLimitRedisConnection).build();
    }
}
