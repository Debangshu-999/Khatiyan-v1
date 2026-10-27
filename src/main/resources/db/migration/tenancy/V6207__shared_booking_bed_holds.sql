-- Immutable from first write. Corrections must use a newer Flyway version.
-- One authority for both prospect bookings and legacy future tenancies.
CREATE TABLE tenancy.bed_holds (
    id UUID PRIMARY KEY,
    owner_kind VARCHAR(20) NOT NULL CHECK (owner_kind IN ('BOOKING', 'TENANCY')),
    owner_id UUID NOT NULL,
    property_id UUID NOT NULL REFERENCES property.properties(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES property.rooms(id) ON DELETE CASCADE,
    move_in_date DATE NOT NULL,
    departing_tenancy_id UUID,
    room_change_request_id UUID,
    exit_request_id UUID,
    state VARCHAR(20) NOT NULL CHECK (state IN ('WAITING', 'HELD', 'RELEASED', 'CONSUMED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_bed_hold_owner UNIQUE (owner_kind, owner_id),
    CONSTRAINT chk_bed_hold_source CHECK (
        (departing_tenancy_id IS NULL AND room_change_request_id IS NULL AND exit_request_id IS NULL
            AND owner_kind = 'BOOKING' AND state <> 'WAITING')
        OR (departing_tenancy_id IS NOT NULL
            AND NOT (room_change_request_id IS NOT NULL AND exit_request_id IS NOT NULL)
            AND (owner_kind = 'TENANCY' OR (exit_request_id IS NOT NULL AND room_change_request_id IS NULL))))
);

-- Canonical departing tenancy, not two unrelated move/exit indexes: one bed
-- cannot be sold once through a move and again through an exit.
CREATE UNIQUE INDEX uq_bed_hold_departure ON tenancy.bed_holds (departing_tenancy_id)
    WHERE departing_tenancy_id IS NOT NULL AND state IN ('WAITING', 'HELD');
CREATE INDEX idx_bed_holds_property_live ON tenancy.bed_holds (property_id, state);

-- Retain current legacy reservations exactly as they are; this is ownership
-- metadata only and must not increment room.reserved_count a second time.
INSERT INTO tenancy.bed_holds
    (id, owner_kind, owner_id, property_id, room_id, move_in_date,
     departing_tenancy_id, room_change_request_id, state, created_at, updated_at)
SELECT gen_random_uuid(), 'TENANCY', t.id, t.property_id, t.room_id, t.start_date,
       COALESCE(t.future_vacancy_tenancy_id, m.tenancy_id), t.future_vacancy_source_id,
       CASE WHEN m.status = 'EXECUTED'
                 OR d.status IN ('EXITED', 'EVICTED') THEN 'HELD' ELSE 'WAITING' END,
       t.created_at, CURRENT_TIMESTAMP
FROM tenancy.tenancies t
LEFT JOIN tenancy.tenancy_room_change_requests m ON m.id = t.future_vacancy_source_id
JOIN tenancy.tenancies d ON d.id = COALESCE(t.future_vacancy_tenancy_id, m.tenancy_id)
WHERE t.is_active = TRUE AND t.status IN ('PENDING_ACCEPTANCE', 'SCHEDULED')
  AND (t.future_vacancy_source_id IS NOT NULL OR t.future_vacancy_tenancy_id IS NOT NULL);

-- Register/release/consume legacy promises in the SAME write transaction,
-- including a direct legacy insert. The shared unique index is the last guard
-- even if an old caller bypasses its availability preflight.
CREATE FUNCTION tenancy.sync_legacy_bed_hold() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    departure UUID;
    source_property UUID;
    source_room UUID;
    source_freed BOOLEAN;
    new_state VARCHAR(20);
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM tenancy.bed_holds WHERE owner_kind = 'TENANCY' AND owner_id = OLD.id;
        RETURN OLD;
    END IF;

    IF NEW.future_vacancy_source_id IS NULL AND NEW.future_vacancy_tenancy_id IS NULL THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('room-inventory:' || NEW.property_id::text, 0));

    IF NEW.is_active = FALSE THEN
        UPDATE tenancy.bed_holds SET state = 'RELEASED', updated_at = CURRENT_TIMESTAMP, version = version + 1
        WHERE owner_kind = 'TENANCY' AND owner_id = NEW.id AND state IN ('WAITING', 'HELD');
        RETURN NEW;
    END IF;
    IF NEW.status NOT IN ('PENDING_ACCEPTANCE', 'SCHEDULED') THEN
        UPDATE tenancy.bed_holds SET state = 'CONSUMED', updated_at = CURRENT_TIMESTAMP, version = version + 1
        WHERE owner_kind = 'TENANCY' AND owner_id = NEW.id AND state IN ('WAITING', 'HELD');
        RETURN NEW;
    END IF;

    IF NEW.future_vacancy_source_id IS NOT NULL THEN
        SELECT m.tenancy_id, m.property_id, m.current_room_id,
               (m.status = 'EXECUTED' OR d.status IN ('EXITED', 'EVICTED'))
        INTO departure, source_property, source_room, source_freed
        FROM tenancy.tenancy_room_change_requests m JOIN tenancy.tenancies d ON d.id = m.tenancy_id
        WHERE m.id = NEW.future_vacancy_source_id;
    ELSE
        SELECT d.id, d.property_id, d.room_id, d.status IN ('EXITED', 'EVICTED')
        INTO departure, source_property, source_room, source_freed
        FROM tenancy.tenancies d WHERE d.id = NEW.future_vacancy_tenancy_id;
    END IF;
    IF departure IS NULL OR source_property <> NEW.property_id OR source_room <> NEW.room_id THEN
        RAISE EXCEPTION 'Legacy future bed source does not match property and room' USING ERRCODE = '23514';
    END IF;
    new_state := CASE WHEN source_freed THEN 'HELD' ELSE 'WAITING' END;

    INSERT INTO tenancy.bed_holds
        (id, owner_kind, owner_id, property_id, room_id, move_in_date,
         departing_tenancy_id, room_change_request_id, state, created_at, updated_at)
    VALUES (gen_random_uuid(), 'TENANCY', NEW.id, NEW.property_id, NEW.room_id, NEW.start_date,
            departure, NEW.future_vacancy_source_id, new_state, NEW.created_at, CURRENT_TIMESTAMP)
    ON CONFLICT (owner_kind, owner_id) DO UPDATE
    SET state = CASE WHEN tenancy.bed_holds.state = 'WAITING' THEN EXCLUDED.state ELSE tenancy.bed_holds.state END,
        updated_at = CURRENT_TIMESTAMP, version = tenancy.bed_holds.version + 1
    WHERE tenancy.bed_holds.property_id = EXCLUDED.property_id
      AND tenancy.bed_holds.room_id = EXCLUDED.room_id
      AND tenancy.bed_holds.departing_tenancy_id = EXCLUDED.departing_tenancy_id
      AND tenancy.bed_holds.room_change_request_id IS NOT DISTINCT FROM EXCLUDED.room_change_request_id
      AND tenancy.bed_holds.state IN ('WAITING', 'HELD');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Legacy bed hold source cannot be replaced or reopened' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_legacy_bed_hold_write
    AFTER INSERT OR UPDATE OF is_active, status, future_vacancy_source_id, future_vacancy_tenancy_id
    ON tenancy.tenancies FOR EACH ROW EXECUTE FUNCTION tenancy.sync_legacy_bed_hold();
CREATE TRIGGER trg_legacy_bed_hold_delete AFTER DELETE ON tenancy.tenancies
    FOR EACH ROW EXECUTE FUNCTION tenancy.sync_legacy_bed_hold();
