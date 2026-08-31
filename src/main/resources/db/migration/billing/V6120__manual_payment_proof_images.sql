-- A manual payment can carry more than one proof image.
--
-- One photo was never quite enough: a cheque has a face and a counterfoil, a
-- card slip has the merchant copy and the customer copy, and a UPI payment is
-- often screenshotted twice — the app's confirmation and the bank's SMS. The
-- owner was choosing which half of the evidence to keep.
--
-- A child table rather than a second column. Two is today's cap and it is a
-- FORM rule, not a storage one: raising it later should be a number in a
-- validator, not another migration widening the row.

CREATE TABLE billing.billing_manual_payment_proofs (
    manual_payment_id UUID    NOT NULL,
    image_url         VARCHAR(600) NOT NULL,
    -- Ordinal, so the images come back in the order they were attached rather
    -- than in whatever order the database happens to return them.
    position          INTEGER NOT NULL,

    PRIMARY KEY (manual_payment_id, position),
    CONSTRAINT fk_manual_payment_proofs_payment
        FOREIGN KEY (manual_payment_id)
        REFERENCES billing.billing_manual_payments (id)
        ON DELETE CASCADE
);

-- Every proof already recorded becomes the first image of its payment. Done
-- before the column goes, so nothing that an owner attached is lost.
INSERT INTO billing.billing_manual_payment_proofs (manual_payment_id, image_url, position)
SELECT id, proof_image_url, 0
FROM billing.billing_manual_payments
WHERE proof_image_url IS NOT NULL
  AND btrim(proof_image_url) <> '';

-- Dropped rather than left in place. Two sources for the same fact is how they
-- drift, and the rows above carry everything this column held.
ALTER TABLE billing.billing_manual_payments
    DROP COLUMN proof_image_url;
