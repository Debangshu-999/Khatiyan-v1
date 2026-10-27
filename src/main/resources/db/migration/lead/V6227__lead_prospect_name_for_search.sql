-- The Leads screen searches by name or reference (user's design, 2026-10-17).
--
-- prospect_name  the person's name as it was when the record opened, copied
--                like a booking's tenant name, so the list can be searched
--                without reaching into another module's tables. The name a
--                lead shows is still read fresh.
ALTER TABLE lead.leads
    ADD COLUMN prospect_name VARCHAR(120);

UPDATE lead.leads record
SET prospect_name = person.full_name
FROM auth.users person
WHERE person.id = record.prospect_user_id;
