-- What an enquirer has agreed a property may contact them on.
--
-- Until now the enquirer's phone went to management unconditionally, because
-- CALL_BACK existed for want of an in-app channel. That handed a responder a
-- prospect's number permanently — saved, messaged, reused, beyond anything this
-- app can revoke. This table is the thing that makes it a decision.
--
-- Shaped like property.manager_permissions: a row IS a grant, the channel is
-- text rather than a database enum because adding one is a product decision,
-- and the absence of a live row means "not granted" without needing a backfill.
--
-- One difference from that table, which revokes by DELETING the row. Here a
-- revocation is stamped instead, because a deleted consent record cannot be
-- reconstructed and "they agreed, then withdrew" is precisely the thing you may
-- later need to show. An absent row proves nothing; a deleted one proves less.

CREATE TABLE enquiry.enquiry_channel_consents (
    id UUID NOT NULL,
    -- The enquirer. Per person rather than per enquiry: the grant is a standing
    -- decision they manage from account settings, not something re-asked on
    -- every property.
    user_id UUID NOT NULL,
    -- EnquiryResponseChannel. CHAT is never stored — it is the medium an
    -- enquiry lives in rather than a detail being handed over, so it is always
    -- open and needs no agreement.
    channel VARCHAR(20) NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL,
    -- Null while the grant is live. Set on withdrawal, never cleared: a second
    -- grant is a new row, so the history reads as a sequence of decisions.
    revoked_at TIMESTAMPTZ,
    -- Terms change, and "they agreed" is only a defence if you can say to what.
    terms_version VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_enquiry_channel_consents PRIMARY KEY (id),
    CONSTRAINT chk_enquiry_channel_consents_channel
        CHECK (channel IN ('CALL_BACK', 'EMAIL'))
);

-- One LIVE grant per person per channel. Partial rather than plain, so revoked
-- rows accumulate as history instead of blocking a re-grant — the same trick
-- enquiries themselves use for one-open-enquiry-per-person.
CREATE UNIQUE INDEX uq_enquiry_channel_consents_live
    ON enquiry.enquiry_channel_consents (user_id, channel)
    WHERE revoked_at IS NULL;

-- Every read is "what is this person currently reachable on", which loads the
-- whole set for one user at once.
CREATE INDEX idx_enquiry_channel_consents_user
    ON enquiry.enquiry_channel_consents (user_id);
