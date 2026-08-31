-- guest_age was declared SMALLINT in V6117 and the entity maps it to Integer,
-- which ddl-auto: validate refuses — "found [int2], but expecting [integer]".
-- The application would not start.
--
-- Corrected here rather than by editing V6117, which has already been applied:
-- changing an applied migration only trades this failure for a checksum
-- mismatch. On a fresh database this runs straight after V6117 and the column
-- is never SMALLINT for longer than one migration.
--
-- Widening only, so no value can fail to convert.

ALTER TABLE tenancy.tenancies
    ALTER COLUMN guest_age TYPE INTEGER;
