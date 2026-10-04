-- Visit notifications (user, 2026-10-04).
--
-- To the visitor: a reminder at 10 am the day before, and another two hours
-- before their slot. Each is sent once per date and slot, so both marks are
-- cleared when the visit moves.
--
-- running_late_at: when the visitor said "I'm on my way", past half their slot.
-- The property is told once, and the visit is then left out of the notice that
-- attendance was not marked.
ALTER TABLE lead.visits
    ADD COLUMN reminded_day_before_at TIMESTAMPTZ,
    ADD COLUMN reminded_today_at TIMESTAMPTZ,
    ADD COLUMN running_late_at TIMESTAMPTZ;

-- The property's own notices are about a day or a slot, not one visit: who is
-- coming today, who is coming in the slot about to start, and whose attendance
-- was not marked when a slot ended. One row per notice sent, so each goes out
-- once however often the sweep runs. The day's notice has no slot: -1.
CREATE TABLE lead.visit_notices (
    property_id UUID NOT NULL,
    visit_date DATE NOT NULL,
    slot_start_minute INTEGER NOT NULL,
    kind VARCHAR(30) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_visit_notices PRIMARY KEY (property_id, visit_date, slot_start_minute, kind),
    CONSTRAINT chk_visit_notices_kind
        CHECK (kind IN ('VISITORS_TODAY', 'SLOT_STARTING', 'ATTENDANCE_NOT_MARKED'))
);

-- The sweep reads a day's notices at once, to skip what has gone out.
CREATE INDEX idx_visit_notices_date
    ON lead.visit_notices (visit_date);

-- And the visits of two days, today's and tomorrow's.
CREATE INDEX idx_visits_status_date
    ON lead.visits (status, visit_date);
