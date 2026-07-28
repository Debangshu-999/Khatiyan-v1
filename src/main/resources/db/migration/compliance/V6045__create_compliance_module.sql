-- Compliance module: per-property agreement settings + per-tenancy agreements.
-- Agreements apply to MONTHLY tenancies only. A tenancy agreement is a copy of
-- the property's default clause set, editable while pending and frozen
-- (immutable + content hash) once accepted — the accepted row is the legal
-- snapshot and the ruleset later enforcement reads.
CREATE SCHEMA IF NOT EXISTS compliance;

CREATE TABLE compliance.property_agreement_settings (
    id                UUID PRIMARY KEY,
    property_id       UUID NOT NULL UNIQUE,
    mode              VARCHAR(20) NOT NULL,
    default_clauses   JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL,
    updated_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE compliance.tenancy_agreements (
    id                   UUID PRIMARY KEY,
    tenancy_id           UUID NOT NULL UNIQUE,
    property_id          UUID NOT NULL,
    status               VARCHAR(20) NOT NULL,
    clauses              JSONB NOT NULL DEFAULT '[]'::jsonb,
    content_hash         VARCHAR(128) NULL,
    accepted_by_user_id  UUID NULL,
    accepted_at          TIMESTAMPTZ NULL,
    created_at           TIMESTAMPTZ NOT NULL,
    updated_at           TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_tenancy_agreements_property ON compliance.tenancy_agreements (property_id);
CREATE INDEX idx_tenancy_agreements_status ON compliance.tenancy_agreements (status);
