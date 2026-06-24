CREATE SCHEMA IF NOT EXISTS staff;

ALTER TABLE property.property_managers
    ADD COLUMN IF NOT EXISTS reference_code VARCHAR(40)
        DEFAULT ('MGR-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-'
            || LPAD(nextval('shared.reference_code_seq')::TEXT, 6, '0')),
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS aadhaar_last_four VARCHAR(4),
    ADD COLUMN IF NOT EXISTS pan_last_four VARCHAR(4),
    ADD COLUMN IF NOT EXISTS identity_verification_status VARCHAR(24) NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS salary_structure VARCHAR(16) NOT NULL DEFAULT 'MONTHLY',
    ADD COLUMN IF NOT EXISTS salary_rate_paise BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS benefits_summary TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS employment_start_date DATE,
    ADD COLUMN IF NOT EXISTS employment_end_date DATE,
    ADD COLUMN IF NOT EXISTS employment_notes TEXT NOT NULL DEFAULT '';

UPDATE property.property_managers
SET reference_code = 'MGR-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-'
    || LPAD(nextval('shared.reference_code_seq')::TEXT, 6, '0')
WHERE reference_code IS NULL;

ALTER TABLE property.property_managers
    ALTER COLUMN reference_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_property_managers_reference_code
    ON property.property_managers (reference_code);

ALTER TABLE property.property_managers
    DROP CONSTRAINT IF EXISTS chk_property_managers_salary_rate;

ALTER TABLE property.property_managers
    ADD CONSTRAINT chk_property_managers_salary_rate
        CHECK (salary_rate_paise >= 0),
    ADD CONSTRAINT chk_property_managers_employment_dates
        CHECK (employment_end_date IS NULL OR employment_start_date IS NULL
            OR employment_end_date >= employment_start_date),
    ADD CONSTRAINT chk_property_managers_aadhaar_last_four
        CHECK (aadhaar_last_four IS NULL OR aadhaar_last_four ~ '^[0-9]{4}$'),
    ADD CONSTRAINT chk_property_managers_pan_last_four
        CHECK (pan_last_four IS NULL OR pan_last_four ~ '^[A-Z0-9]{4}$');

