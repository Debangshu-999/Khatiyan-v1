-- Older enquiry chats get their question held too (user, 2026-10-03), so an
-- empty one (just opened, or deleted by its reader) can show it behind "View
-- enquiry message". They had it placed as their first message when they were
-- opened, so that message is recorded as placed: the next text must not place
-- it a second time. A one-off read of enquiry.enquiries.
UPDATE chat.chat_threads t
SET opening_message = LEFT(e.message, 1000),
    opening_author_user_id = e.enquirer_user_id,
    opening_message_seq = (SELECT MIN(m.seq) FROM chat.chat_messages m WHERE m.thread_id = t.id)
FROM enquiry.enquiries e
WHERE t.origin = 'ENQUIRY'
  AND t.origin_id = e.id
  AND t.opening_message IS NULL
  AND EXISTS (SELECT 1 FROM chat.chat_messages m WHERE m.thread_id = t.id);
