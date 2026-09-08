-- Where to put a bill back when a payment claim is rejected.
--
-- Null except while a bill is CONFIRMATION_PENDING. Without it a rejection has
-- to guess between UNPAID and OVERDUE, and guessing UNPAID would clear an
-- overdue flag the tenant never earned their way out of.
--
-- Its own migration rather than an edit to V6124: that one had already been
-- applied by the running app, and changing an applied file is a checksum
-- mismatch that refuses to boot. `flyway repair` is the wrong tool for it — it
-- rewrites the recorded checksum without running the new statement, so the
-- column would still be missing and ddl-auto:validate would fail instead.
ALTER TABLE billing.billing_cycles
    ADD COLUMN status_before_confirmation VARCHAR(24);
