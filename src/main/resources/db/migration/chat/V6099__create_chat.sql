-- Chat: two-sided conversations between a property's management and the people
-- outside it, plus private one-to-one messages between named people.
--
-- Two shapes, and that is the whole access model:
--
--   kind = TEAM    one outsider talking to the property's management TEAM. The
--                  management side is a role, not a person: it is resolved per
--                  request from whoever currently manages the property, so a
--                  manager added tomorrow can answer and a manager removed today
--                  cannot. Only the outsider gets a members row.
--   kind = DIRECT  exactly two named people, invisible to everyone else. Both
--                  get members rows.
--
-- Visibility is one sentence: you may read a thread if you are a member of it,
-- or it is a TEAM thread and you have chat access to its property.
--
-- No foreign keys to other modules' tables anywhere in this schema. Property,
-- tenancy, enquiry and user ids are stored bare. That is deliberate and is what
-- keeps this module movable to its own backend later without unpicking
-- constraints that cross a boundary it is supposed to respect.

CREATE SCHEMA IF NOT EXISTS chat;

CREATE TABLE chat.chat_threads (
    id UUID NOT NULL,
    -- Always set, including for DIRECT threads: it scopes access, it scopes the
    -- management lists, and a thread belonging to no property could not be
    -- placed in any of them.
    property_id UUID NOT NULL,
    kind TEXT NOT NULL,
    origin TEXT NOT NULL,
    -- The tenancy or enquiry this thread belongs to. NULL for PERSONAL.
    origin_id UUID,
    -- DIRECT + PERSONAL only: property id and the two user ids sorted, so two
    -- people cannot accumulate duplicate one-to-one threads. Deliberately NOT
    -- set for enquiry threads even though those are DIRECT too — a prospect may
    -- enquire again after the first is answered and the same manager may answer
    -- again, which is two legitimate threads between the same pair. Keyed on the
    -- pair they would collide and the second enquiry could never open.
    pair_key TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    -- Denormalised so the list screen is one query. Without it every row in a
    -- conversation list is a correlated subquery, on the screen most likely to
    -- be reopened.
    last_message_at TIMESTAMPTZ,
    last_message_seq BIGINT,
    last_message_preview VARCHAR(140),
    last_message_kind TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_chat_threads PRIMARY KEY (id),
    CONSTRAINT ck_chat_threads_kind CHECK (kind IN ('TEAM', 'DIRECT')),
    CONSTRAINT ck_chat_threads_origin CHECK (origin IN ('TENANCY', 'ENQUIRY', 'PERSONAL')),
    CONSTRAINT ck_chat_threads_status CHECK (status IN ('OPEN', 'READ_ONLY')),
    -- PERSONAL never has an origin_id; the others always do.
    CONSTRAINT ck_chat_threads_origin_id CHECK (
        (origin = 'PERSONAL' AND origin_id IS NULL)
        OR (origin <> 'PERSONAL' AND origin_id IS NOT NULL)
    ),
    -- pair_key belongs to PERSONAL threads and only those.
    CONSTRAINT ck_chat_threads_pair_key CHECK (
        (origin = 'PERSONAL' AND pair_key IS NOT NULL)
        OR (origin <> 'PERSONAL' AND pair_key IS NULL)
    ),
    CONSTRAINT ck_chat_threads_last_message_kind CHECK (
        last_message_kind IS NULL OR last_message_kind IN ('TEXT', 'IMAGE', 'FILE')
    )
);

-- One thread per tenancy and one per enquiry. This is what makes "open or
-- create" safe under a double tap: the second insert loses rather than making a
-- second conversation nobody can see the other half of.
CREATE UNIQUE INDEX uq_chat_threads_origin
    ON chat.chat_threads (origin, origin_id)
    WHERE origin_id IS NOT NULL;

-- The same guarantee for personal threads, keyed on the pair instead.
CREATE UNIQUE INDEX uq_chat_threads_pair
    ON chat.chat_threads (pair_key)
    WHERE pair_key IS NOT NULL;

-- The management sections: My chats, Tenants and Enquiries are all this index
-- with different kind/origin values, newest conversation first.
CREATE INDEX idx_chat_threads_property_section
    ON chat.chat_threads (property_id, kind, origin, last_message_at DESC);

