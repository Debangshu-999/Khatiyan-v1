-- The stay-out reason is the tenant's own words (user, 2026-11-08), not a
-- fixed list. Rows written under the list keep their value as text.

ALTER TABLE tenancy.stay_outs DROP CONSTRAINT chk_stay_outs_reason;
ALTER TABLE tenancy.stay_outs ALTER COLUMN reason TYPE varchar(200);
