-- A nudge: a short, one-way message from management to one tenant.
--
-- Deliberately its own table rather than a notification row. A notification is
-- system-generated with derived text; a nudge is free text one person wrote
-- about another's rent or behaviour, so it needs an author, a recipient and a
-- permanent record of what was said. It also has to answer two questions the
-- notification tables cannot: "what have I sent for this property" (the owner's
-- Sent tab) and "when was this tenant last nudged" (the cooldown).
--
-- Nudges are never cleared and never archived. The screens window to the last
-- seven days; the rows behind them stay.

CREATE SCHEMA IF NOT EXISTS nudge;

CREATE TABLE nudge.nudges (
    id UUID NOT NULL,
    property_id UUID NOT NULL,
    -- The tenancy, not just the user: the cooldown is per stay, and a tenant who
    -- leaves and returns starts clean rather than inheriting an old timer.
    tenancy_id UUID NOT NULL,
    recipient_user_id UUID NOT NULL,
    -- Owner or manager. Kept so the Sent tab can say who sent it — once managers
    -- can nudge, "from your owner" stops being true.
    sender_user_id UUID NOT NULL,
    message VARCHAR(200) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    -- Set when the tenant opens their nudges screen. Drives the unread badge on
    -- the notifications header pill; nothing else reads it.
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_nudges PRIMARY KEY (id)
);

-- The tenant's own screen, newest first.
CREATE INDEX idx_nudges_recipient_sent
    ON nudge.nudges (recipient_user_id, sent_at DESC);

-- The owner's Sent tab, newest first.
CREATE INDEX idx_nudges_property_sent
    ON nudge.nudges (property_id, sent_at DESC);

-- The cooldown check, which reads exactly one row per candidate tenant.
CREATE INDEX idx_nudges_tenancy_sent
    ON nudge.nudges (tenancy_id, sent_at DESC);
