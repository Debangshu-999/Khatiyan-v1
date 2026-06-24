ALTER TABLE staff.staff_members
    ADD COLUMN employment_end_reason VARCHAR(500),
    ADD COLUMN employment_review VARCHAR(2000);

ALTER TABLE property.property_managers
    ADD COLUMN employment_end_reason VARCHAR(500),
    ADD COLUMN employment_review VARCHAR(2000);

ALTER TABLE staff.salary_accounts
    ADD COLUMN settlement_amount_paise BIGINT NOT NULL DEFAULT 0
        CONSTRAINT chk_salary_accounts_settlement CHECK (settlement_amount_paise >= 0);
