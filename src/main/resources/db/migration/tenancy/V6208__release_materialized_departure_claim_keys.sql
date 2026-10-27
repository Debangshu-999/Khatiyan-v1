-- Immutable from first write. A WAITING promise owns a future departure;
-- once HELD, its physical room reservation owns that freed bed instead.
-- Keeping the former occupant locked after a move wrongly prevents promising
-- or ending their genuinely different bed in the new room.
DROP INDEX tenancy.uq_bed_hold_departure;
CREATE UNIQUE INDEX uq_bed_hold_departure ON tenancy.bed_holds (departing_tenancy_id)
    WHERE departing_tenancy_id IS NOT NULL AND state = 'WAITING';

-- A fresh legacy write must not claim an already-freed source and silently
-- skip physical capacity allocation. Existing owners can still upsert their
-- materialized record; historical HELD rows were backfilled by V6207.
CREATE FUNCTION tenancy.guard_materialized_bed_hold_insert() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.departing_tenancy_id IS NOT NULL AND NEW.state = 'HELD'
       AND NOT EXISTS (SELECT 1 FROM tenancy.bed_holds h
                       WHERE h.owner_kind = NEW.owner_kind AND h.owner_id = NEW.owner_id) THEN
        RAISE EXCEPTION 'A freed departure requires live capacity allocation, not a new future promise'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_materialized_bed_hold_insert BEFORE INSERT ON tenancy.bed_holds
    FOR EACH ROW EXECUTE FUNCTION tenancy.guard_materialized_bed_hold_insert();
