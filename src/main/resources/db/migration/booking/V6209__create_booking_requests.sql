-- Booking requests after an attended visit: the owner's settings, the request,
-- its rent offers and its history.
--
-- Plan: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, section 2.
-- Immutable from first write: a correction is a later Flyway version.
--
-- A request is free and holds no bed. The bed is reserved when terms are
-- agreed, in tenancy.bed_holds, and the link to it arrives with the chunk that
-- builds agreement. Nothing here stores money: the token is a record of what
-- the two sides say, and its tables arrive with it.

CREATE SCHEMA IF NOT EXISTS booking;

-- The owner's booking settings, one row per property. No row means the owner
-- has not set bookings up, and the property takes no requests.
CREATE TABLE booking.settings (
    -- property.properties.id. No FK: cross-module.
    property_id UUID NOT NULL,
    token_required BOOLEAN NOT NULL,
    -- Kept while the token is switched off, so switching it back on restores it.
    token_amount_paise BIGINT,
    -- Whether the token comes back when the tenant is the one who cancels.
    token_refundable BOOLEAN,
    -- How many days ahead a tenant may choose a move-in date.
    maximum_advance_days INTEGER NOT NULL,
    -- Whether tenants also see beds that an approved exit is about to free.
    show_future_vacancies BOOLEAN NOT NULL,
    updated_by_user_id UUID NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_booking_settings PRIMARY KEY (property_id),
    CONSTRAINT chk_booking_settings_token_amount
        CHECK (token_amount_paise IS NULL OR token_amount_paise > 0),
    -- A token that is switched on has an amount and a refund answer.
    CONSTRAINT chk_booking_settings_token_complete
        CHECK (NOT token_required
            OR (token_amount_paise IS NOT NULL AND token_refundable IS NOT NULL)),
    -- Never fewer than the three days of notice a request needs.
    CONSTRAINT chk_booking_settings_advance
        CHECK (maximum_advance_days BETWEEN 3 AND 365)
);

CREATE TABLE booking.requests (
    id UUID NOT NULL,
    reference_code VARCHAR(40) NOT NULL,
    -- property.properties.id. No FK: cross-module.
    property_id UUID NOT NULL,
    -- auth.users.id of the visitor who attended. No FK: cross-module.
    prospect_user_id UUID NOT NULL,
    -- The enquiry and the attended visit this request draws its 30 days from.
    -- No FK: cross-module.
    enquiry_id UUID NOT NULL,
    visit_id UUID NOT NULL,
    -- Which of the visit's two requests this is. Null once the slot is given
    -- back, because the property never answered or cancelled after agreeing.
    visit_slot INTEGER,
    -- The app's own key for one tap of Send, so a retry is the same request.
    idempotency_key VARCHAR(80) NOT NULL,

    -- What the tenant was shown, frozen at submission. A later change to the
    -- property, the room or the owner's settings never alters an open request.
    property_name VARCHAR(120) NOT NULL,
    room_id UUID NOT NULL,
    room_number VARCHAR(40) NOT NULL,
    -- tenancy.tenancy_exit_requests.id when the bed is one being vacated. Null
    -- for a bed that is free today. No FK: cross-module.
    exit_request_id UUID,
    listed_rent_paise BIGINT NOT NULL,
    deposit_paise BIGINT NOT NULL,
    token_required BOOLEAN NOT NULL,
    token_amount_paise BIGINT NOT NULL,
    token_refundable BOOLEAN NOT NULL,

    -- The person as they described themselves. Not an identity check.
    tenant_name VARCHAR(120) NOT NULL,
    tenant_phone VARCHAR(20) NOT NULL,
    tenant_email VARCHAR(254),
    tenant_gender VARCHAR(20) NOT NULL,
    tenant_date_of_birth DATE NOT NULL,

    -- The clocks. No offer, view or assignment moves any of them.
    submitted_at TIMESTAMPTZ NOT NULL,
    booking_date DATE NOT NULL,
    earliest_move_in_date DATE NOT NULL,
    latest_move_in_date DATE NOT NULL,
    original_move_in_date DATE NOT NULL,
    -- The date in force. Later than the original only after the one push.
    move_in_date DATE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,

    -- Null is an indefinite agreement.
    agreement_months INTEGER,

    status VARCHAR(20) NOT NULL,
    -- The offer on the table, copied from booking.offers so a list needs no join.
    current_offer_sequence INTEGER NOT NULL,
    current_offer_by VARCHAR(12) NOT NULL,
    current_rent_paise BIGINT NOT NULL,
    current_offer_negotiable BOOLEAN NOT NULL,

    closed_at TIMESTAMPTZ,
    -- Set only when a tenant cancels a confirmed booking that took no token.
    cooldown_until TIMESTAMPTZ,

    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_booking_requests PRIMARY KEY (id),
    CONSTRAINT uq_booking_requests_reference_code UNIQUE (reference_code),
    CONSTRAINT uq_booking_requests_idempotency UNIQUE (prospect_user_id, idempotency_key),
    CONSTRAINT chk_booking_requests_status
        CHECK (status IN ('AWAITING_HANDLER', 'AWAITING_TENANT', 'AWAITING_TOKEN',
                          'CONFIRMED', 'CANCELLED', 'EXPIRED')),
    -- Over means it has a time. Open means it has none.
    CONSTRAINT chk_booking_requests_closed
        CHECK ((status IN ('CANCELLED', 'EXPIRED')) = (closed_at IS NOT NULL)),
    CONSTRAINT chk_booking_requests_visit_slot
        CHECK (visit_slot IS NULL OR visit_slot IN (1, 2)),
    CONSTRAINT chk_booking_requests_money
        CHECK (listed_rent_paise > 0 AND current_rent_paise > 0 AND deposit_paise >= 0),
    CONSTRAINT chk_booking_requests_token
        CHECK ((token_required AND token_amount_paise > 0)
            OR (NOT token_required AND token_amount_paise = 0 AND NOT token_refundable)),
    CONSTRAINT chk_booking_requests_agreement
        CHECK (agreement_months IS NULL OR agreement_months BETWEEN 1 AND 11),
    CONSTRAINT chk_booking_requests_bounds
        CHECK (earliest_move_in_date > booking_date
            AND latest_move_in_date >= earliest_move_in_date
            AND original_move_in_date BETWEEN earliest_move_in_date AND latest_move_in_date
            AND move_in_date >= original_move_in_date),
    CONSTRAINT chk_booking_requests_clock
        CHECK (expires_at > submitted_at),
    -- Only management can make an offer that cannot be countered.
    CONSTRAINT chk_booking_requests_offer
        CHECK (current_offer_sequence >= 1
            AND current_offer_by IN ('TENANT', 'MANAGEMENT')
            AND (current_offer_by = 'MANAGEMENT' OR current_offer_negotiable))
);

