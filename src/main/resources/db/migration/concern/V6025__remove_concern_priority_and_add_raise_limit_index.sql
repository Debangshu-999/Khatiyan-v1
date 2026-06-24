ALTER TABLE concern.concerns
    DROP COLUMN IF EXISTS priority;

CREATE INDEX IF NOT EXISTS idx_concerns_raised_by_created_at
    ON concern.concerns (raised_by_user_id, created_at);
