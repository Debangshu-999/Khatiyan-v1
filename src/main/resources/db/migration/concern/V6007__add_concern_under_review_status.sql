UPDATE concern.concerns
SET status = 'UNDER_REVIEW'
WHERE status = 'OPEN'
  AND assigned_to_user_id IS NOT NULL;
