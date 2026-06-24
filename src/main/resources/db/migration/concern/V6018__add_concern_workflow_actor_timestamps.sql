ALTER TABLE concern.concerns
    ADD COLUMN assigned_by_user_id UUID,
    ADD COLUMN assigned_at TIMESTAMPTZ,
    ADD COLUMN in_progress_by_user_id UUID,
    ADD COLUMN in_progress_at TIMESTAMPTZ;

UPDATE concern.concerns
SET assigned_by_user_id = assigned_to_user_id,
    assigned_at = updated_at
WHERE assigned_to_user_id IS NOT NULL
  AND status IN ('UNDER_REVIEW', 'IN_PROGRESS');

UPDATE concern.concerns
SET in_progress_by_user_id = assigned_to_user_id,
    in_progress_at = updated_at
WHERE assigned_to_user_id IS NOT NULL
  AND status = 'IN_PROGRESS';

CREATE INDEX idx_concerns_property_assigned_activity
    ON concern.concerns (property_id, status, assigned_at DESC)
    WHERE assigned_to_user_id IS NOT NULL;
