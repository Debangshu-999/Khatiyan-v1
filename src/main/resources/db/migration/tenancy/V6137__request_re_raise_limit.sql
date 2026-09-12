-- Caps how far a re-raise chain may run.
--
-- A lapsed exit or room change request may be corrected and re-raised, and
-- until now each re-raise opened a fresh carve-out of its own, so the chain had
-- no end. re_raise_count is the depth of the link: 0 on a request the tenant
-- raised fresh, parent + 1 on a re-raise, refused past the limit in the model.
--
-- Stored rather than walked because it is read on every attempt and the chain
-- is only ever followed one link back.

ALTER TABLE tenancy.tenancy_exit_requests
    ADD COLUMN IF NOT EXISTS re_raise_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tenancy.tenancy_room_change_requests
    ADD COLUMN IF NOT EXISTS re_raise_count INTEGER NOT NULL DEFAULT 0;

-- Existing chains get their real depth, so a chain already three long is not
-- handed two more re-raises by the backfill.
WITH RECURSIVE exit_chain AS (
    SELECT id, 0 AS depth
    FROM tenancy.tenancy_exit_requests
    WHERE superseded_request_id IS NULL
    UNION ALL
    SELECT child.id, exit_chain.depth + 1
    FROM tenancy.tenancy_exit_requests child
    JOIN exit_chain ON child.superseded_request_id = exit_chain.id
)
UPDATE tenancy.tenancy_exit_requests request
SET re_raise_count = exit_chain.depth
FROM exit_chain
WHERE request.id = exit_chain.id
  AND request.re_raise_count <> exit_chain.depth;

WITH RECURSIVE room_change_chain AS (
    SELECT id, 0 AS depth
    FROM tenancy.tenancy_room_change_requests
    WHERE superseded_request_id IS NULL
    UNION ALL
    SELECT child.id, room_change_chain.depth + 1
    FROM tenancy.tenancy_room_change_requests child
    JOIN room_change_chain ON child.superseded_request_id = room_change_chain.id
)
UPDATE tenancy.tenancy_room_change_requests request
SET re_raise_count = room_change_chain.depth
FROM room_change_chain
WHERE request.id = room_change_chain.id
  AND request.re_raise_count <> room_change_chain.depth;

ALTER TABLE tenancy.tenancy_exit_requests
    ADD CONSTRAINT chk_exit_requests_re_raise_count CHECK (re_raise_count >= 0);

ALTER TABLE tenancy.tenancy_room_change_requests
    ADD CONSTRAINT chk_room_change_requests_re_raise_count CHECK (re_raise_count >= 0);
