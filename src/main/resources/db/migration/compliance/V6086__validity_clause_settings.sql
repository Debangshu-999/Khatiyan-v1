-- Retitles the stored VALIDITY clause in each property's default clause set.
--
-- V6083 rewrote tenancy_agreements but missed property_agreement_settings —
-- which is the table the agreement screen actually edits. So every property
-- still showed "Minimum stay (lock-in)" with the old lock-in prose, because a
-- clause's heading and body are STORED, not derived: nothing regenerates them
-- until an owner edits that clause.
--
-- Unlike an accepted agreement, a settings row is a live template with no
-- content hash, so rewriting it is safe and correct.

UPDATE compliance.property_agreement_settings
SET default_clauses = (
        SELECT jsonb_agg(
            CASE
                WHEN clause->>'systemType' IN ('LOCK_IN', 'VALIDITY') THEN
                    clause
                        || jsonb_build_object(
                            'systemType', 'VALIDITY',
                            'heading', 'Agreement validity',
                            'body', 'This agreement runs until the tenancy ends. Either party may end it'
                                || ' with the required notice.',
                            'value', jsonb_build_object(
                                'validityMonths',
                                CASE
                                    WHEN (clause->'value'->>'months')::int > 0
                                        THEN to_jsonb((clause->'value'->>'months')::int)
                                    ELSE 'null'::jsonb
                                END,
                                'earlyExitRule',
                                to_jsonb(COALESCE(clause->'value'->>'earlyExitRule', ''))
                            )
                        )
                ELSE clause
            END
            ORDER BY ordinality
        )
        FROM jsonb_array_elements(default_clauses) WITH ORDINALITY AS t(clause, ordinality)
    )
WHERE default_clauses @> '[{"systemType": "LOCK_IN"}]';