-- Named participants.
--
-- TEAM threads hold exactly one row, the outsider. The management side is NOT
-- listed: writing it down would freeze a set that changes, and a manager added
-- next week would be locked out of a conversation they are supposed to cover.
-- DIRECT threads hold exactly two rows.
CREATE TABLE chat.chat_thread_members (
    id UUID NOT NULL,
    thread_id UUID NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_chat_thread_members PRIMARY KEY (id),
    CONSTRAINT uq_chat_thread_members UNIQUE (thread_id, user_id),
    CONSTRAINT fk_chat_thread_members_thread
        FOREIGN KEY (thread_id) REFERENCES chat.chat_threads (id) ON DELETE CASCADE
);

-- "Which threads am I in", for the counterpart's own list.
CREATE INDEX idx_chat_thread_members_user
    ON chat.chat_thread_members (user_id);

CREATE TABLE chat.chat_messages (
    id UUID NOT NULL,
    -- Ordering runs on this, never on created_at. Timestamps are not unique, and
    -- a conversation ordered by a value two messages can share reorders itself
    -- between renders. Global rather than per-thread so one column serves every
    -- cursor with no counter row to contend on.
    seq BIGSERIAL NOT NULL,
    thread_id UUID NOT NULL,
    author_user_id UUID NOT NULL,
    -- Null when the message carries only attachments.
    body VARCHAR(2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Soft delete. A hard delete rewrites a conversation both sides have already
    -- read; this renders as "message deleted" and keeps the sequence intact.
    deleted_at TIMESTAMPTZ,

    CONSTRAINT pk_chat_messages PRIMARY KEY (id),
    CONSTRAINT uq_chat_messages_seq UNIQUE (seq),
    CONSTRAINT fk_chat_messages_thread
        FOREIGN KEY (thread_id) REFERENCES chat.chat_threads (id) ON DELETE CASCADE
);

-- Reading a conversation, and the "everything after seq N" poll that keeps the
-- client cheap: both are this index.
CREATE INDEX idx_chat_messages_thread_seq
    ON chat.chat_messages (thread_id, seq DESC);

CREATE TABLE chat.chat_message_attachments (
    id UUID NOT NULL,
    message_id UUID NOT NULL,
    kind TEXT NOT NULL,
    url VARCHAR(500) NOT NULL,
    -- Cloudinary's handle on the asset. Stored so it can be reclaimed later;
    -- note that no orphan sweep exists yet anywhere in this codebase.
    public_id VARCHAR(255),
    -- The name the sender's file had. A public id is not a filename, and
    -- "rent-agreement.pdf" is the entire point of sending a document.
    file_name VARCHAR(120),
    content_type VARCHAR(100),
    size_bytes BIGINT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_chat_message_attachments PRIMARY KEY (id),
    CONSTRAINT ck_chat_message_attachments_kind CHECK (kind IN ('IMAGE', 'FILE')),
    CONSTRAINT fk_chat_message_attachments_message
        FOREIGN KEY (message_id) REFERENCES chat.chat_messages (id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_message_attachments_message
    ON chat.chat_message_attachments (message_id, sort_order);

-- Per person, even for the shared sections.
--
-- A single "handled" flag across management was rejected: a manager reading
-- first would clear the thread from the owner's view entirely, and the owner is
-- accountable for what is said on their property's behalf.
--
-- Rows are written lazily, on first open. A MISSING ROW MEANS EVERYTHING IS
-- UNREAD, which is the right default for a manager who has never looked — do not
-- pre-create rows for every manager, because management membership is resolved
-- per request and a materialised list goes stale the moment someone is removed.
CREATE TABLE chat.chat_read_state (
    id UUID NOT NULL,
    thread_id UUID NOT NULL,
    user_id UUID NOT NULL,
    last_read_seq BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_chat_read_state PRIMARY KEY (id),
    -- The natural key, kept unique so "open or create" cannot race into two
    -- read positions for one person in one thread.
    CONSTRAINT uq_chat_read_state UNIQUE (thread_id, user_id),
    CONSTRAINT fk_chat_read_state_thread
        FOREIGN KEY (thread_id) REFERENCES chat.chat_threads (id) ON DELETE CASCADE
);