-- One open request or booking per person per property.
CREATE UNIQUE INDEX uq_booking_requests_open_per_prospect_property
    ON booking.requests (property_id, prospect_user_id)
    WHERE status IN ('AWAITING_HANDLER', 'AWAITING_TENANT', 'AWAITING_TOKEN', 'CONFIRMED');

-- One confirmed booking per person across the app.
CREATE UNIQUE INDEX uq_booking_requests_confirmed_per_prospect
    ON booking.requests (prospect_user_id)
    WHERE status = 'CONFIRMED';

-- Two requests per attended visit: each takes slot 1 or slot 2.
CREATE UNIQUE INDEX uq_booking_requests_visit_slot
    ON booking.requests (visit_id, visit_slot)
    WHERE visit_slot IS NOT NULL;

-- The property's list and the tenant's own, newest first.
CREATE INDEX idx_booking_requests_property_submitted
    ON booking.requests (property_id, submitted_at DESC, id DESC);

CREATE INDEX idx_booking_requests_prospect_submitted
    ON booking.requests (prospect_user_id, submitted_at DESC, id DESC);

-- The expiry sweep: requests still being negotiated, by their deadline.
CREATE INDEX idx_booking_requests_pending_expiry
    ON booking.requests (expires_at)
    WHERE status IN ('AWAITING_HANDLER', 'AWAITING_TENANT');

-- Every rent offer made on a request, in order. Append-only: a counter adds a
-- row and never changes an earlier one.
CREATE TABLE booking.offers (
    id UUID NOT NULL,
    request_id UUID NOT NULL,
    sequence INTEGER NOT NULL,
    made_by VARCHAR(12) NOT NULL,
    -- auth.users.id. No FK: cross-module.
    actor_user_id UUID NOT NULL,
    monthly_rent_paise BIGINT NOT NULL,
    negotiable BOOLEAN NOT NULL,
    made_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_booking_offers PRIMARY KEY (id),
    CONSTRAINT fk_booking_offers_request
        FOREIGN KEY (request_id)
        REFERENCES booking.requests (id)
        ON DELETE CASCADE,
    CONSTRAINT uq_booking_offers_request_sequence UNIQUE (request_id, sequence),
    CONSTRAINT chk_booking_offers_sequence CHECK (sequence >= 1),
    CONSTRAINT chk_booking_offers_made_by CHECK (made_by IN ('TENANT', 'MANAGEMENT')),
    CONSTRAINT chk_booking_offers_rent CHECK (monthly_rent_paise > 0),
    CONSTRAINT chk_booking_offers_final CHECK (made_by = 'MANAGEMENT' OR negotiable)
);

-- What happened to a request, in order. Append-only.
CREATE TABLE booking.actions (
    id UUID NOT NULL,
    request_id UUID NOT NULL,
    type VARCHAR(30) NOT NULL,
    -- Null for something the system did, such as an expiry.
    party VARCHAR(12),
    -- auth.users.id. No FK: cross-module.
    actor_user_id UUID,
    offer_sequence INTEGER,
    status_after VARCHAR(20) NOT NULL,
    note VARCHAR(500),
    occurred_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_booking_actions PRIMARY KEY (id),
    CONSTRAINT fk_booking_actions_request
        FOREIGN KEY (request_id)
        REFERENCES booking.requests (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_booking_actions_party
        CHECK (party IS NULL OR party IN ('TENANT', 'MANAGEMENT')),
    -- A person's action names the person. The system's names nobody.
    CONSTRAINT chk_booking_actions_actor
        CHECK ((party IS NULL) = (actor_user_id IS NULL))
);

CREATE INDEX idx_booking_actions_request
    ON booking.actions (request_id, occurred_at, id);
