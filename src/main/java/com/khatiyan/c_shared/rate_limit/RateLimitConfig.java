package com.khatiyan.c_shared.rate_limit;

import org.springframework.boot.data.redis.autoconfigure.DataRedisProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.github.bucket4j.distributed.proxy.ProxyManager;
import io.github.bucket4j.redis.lettuce.Bucket4jLettuce;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisURI;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.codec.ByteArrayCodec;
import io.lettuce.core.codec.RedisCodec;
import io.lettuce.core.codec.StringCodec;

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
    public RedisClient rateLimitRedisClient(DataRedisProperties redisProperties) {
        RedisURI.Builder builder = RedisURI.builder()
                .withHost(redisProperties.getHost())
                .withPort(redisProperties.getPort())
                .withDatabase(redisProperties.getDatabase())
                .withTimeout(redisProperties.getTimeout());

        if (redisProperties.getPassword() != null && !redisProperties.getPassword().isBlank()) {
            builder.withPassword(redisProperties.getPassword().toCharArray());
        }

        return RedisClient.create(builder.build());
    }

    @Bean(destroyMethod = "close")
    public StatefulRedisConnection<String, byte[]> rateLimitRedisConnection(RedisClient rateLimitRedisClient) {
        return rateLimitRedisClient.connect(RedisCodec.of(StringCodec.UTF8, ByteArrayCodec.INSTANCE));
    }

    @Bean
    public ProxyManager<String> rateLimitProxyManager(
            StatefulRedisConnection<String, byte[]> rateLimitRedisConnection) {
        return Bucket4jLettuce.casBasedBuilder(rateLimitRedisConnection).build();
    }
}
