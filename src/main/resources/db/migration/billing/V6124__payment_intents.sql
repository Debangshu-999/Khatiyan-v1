-- A tenant's claim that they have paid a bill, and the owner's verdict on it.
--
-- This is NOT the parked `payment` module. That one collects through a gateway
-- and holds funds, which is what the RBI Payment Aggregator rules block. Here
-- money never touches us: the app builds a `upi://pay` deep link, the tenant's
-- own banking app moves the money directly to the owner, and what we store is
-- the CLAIM and the owner's confirmation against their own bank statement. No
-- aggregation, so no licence.
--
-- Lives in `billing` rather than a module of its own because it has no
-- independent existence — an intent is always about one billing cycle and its
-- whole purpose is to move that cycle's status. A separate module would need
-- billing to depend on it and it on billing, which is a cycle.

-- Where the money should go. Per property and entirely optional: an owner who
-- collects only in cash never fills this in, and without a VPA the tenant is
-- simply never offered a pay link.
CREATE TABLE billing.property_payment_details (
    property_id UUID NOT NULL,
    -- The UPI address the deep link pays to. Optional on its own — an owner may
    -- record bank details for reference without wanting in-app UPI links.
    upi_vpa VARCHAR(120),
    -- Shown to the tenant as the payee name in their banking app, so it must be
    -- the name their statement will show rather than a display nickname.
    payee_name VARCHAR(120),
    -- Reference only. Never used to move money, never shown to a tenant — this
    -- is the owner's own note of which account the UPI address settles into.
    bank_account_number VARCHAR(34),
    bank_ifsc VARCHAR(11),
    bank_account_holder VARCHAR(120),
    updated_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_property_payment_details PRIMARY KEY (property_id)
);

CREATE TABLE billing.payment_intents (
    id UUID NOT NULL,
    billing_cycle_id UUID NOT NULL,
    -- Denormalized so the owner's review list and the reversal hook never need
    -- to load the cycle to know which property or tenant a claim belongs to.
    property_id UUID NOT NULL,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,

    -- CREATED | TENANT_CANCELLED | TENANT_CONFIRMED | OWNER_VERIFIED | OWNER_REJECTED
    status VARCHAR(24) NOT NULL,

    -- Snapshots, taken when the link was built. The bill cannot change after
    -- activation, but a claim has to be answerable against what the tenant was
    -- actually shown and what their banking app was actually handed — not
    -- against whatever the row says later.
    amount_paise BIGINT NOT NULL,
    reference_code VARCHAR(40) NOT NULL,
    upi_vpa VARCHAR(120) NOT NULL,

    -- What the tenant offered as evidence. Both optional: the spec allows a
    -- success claim with neither, because a tenant who paid should not be
    -- blocked by not knowing where their bank app hides the UTR.
    tenant_reference_text VARCHAR(60),
    tenant_note VARCHAR(500),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- When the tenant said yes or no. Null while CREATED — which is the state an
    -- intent stays in when they close the modal without choosing.
    tenant_decided_at TIMESTAMPTZ,
    owner_decided_at TIMESTAMPTZ,
    owner_decided_by_user_id UUID,

    CONSTRAINT pk_payment_intents PRIMARY KEY (id),
    CONSTRAINT fk_payment_intents_cycle
        FOREIGN KEY (billing_cycle_id)
        REFERENCES billing.billing_cycles (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_payment_intents_status
        CHECK (status IN (
            'CREATED', 'TENANT_CANCELLED', 'TENANT_CONFIRMED', 'OWNER_VERIFIED', 'OWNER_REJECTED')),
    CONSTRAINT chk_payment_intents_amount CHECK (amount_paise > 0),
    -- An owner verdict is never anonymous. Either both halves are recorded or
    -- neither is, so a verified intent can always name who verified it.
    CONSTRAINT chk_payment_intents_owner_decision
        CHECK (
            (status IN ('OWNER_VERIFIED', 'OWNER_REJECTED')
                AND owner_decided_at IS NOT NULL AND owner_decided_by_user_id IS NOT NULL)
            OR (status NOT IN ('OWNER_VERIFIED', 'OWNER_REJECTED')
                AND owner_decided_at IS NULL AND owner_decided_by_user_id IS NULL))
);

-- At most ONE live intent per bill. This IS the "Pay Now stays blocked" rule —
-- enforced in the database rather than only in the service, because the block is
-- the whole point and a double-tap or a retried request must not be able to
-- open a second claim on the same bill.
--
-- CREATED and TENANT_CONFIRMED are the live states. Cancelled and both owner
-- verdicts are terminal and leave the bill free for a fresh attempt.
CREATE UNIQUE INDEX uq_payment_intents_live_per_cycle
    ON billing.payment_intents (billing_cycle_id)
    WHERE status IN ('CREATED', 'TENANT_CONFIRMED');

-- The owner's review queue: claims awaiting a verdict, oldest first so the
-- longest-waiting tenant is answered first.
CREATE INDEX idx_payment_intents_property_pending
    ON billing.payment_intents (property_id, created_at)
    WHERE status = 'TENANT_CONFIRMED';

-- "Does this bill have an open intent" on the tenant's own bill screen.
CREATE INDEX idx_payment_intents_cycle
    ON billing.payment_intents (billing_cycle_id);

-- A tenant's screenshot of the transfer. A child table for the same reason
-- manual payment proofs are one (V6120): a list of images is not a column.
CREATE TABLE billing.payment_intent_proofs (
    payment_intent_id UUID NOT NULL,
    url VARCHAR(500) NOT NULL,
    position INTEGER NOT NULL,

    CONSTRAINT pk_payment_intent_proofs PRIMARY KEY (payment_intent_id, position),
    CONSTRAINT fk_payment_intent_proofs_intent
        FOREIGN KEY (payment_intent_id)
        REFERENCES billing.payment_intents (id)
        ON DELETE CASCADE
);
