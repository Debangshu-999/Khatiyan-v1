-- User-provided repair for one concern whose original resolution was erased.
-- Preserve any date already restored; do not change working status or reopen dates.
UPDATE concern.concerns
SET resolved_at = TIMESTAMPTZ '2026-10-03 16:32:00+05:30',
    version = version + 1
WHERE id = '05b9a9b5-f4ff-4b25-ab5a-1721cbebcdd9'
  AND resolved_at IS NULL;
