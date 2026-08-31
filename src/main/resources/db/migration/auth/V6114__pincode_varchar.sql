-- CHAR(6) was the wrong choice in V6110.
--
-- Postgres reports CHAR as bpchar, which ddl-auto:validate rejects against a
-- @Column(length = 6) String — that maps to varchar(6). Blank-padded CHAR is
-- also simply wrong for a PIN code: it pads every value to width and compares
-- ignoring trailing spaces, so a stray space would read as equal.
--
-- A forward migration rather than an edit to V6110: that one is already applied,
-- and changing it in place would swap this failure for a checksum mismatch.

ALTER TABLE auth.users
    ALTER COLUMN permanent_address_pincode TYPE VARCHAR(6);
