-- Every stored asset needs its Cloudinary public_id alongside its URL.
--
-- Without it a delete is impossible: the URL is a CDN path, not a handle, so
-- removing the row leaves the asset in the account forever. Two tables already
-- carry the column (auth.users, concern.concern_photos); these three were
-- written URL-only before the storage design existed.

ALTER TABLE billing.billing_manual_payments
    ADD COLUMN proof_image_public_id VARCHAR(255);
