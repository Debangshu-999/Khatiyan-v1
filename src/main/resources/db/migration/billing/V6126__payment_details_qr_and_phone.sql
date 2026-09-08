-- Two more ways to be paid, both shown to the tenant.
--
-- A deep link only works on the device the app is running on. A QR covers the
-- tenant who wants to scan it from another phone, or whose banking app never
-- came to the front when the link fired. A UPI-linked phone number covers the
-- app that asks for a number rather than an address.
ALTER TABLE billing.property_payment_details
    -- The owner's uploaded QR image. Shown to tenants, unlike the bank fields.
    ADD COLUMN upi_qr_image_url VARCHAR(500),
    -- Ten digits. Stored bare because that is what a tenant types into their
    -- UPI app, not the +91 form the account phones carry.
    ADD COLUMN upi_phone VARCHAR(10);

-- The address is no longer the only way to be paid, so an intent can be opened
-- against a property that offers only a QR or only a number. The snapshot then
-- has no address to record.
--
-- Still snapshotted when there IS one: a claim has to be answerable against the
-- address the tenant's banking app was actually handed.
ALTER TABLE billing.payment_intents
    ALTER COLUMN upi_vpa DROP NOT NULL;
