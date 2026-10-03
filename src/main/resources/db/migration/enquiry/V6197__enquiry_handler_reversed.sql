-- The handler's latest reversal of a Not interested back to Interested
-- (owner's design, 2026-10-03), shown in the action log as "Decision reversed
-- by ...: Interested again". The enquirer's own reversal has its column already
-- (tenant_changed_mind_at); this one is management's.
ALTER TABLE enquiry.enquiries
    ADD COLUMN handler_reversed_at TIMESTAMPTZ,
    ADD COLUMN handler_reversed_by_user_id UUID;
