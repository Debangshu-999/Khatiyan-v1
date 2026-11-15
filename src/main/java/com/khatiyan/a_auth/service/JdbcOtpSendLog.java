package com.khatiyan.a_auth.service;

import java.sql.Timestamp;
import java.time.Instant;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** {@link OtpSendLog} in {@code auth.otp_send_attempts}. */
@Repository
public class JdbcOtpSendLog implements OtpSendLog {

    private final JdbcTemplate jdbc;

    public JdbcOtpSendLog(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Window window(String identifier, String scope, Instant since) {
        return jdbc.queryForObject(
                "SELECT count(*) AS n, max(created_at) AS latest FROM auth.otp_send_attempts "
                        + "WHERE identifier = ? AND scope = ? AND created_at > ?",
                (rs, row) -> {
                    Timestamp latest = rs.getTimestamp("latest");
                    return new Window(rs.getLong("n"), latest == null ? null : latest.toInstant());
                },
                identifier,
                scope,
                Timestamp.from(since));
    }

    @Override
    public void lock(String identifier, String scope) {
        // Released when the transaction ends. Same-identifier requests wait their turn.
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtext(?))", identifier + "|" + scope);
    }

    @Override
    public void record(String identifier, String scope, Instant at) {
        jdbc.update(
                "INSERT INTO auth.otp_send_attempts (identifier, scope, created_at) VALUES (?, ?, ?)",
                identifier,
                scope,
                Timestamp.from(at));
    }

    @Override
    public void purgeBefore(Instant cutoff) {
        jdbc.update("DELETE FROM auth.otp_send_attempts WHERE created_at < ?", Timestamp.from(cutoff));
    }
}
