-- V6089 declared this SMALLINT while the entity maps Set<Integer>, and
-- ddl-auto: validate refuses the mismatch — Hibernate wants INTEGER and found
-- int2, which fails the whole context at startup rather than just this table.
--
-- Fixed forward rather than by editing V6089: that migration has already run,
-- and changing an applied migration breaks its checksum on every database that
-- has seen it.
ALTER TABLE notice.recurring_notice_days_of_month
    ALTER COLUMN day_of_month TYPE INTEGER;
