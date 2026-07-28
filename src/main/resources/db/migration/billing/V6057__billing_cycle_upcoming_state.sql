-- Cycles become real objects before they are payable.
--
-- A cycle is now generated ahead of its period start in UPCOMING state, where
-- it is mutable (owner charges, property late-fee rate). When its payment
-- window opens it activates to UNPAID and freezes: the late-fee rate in force
-- at that instant is stamped onto the row, so a later change to the property
-- policy applies to the next cycle instead of repricing this one.
--
-- Existing rows are already live, so they keep their current status. Their
-- stamped rate is backfilled from the property policy in force today.

ALTER TABLE billing.billing_cycles
    ADD COLUMN late_fee_per_day_paise BIGINT;

UPDATE billing.billing_cycles cycle
SET late_fee_per_day_paise = COALESCE(policy.rent_late_fee_per_day_paise, 0)
FROM property.properties policy
WHERE policy.id = cycle.property_id
  AND cycle.late_fee_per_day_paise IS NULL
  AND cycle.status <> 'UPCOMING';
