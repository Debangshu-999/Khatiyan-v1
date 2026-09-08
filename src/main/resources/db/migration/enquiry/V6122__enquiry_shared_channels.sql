-- The channels an enquirer agreed to AT THE MOMENT THEY ASKED, frozen.
--
-- Consent is a standing, per-person decision (enquiry_channel_consents), but
-- reading it live meant an enquiry already sitting in a property's queue could
-- change shape underneath them: someone turns their phone off in account
-- settings and a number the property was told it could call disappears from a
-- conversation already underway.
--
-- So the set is snapshotted onto the enquiry when it is raised. Changing the
-- standing decision governs the NEXT enquiry and leaves earlier ones exactly as
-- they were asked. That makes withdrawal forward-only in the strict sense, which
-- is also the only sense the copy can honestly promise — a channel cannot be
-- pulled back out of a conversation that already happened.

CREATE TABLE enquiry.enquiry_shared_channels (
    enquiry_id UUID NOT NULL,
    -- EnquiryResponseChannel. CHAT never appears: it is always open and is not
    -- part of what anyone agreed to share.
    channel VARCHAR(20) NOT NULL,

    CONSTRAINT pk_enquiry_shared_channels PRIMARY KEY (enquiry_id, channel),
    CONSTRAINT fk_enquiry_shared_channels_enquiry
        FOREIGN KEY (enquiry_id)
        REFERENCES enquiry.enquiries (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_enquiry_shared_channels_channel
        CHECK (channel IN ('CALL_BACK', 'EMAIL'))
);

-- Deliberately NOT backfilled. Every enquiry raised before consent existed was
-- raised without anyone agreeing to anything, and inventing rows for them would
-- be manufacturing a consent that was never given. They read as "no channels",
-- which is the truth, and the enquirer can raise a fresh one.
