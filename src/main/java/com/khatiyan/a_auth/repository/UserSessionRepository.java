package com.khatiyan.a_auth.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.a_auth.model.UserSession;

/**
 * Persistence for the signed-in device list.
 */
@Repository
public interface UserSessionRepository extends JpaRepository<UserSession, UUID> {

    Optional<UserSession> findByJti(UUID jti);

    /**
     * Has this account ever been signed in on a device calling itself this?
     *
     * <p>Counts REVOKED and EXPIRED rows too — signing out on a phone does not
     * make it a stranger, and re-signing in there is not the event worth
     * interrupting someone for.
     */
    boolean existsByUserIdAndDeviceLabel(UUID userId, String deviceLabel);

    /** Any session ever, live or not. Zero means this is the very first device. */
    boolean existsByUserId(UUID userId);

    /**
     * The list as a person sees it: still valid, newest first.
     *
     * <p>Expired rows are filtered rather than deleted — a token that ran out on
     * its own is not a device anyone needs to be told about, but the row is worth
     * keeping until the sweep so "signed in from X at Y" stays answerable.
     */
    @Query("""
            SELECT session
            FROM UserSession session
            WHERE session.userId = :userId
              AND session.revokedAt IS NULL
              AND session.expiresAt > :now
            ORDER BY session.createdAt DESC
            """)
    List<UserSession> findLiveByUser(UUID userId, Instant now);

    /**
     * Ends every one of a user's live sessions.
     *
     * <p>For a credential change, which already invalidates every issued token
     * through {@code credentialVersion}. Without this the tokens would be dead
     * while the rows still claimed to be live, and the list would show devices
     * that were signed out days ago.
     */
    @Modifying
    @Query("""
            UPDATE UserSession session
            SET session.revokedAt = :now
            WHERE session.userId = :userId
              AND session.revokedAt IS NULL
            """)
    int revokeAllForUser(UUID userId, Instant now);
}
