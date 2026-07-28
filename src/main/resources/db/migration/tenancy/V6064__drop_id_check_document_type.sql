-- Drops the document type recorded a migration ago.
--
-- The declaration only needs to assert that the owner collected and checked the
-- tenant's ID proof and photograph. Which document it was tells us nothing we
-- act on, and the less we hold about someone's identity the better — so it goes.
ALTER TABLE tenancy.tenancies
    DROP CONSTRAINT chk_tenancies_id_check_document_type;

ALTER TABLE tenancy.tenancies
    DROP COLUMN id_check_document_type;
