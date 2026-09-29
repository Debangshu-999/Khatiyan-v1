-- A daily guest's date of birth (owner's rule, 2026-09-27): the guest form asks
-- for it instead of an age, and the manual ID check shows it and makes the 18+
-- check against it, the same as on a monthly stay.
--
-- guest_age stays and is still filled, worked out from the date of birth at
-- check-in: V6117's guest-register constraint requires it, and every reader of
-- the register still reads it. Nullable, since stays registered before today
-- have only an age.
ALTER TABLE tenancy.tenancies
    ADD COLUMN guest_date_of_birth DATE;
