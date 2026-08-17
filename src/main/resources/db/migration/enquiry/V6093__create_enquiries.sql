-- A prospective tenant asking a property a question from its public profile.
--
-- The enquiry is the thread root. Chat is meant to extend this rather than
-- replace it, so the owner's reply is a ROW IN ITS OWN TABLE rather than a pair
-- of columns here — adding messages later is then additive instead of a
-- reshape.
--
-- Today a "response" is a commitment to a channel ("I'll call you"), not a
-- message. That is deliberately still a response record: the channel, who chose
-- it, and when.

CREATE SCHEMA IF NOT EXISTS enquiry;

CREATE TABLE enquiry.enquiries (
    id UUID NOT NULL,
    property_id UUID NOT NULL,
    -- Sign-in is required to enquire. An enquiry is a request to be contacted,
    -- and it is worthless without a name and a verified phone behind it.
    enquirer_user_id UUID NOT NULL,
    message VARCHAR(500) NOT NULL,
    -- NEW or RESPONDED. Derivable from the responses table, kept explicit so the
    -- owner's "New" filter is an index lookup rather than a NOT EXISTS.
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_enquiries PRIMARY KEY (id)
);

-- One OPEN enquiry per person per property. This is what stops a profile being
-- spammed, and it is why the profile button can say "Enquiry sent" instead of
-- offering to send another. Once answered they may enquire again.
CREATE UNIQUE INDEX uq_enquiries_open_per_user_property
    ON enquiry.enquiries (property_id, enquirer_user_id)
    WHERE status = 'NEW';

-- The owner's list, newest first, scoped to the active property.
CREATE INDEX idx_enquiries_property_created
    ON enquiry.enquiries (property_id, created_at DESC);

-- "Have I already enquired about this property" on the profile screen.
CREATE INDEX idx_enquiries_enquirer_created
    ON enquiry.enquiries (enquirer_user_id, created_at DESC);

CREATE TABLE enquiry.enquiry_responses (
    id UUID NOT NULL,
    enquiry_id UUID NOT NULL,
    -- CALL_BACK, EMAIL or CHAT. CHAT is declared but unreachable until chat
    -- exists; it is here so the enum does not need a migration later.
    channel VARCHAR(20) NOT NULL,
    -- Owner or manager. Whoever answered is part of the record.
    responded_by_user_id UUID NOT NULL,
    note VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_enquiry_responses PRIMARY KEY (id),
    CONSTRAINT fk_enquiry_responses_enquiry
        FOREIGN KEY (enquiry_id)
        REFERENCES enquiry.enquiries (id)
        ON DELETE CASCADE
);

CREATE INDEX idx_enquiry_responses_enquiry
    ON enquiry.enquiry_responses (enquiry_id, created_at DESC);
