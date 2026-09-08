-- Guest phones, brought into the same form as every account phone.
--
-- A guest stay never touches the auth module, so its number skipped
-- PhoneNumberNormalizer and was stored exactly as typed — ten bare digits. Every
-- account tenant's number went through auth and carries +91. The same person's
-- number therefore read two different ways depending on which kind of stay they
-- were on, and every screen that prints the stored value showed the difference.
--
-- The onboarding form has always asked for the number under a +91 flag, so the
-- country code was part of what the owner entered. It was only ever dropped on
-- the way to the database.
--
-- TenancyService normalizes on write from here on. This is the catch-up.

-- Ten bare digits: the common case, and the one the guest form produced.
UPDATE tenancy.tenancies
   SET guest_phone = '+91' || guest_phone
 WHERE guest_phone IS NOT NULL
   AND guest_phone ~ '^[0-9]{10}$';

-- Twelve digits already carrying the country code, missing only the plus. Runs
-- second on purpose: after the update above every row it touched starts with
-- '+', so a ten-digit number beginning "91" cannot be caught twice.
UPDATE tenancy.tenancies
   SET guest_phone = '+' || guest_phone
 WHERE guest_phone IS NOT NULL
   AND guest_phone ~ '^91[0-9]{10}$';
