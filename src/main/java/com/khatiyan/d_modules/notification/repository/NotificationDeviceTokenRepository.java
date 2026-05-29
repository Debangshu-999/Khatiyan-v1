package com.khatiyan.d_modules.notification.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notification.model.NotificationDeviceToken;
import com.khatiyan.d_modules.notification.model.PushProvider;

/**
 * Persistence access for registered user push provider tokens.
 */
@Repository
public interface NotificationDeviceTokenRepository extends JpaRepository<NotificationDeviceToken, UUID> {

    @Modifying
    @Query(
        value = """
            INSERT INTO notification.notification_device_tokens (
                id,
                user_id,
                provider,
                provider_token,
                platform,
                active,
                last_seen_at,
                created_at,
                updated_at
            )
            VALUES (
                :id,
                :userId,
                :provider,
                :providerToken,
                :platform,
                true,
                :now,
                :now,
                :now
            )
            ON CONFLICT (provider, provider_token)
            DO UPDATE SET
                user_id = EXCLUDED.user_id,
                platform = EXCLUDED.platform,
                active = true,
                last_seen_at = EXCLUDED.last_seen_at,
                updated_at = EXCLUDED.updated_at
        """,
        nativeQuery = true)
    void upsertDeviceToken(
            @Param("id") UUID id,
            @Param("userId") UUID userId,
            @Param("provider") String provider,
            @Param("providerToken") String providerToken,
            @Param("platform") String platform,
            @Param("now") java.time.Instant now);

    @Query("""
        SELECT token
        FROM NotificationDeviceToken token
        WHERE token.provider = :provider
          AND token.providerToken = :providerToken
    """)
    Optional<NotificationDeviceToken> findByProviderAndProviderToken(
            PushProvider provider,
            String providerToken);

    @Query("""
        SELECT token
        FROM NotificationDeviceToken token
        WHERE token.userId = :userId
          AND token.active = true
        ORDER BY token.lastSeenAt DESC
    """)
    List<NotificationDeviceToken> findActiveByUserId(UUID userId);

    @Query("""
        SELECT token
        FROM NotificationDeviceToken token
        WHERE token.userId = :userId
          AND token.provider = :provider
          AND token.active = true
        ORDER BY token.lastSeenAt DESC
    """)
    List<NotificationDeviceToken> findActiveByUserIdAndProvider(UUID userId, PushProvider provider);
}
