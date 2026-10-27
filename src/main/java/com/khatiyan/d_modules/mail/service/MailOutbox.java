package com.khatiyan.d_modules.mail.service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * The queue of mails, {@code mail.outbox}. Plain SQL: one insert that a taken
 * key turns into nothing, one read of what is due, and the updates a send
 * makes.
 */
@Repository
public class MailOutbox {

    /** One mail as the sender needs it. */
    public record Queued(UUID id, UUID userId, String kind, String subject, String html, String text,
            Instant dueAt, int attempts) {
    }

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public MailOutbox(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** @return true when it was queued, false when that key was queued before */
    public boolean add(UUID userId, String kind, String dedupeKey, MailRenderer.Rendered mail, Instant sendAfter) {
        Timestamp at = Timestamp.from(sendAfter);
        return jdbc.update("""
                INSERT INTO mail.outbox (id, dedupe_key, user_id, kind, subject, html, text_body, send_after, due_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (dedupe_key) DO NOTHING
                """, UUID.randomUUID(), dedupeKey, userId, kind, mail.subject(), mail.html(), mail.text(), at, at) == 1;
    }

    /** Pending and due, oldest first. */
    public List<UUID> due(int limit) {
        return jdbc.queryForList("""
                SELECT id FROM mail.outbox
                WHERE status = 'PENDING' AND send_after <= ?
                ORDER BY send_after
                LIMIT ?
                """, UUID.class, Timestamp.from(clock.instant()), limit);
    }

    /**
     * Takes one pending mail for this transaction. Empty when it is no longer
     * pending, or another sender holds it.
     */
    public java.util.Optional<Queued> take(UUID id) {
        return jdbc.query("""
                SELECT id, user_id, kind, subject, html, text_body, due_at, attempts FROM mail.outbox
                WHERE id = ? AND status = 'PENDING'
                FOR UPDATE SKIP LOCKED
                """, (rs, row) -> new Queued(
                        rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class), rs.getString("kind"),
                        rs.getString("subject"), rs.getString("html"), rs.getString("text_body"),
                        rs.getTimestamp("due_at").toInstant(), rs.getInt("attempts")), id)
                .stream().findFirst();
    }

    public void sent(UUID id, int attempts) {
        jdbc.update("UPDATE mail.outbox SET status = 'SENT', sent_at = ?, attempts = ?, last_error = NULL WHERE id = ?",
                Timestamp.from(clock.instant()), attempts, id);
    }

    /** SKIPPED, EXPIRED or FAILED: it will not be tried again. */
    public void closed(UUID id, String status, int attempts, String error) {
        jdbc.update("UPDATE mail.outbox SET status = ?, attempts = ?, last_error = ? WHERE id = ?",
                status, attempts, trim(error), id);
    }

    public void retryAt(UUID id, int attempts, Instant at, String error) {
        jdbc.update("UPDATE mail.outbox SET attempts = ?, send_after = ?, last_error = ? WHERE id = ?",
                attempts, Timestamp.from(at), trim(error), id);
    }

    private static String trim(String error) {
        return error == null ? null : error.length() <= 500 ? error : error.substring(0, 500);
    }
}
