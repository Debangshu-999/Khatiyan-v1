-- Removes the conversations opened from enquiries that no longer exist.
--
-- V6183 removed the enquiries raised before handlers and attempts existed and
-- left their conversations behind. The owner asked for those to go too
-- (2026-10-03): a chat marked "Enquiry" with no enquiry behind it has no
-- handler, no action bar and nothing to close it.
--
-- Members, messages, attachments and read marks go with the thread
-- (ON DELETE CASCADE). On a database built from scratch there are none, and
-- this does nothing.
DELETE FROM chat.chat_threads thread
WHERE thread.origin = 'ENQUIRY'
  AND NOT EXISTS (
      SELECT 1
      FROM enquiry.enquiries enquiry
      WHERE enquiry.id = thread.origin_id
  );
