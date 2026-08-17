-- The LOCK_IN clause becomes VALIDITY, carrying the agreement's lifetime and the
-- owner's early-exit rule.
--
-- Lock-in no longer exists. The clause that described a minimum stay now
-- describes how long the agreement runs — null months meaning indefinite — and
-- carries the owner's own words for what leaving early costs, replacing the
-- penaltyType/penaltyFixedPaise pair that fed the deleted penalty engine.
--
-- Clauses are stored as JSONB, so both the discriminator and the value shape are
-- rewritten in place. Signed agreements are content-hashed over their clauses;
-- rewriting them here would invalidate those hashes, so only PENDING agreements
-- are touched. An already-accepted agreement keeps the terms it was accepted
-- under, which is the correct outcome — the tenant agreed to that text.

UPDATE compliance.tenancy_agreements
SET clauses = (
        SELECT jsonb_agg(
            CASE
                WHEN clause->>'systemType' = 'LOCK_IN' THEN
                    jsonb_set(
                        jsonb_set(clause, '{systemType}', '"VALIDITY"'),
                        '{value}',
                        jsonb_build_object(
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
        FROM jsonb_array_elements(clauses) WITH ORDINALITY AS t(clause, ordinality)
    )
WHERE status = 'PENDING_ACCEPTANCE'
  AND clauses @> '[{"systemType": "LOCK_IN"}]';
