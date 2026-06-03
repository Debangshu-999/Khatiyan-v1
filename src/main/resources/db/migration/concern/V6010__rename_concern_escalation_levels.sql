UPDATE concern.concerns
SET escalation_level = 'ATTENTION'
WHERE escalation_level = 'LEVEL_1';

UPDATE concern.concerns
SET escalation_level = 'ESCALATED'
WHERE escalation_level = 'LEVEL_2';

UPDATE concern.concerns
SET escalation_level = 'CRITICAL'
WHERE escalation_level = 'LEVEL_3';
