-- ShedLock distributed-lock table.
--
-- Guarantees that each scheduled job (billing, concern, notice, notification
-- cleanup, reminder, salary, tenancy exit / room-change, and their startup
-- catch-ups) runs on only one application instance at a time, even when two or
-- more instances are running. ShedLock manages these rows itself through its
-- JdbcTemplate provider; it is intentionally NOT a JPA entity, so Hibernate's
-- ddl-auto: validate never looks at it.
--
-- The push-notification delivery job is deliberately excluded from ShedLock: it
-- already coordinates concurrent workers with PostgreSQL `FOR UPDATE SKIP
-- LOCKED` (see notification.push_notifications), which lets multiple instances
-- drain the queue in parallel without double-sending.
CREATE TABLE IF NOT EXISTS public.shedlock (
    name       VARCHAR(64)  NOT NULL,
    lock_until TIMESTAMP    NOT NULL,
    locked_at  TIMESTAMP    NOT NULL,
    locked_by  VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);
