-- The visit day (user, 2026-10-04). Attendance is marked at the property, by
-- scanning the visitor's pass or entering the code printed on it, not by a
-- handler's review afterwards.
--
-- pass_token / pass_code: the visitor pass for the visit's current slot. The
-- token is what the QR holds, the code is the 6 digits read out when it cannot
-- be scanned. Both are thrown away when the visit moves.
--
-- checked_in_*: who marked attendance, when and how. QR and CODE are done at
-- the door in the slot. OWNER is the owner's missed check-in, after the slot
-- and before midnight, for a visitor nobody scanned.
--
-- arrived_minute: minutes from midnight at check-in, the app's rule for times
-- of day (a TIME column lands 5:30 early through the driver). Null on an
-- owner's missed check-in, where nobody saw them arrive.
--
-- departed_minute, party_size, impression, form_completed_*: the visit form,
-- filled by whoever checked them in.
--
-- no_visit_at: when the night's sweep marked it No visit. The visitor then has
-- a week to say they are still interested by moving it.
ALTER TABLE lead.visits
    ADD COLUMN pass_token VARCHAR(64),
    ADD COLUMN pass_code VARCHAR(6),
    ADD COLUMN checked_in_at TIMESTAMPTZ,
    ADD COLUMN checked_in_by_user_id UUID,
    ADD COLUMN check_in_method VARCHAR(10),
    ADD COLUMN arrived_minute INTEGER,
    ADD COLUMN departed_minute INTEGER,
    ADD COLUMN party_size INTEGER,
    ADD COLUMN impression VARCHAR(10),
    ADD COLUMN form_completed_at TIMESTAMPTZ,
    ADD COLUMN form_completed_by_user_id UUID,
    ADD COLUMN no_visit_at TIMESTAMPTZ,
    ADD CONSTRAINT chk_visits_check_in_method
        CHECK (check_in_method IS NULL OR check_in_method IN ('QR', 'CODE', 'OWNER')),
    ADD CONSTRAINT chk_visits_check_in_complete
        CHECK ((checked_in_at IS NULL) = (checked_in_by_user_id IS NULL)
            AND (checked_in_at IS NULL) = (check_in_method IS NULL)),
    ADD CONSTRAINT chk_visits_impression
        CHECK (impression IS NULL OR impression IN ('LIKED', 'OKAY', 'DISLIKED')),
    ADD CONSTRAINT chk_visits_day_minutes
        CHECK ((arrived_minute IS NULL OR arrived_minute BETWEEN 0 AND 1440)
            AND (departed_minute IS NULL OR departed_minute BETWEEN 0 AND 1440)),
    ADD CONSTRAINT chk_visits_party_size
        CHECK (party_size IS NULL OR party_size BETWEEN 1 AND 20),
    ADD CONSTRAINT chk_visits_form_complete
        CHECK ((form_completed_at IS NULL) = (form_completed_by_user_id IS NULL));

-- A scanned pass finds its visit.
CREATE UNIQUE INDEX uq_visits_pass_token
    ON lead.visits (pass_token)
    WHERE pass_token IS NOT NULL;

-- The Manage Visits screen: one property's visits by date, whatever became of
-- them. The existing slot index covers scheduled ones only.
CREATE INDEX idx_visits_property_date
    ON lead.visits (property_id, visit_date);

-- The night's sweep: visits still scheduled whose date has passed.
CREATE INDEX idx_visits_scheduled_date
    ON lead.visits (visit_date)
    WHERE status = 'SCHEDULED';

-- And the week a No visit waits for its visitor.
CREATE INDEX idx_visits_no_visit_at
    ON lead.visits (no_visit_at)
    WHERE status = 'NOT_VISITED';
