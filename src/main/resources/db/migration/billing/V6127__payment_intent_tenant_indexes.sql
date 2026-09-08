-- The two reads the tenant side actually makes.
--
-- V6124 indexed the owner's queue and the "is there a live attempt on this bill"
-- lookup, both of which start from the property or the cycle. The tenant's
-- screens start from the PERSON, and neither of their queries had an index.

-- One bill's whole history of attempts, newest first — the intent ledger shown
-- under a bill. Leads on tenant_user_id rather than billing_cycle_id because
-- every tenant-side query is already scoped to one person, and the ownership
-- check is part of the query rather than a filter after it.
CREATE INDEX idx_payment_intents_tenant_cycle
    ON billing.payment_intents (tenant_user_id, billing_cycle_id, created_at DESC);

-- "Which of this stay's bills have an attempt open" — asked once per bill list
-- so every card can lock its own Pay button. Partial, because the answer only
-- ever concerns live attempts and the terminal rows accumulate forever.
CREATE INDEX idx_payment_intents_tenancy_live
    ON billing.payment_intents (tenancy_id)
    WHERE status IN ('CREATED', 'TENANT_CONFIRMED');
