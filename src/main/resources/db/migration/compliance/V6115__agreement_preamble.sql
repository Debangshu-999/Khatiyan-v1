-- The head of the deed, stored with it.
--
-- Title, execution line, both party blocks and the WHEREAS recitals. Stored
-- rather than rendered on read so the content hash covers WHO agreed as firmly
-- as what they agreed to — otherwise a tenant editing their own permanent
-- address would silently alter a document they had already signed.
--
-- Nullable: agreements are created with one, but the column cannot be NOT NULL
-- without a default that would be a lie for any row written between this
-- migration and the code that fills it.

ALTER TABLE compliance.tenancy_agreements
    ADD COLUMN preamble JSONB;