CREATE TABLE IF NOT EXISTS staff.staff_categories (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(120) NOT NULL,
    system_key VARCHAR(32),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_staff_categories_property FOREIGN KEY (property_id) REFERENCES property.properties (id),
    CONSTRAINT chk_staff_categories_system_key CHECK ((is_system = TRUE AND system_key IS NOT NULL) OR (is_system = FALSE AND system_key IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_categories_property_normalized_name
    ON staff.staff_categories (property_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_staff_categories_property_active
    ON staff.staff_categories (property_id, is_active);

CREATE TABLE IF NOT EXISTS staff.staff_members (
    id UUID PRIMARY KEY,
    reference_code VARCHAR(40) NOT NULL UNIQUE,
    property_id UUID NOT NULL,
    category_id UUID NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    date_of_birth DATE,
    aadhaar_last_four VARCHAR(4),
    pan_last_four VARCHAR(4),
    identity_verification_status VARCHAR(24) NOT NULL DEFAULT 'NOT_STARTED',
    identity_verified_at TIMESTAMPTZ,
    salary_structure VARCHAR(16) NOT NULL,
    salary_rate_paise BIGINT NOT NULL,
    benefits_summary TEXT NOT NULL DEFAULT '',
    employment_start_date DATE NOT NULL,
    employment_end_date DATE,
    employment_notes TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_staff_members_property FOREIGN KEY (property_id) REFERENCES property.properties (id),
    CONSTRAINT fk_staff_members_category FOREIGN KEY (category_id) REFERENCES staff.staff_categories (id),
    CONSTRAINT chk_staff_members_salary_rate CHECK (salary_rate_paise > 0),
    CONSTRAINT chk_staff_members_employment_dates CHECK (employment_end_date IS NULL OR employment_end_date >= employment_start_date),
    CONSTRAINT chk_staff_members_aadhaar_last_four CHECK (aadhaar_last_four IS NULL OR aadhaar_last_four ~ '^[0-9]{4}$'),
    CONSTRAINT chk_staff_members_pan_last_four CHECK (pan_last_four IS NULL OR pan_last_four ~ '^[A-Z0-9]{4}$')
);

CREATE INDEX IF NOT EXISTS idx_staff_members_property_active ON staff.staff_members (property_id, is_active);
CREATE INDEX IF NOT EXISTS idx_staff_members_category_active ON staff.staff_members (category_id, is_active);

CREATE TABLE IF NOT EXISTS staff.salary_accounts (
    id UUID PRIMARY KEY,
    reference_code VARCHAR(40) NOT NULL UNIQUE,
    property_id UUID NOT NULL,
    property_manager_id UUID,
    staff_member_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    opened_on DATE NOT NULL,
    settled_on DATE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_salary_accounts_property FOREIGN KEY (property_id) REFERENCES property.properties (id),
    CONSTRAINT fk_salary_accounts_manager FOREIGN KEY (property_manager_id) REFERENCES property.property_managers (id),
    CONSTRAINT fk_salary_accounts_staff_member FOREIGN KEY (staff_member_id) REFERENCES staff.staff_members (id),
    CONSTRAINT chk_salary_accounts_exactly_one_owner CHECK (num_nonnulls(property_manager_id, staff_member_id) = 1),
    CONSTRAINT chk_salary_accounts_settlement_date CHECK (settled_on IS NULL OR settled_on >= opened_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_salary_accounts_manager ON staff.salary_accounts (property_manager_id) WHERE property_manager_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_salary_accounts_staff_member ON staff.salary_accounts (staff_member_id) WHERE staff_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_salary_accounts_property_active ON staff.salary_accounts (property_id, is_active);

CREATE TABLE IF NOT EXISTS staff.salary_months (
    id UUID PRIMARY KEY,
    salary_account_id UUID NOT NULL,
    payroll_month DATE NOT NULL,
    salary_structure VARCHAR(16) NOT NULL,
    salary_rate_paise BIGINT NOT NULL,
    payable_days INTEGER,
    base_amount_paise BIGINT NOT NULL DEFAULT 0,
    additions_amount_paise BIGINT NOT NULL DEFAULT 0,
    deductions_amount_paise BIGINT NOT NULL DEFAULT 0,
    gross_amount_paise BIGINT NOT NULL DEFAULT 0,
    net_amount_paise BIGINT NOT NULL DEFAULT 0,
    paid_amount_paise BIGINT NOT NULL DEFAULT 0,
    payment_status VARCHAR(24) NOT NULL DEFAULT 'UNPAID',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_salary_months_account FOREIGN KEY (salary_account_id) REFERENCES staff.salary_accounts (id),
    CONSTRAINT ux_salary_months_account_month UNIQUE (salary_account_id, payroll_month),
    CONSTRAINT chk_salary_months_rate CHECK (salary_rate_paise >= 0),
    CONSTRAINT chk_salary_months_payable_days CHECK (payable_days IS NULL OR payable_days >= 0),
    CONSTRAINT chk_salary_months_amounts CHECK (base_amount_paise >= 0 AND additions_amount_paise >= 0 AND deductions_amount_paise >= 0 AND gross_amount_paise >= 0 AND net_amount_paise >= 0 AND paid_amount_paise >= 0)
);

CREATE INDEX IF NOT EXISTS idx_salary_months_account_month ON staff.salary_months (salary_account_id, payroll_month DESC);

CREATE TABLE IF NOT EXISTS staff.salary_adjustments (
    id UUID PRIMARY KEY,
    salary_month_id UUID NOT NULL,
    adjustment_type VARCHAR(16) NOT NULL,
    amount_paise BIGINT NOT NULL,
    reason VARCHAR(500) NOT NULL,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_salary_adjustments_month FOREIGN KEY (salary_month_id) REFERENCES staff.salary_months (id),
    CONSTRAINT chk_salary_adjustments_amount CHECK (amount_paise > 0)
);

CREATE INDEX IF NOT EXISTS idx_salary_adjustments_month ON staff.salary_adjustments (salary_month_id, created_at ASC);

CREATE TABLE IF NOT EXISTS staff.salary_payments (
    id UUID PRIMARY KEY,
    salary_month_id UUID NOT NULL,
    amount_paise BIGINT NOT NULL,
    paid_on DATE NOT NULL,
    payment_method VARCHAR(24) NOT NULL,
    reference_text VARCHAR(120),
    notes VARCHAR(500) NOT NULL DEFAULT '',
    recorded_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_salary_payments_month FOREIGN KEY (salary_month_id) REFERENCES staff.salary_months (id),
    CONSTRAINT chk_salary_payments_amount CHECK (amount_paise > 0)
);

CREATE INDEX IF NOT EXISTS idx_salary_payments_month_paid_on ON staff.salary_payments (salary_month_id, paid_on DESC);
