-- Removes the enquiries raised before handlers and attempts existed.
--
-- Owner's decision, 2026-10-03. Those rows were answered under the old rule,
-- where picking a channel marked the enquiry answered on the spot. They have
-- no handler, their responses were backfilled as successes nobody confirmed,
-- and some carry email as a shared channel. Carrying them into the leads
-- pipeline would mean inventing a history for them.
--
-- "Legacy" is exact: raised before V6182 was applied to this database. On a
-- database built from scratch the table is empty when this runs, and it does
-- nothing.
--
-- Their attempts and shared channels go with them (ON DELETE CASCADE).
-- Conversations opened from them are left alone: they are real messages
-- between people and belong to the chat module.
DELETE FROM enquiry.enquiries
WHERE created_at < (
    SELECT installed_on
    FROM flyway_schema_history
    WHERE version = '6182' AND success
);
