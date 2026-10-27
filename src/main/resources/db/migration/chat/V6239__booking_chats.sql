-- Booking chats (user, 2026-10-27): a booking made in the app has a private
-- conversation between the person who booked and whoever handles it, one per
-- booking (the existing unique index on origin and origin_id). Listed under a
-- Bookings section, and read-only once the booking ends.
-- Immutable from first write: a correction is a later Flyway version.

ALTER TABLE chat.chat_threads DROP CONSTRAINT ck_chat_threads_origin;
ALTER TABLE chat.chat_threads ADD CONSTRAINT ck_chat_threads_origin
    CHECK (origin IN ('TENANCY', 'ENQUIRY', 'PERSONAL', 'BOOKING'));
