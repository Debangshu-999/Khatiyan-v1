ALTER TABLE concern.concerns
ADD COLUMN escalation_level VARCHAR(20) NOT NULL DEFAULT 'NONE';

CREATE INDEX idx_concerns_property_escalation
ON concern.concerns (property_id, escalation_level, status);

CREATE INDEX idx_concerns_escalation_candidates
ON concern.concerns (status, created_at, escalation_level);
