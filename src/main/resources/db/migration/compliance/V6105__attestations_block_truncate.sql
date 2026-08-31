-- Closes the hole a row-level trigger leaves open.
--
-- V6103 rejects UPDATE and DELETE with a BEFORE ... FOR EACH ROW trigger, and
-- that works: both are refused even for the database owner. TRUNCATE is not
-- refused, because it never visits a row and so never fires a row-level
-- trigger. Verified by doing it — the table emptied without complaint.
--
-- That matters more than it looks. The whole argument these records make is
-- "this was written then and has not moved since", and an operation that
-- removes every one of them in a single statement, leaving the same absence as
-- a table nobody ever wrote to, is the cheapest possible attack on it.
--
-- A statement-level trigger does fire, so this is the same guard at the level
-- TRUNCATE operates on.
CREATE TRIGGER trg_attestations_no_truncate
    BEFORE TRUNCATE ON compliance.attestations
    FOR EACH STATEMENT EXECUTE FUNCTION compliance.attestations_are_append_only();

-- Still reachable by DROP TABLE, and deliberately not addressed here: dropping
-- a table needs schema ownership, cannot be done without leaving the schema
-- visibly different, and is not something a trigger can prevent. That one is
-- answered by the external anchor rather than by the database — a chain head
-- published outside this system is evidence the table existed and what was in
-- it, whatever later happens to the table.
