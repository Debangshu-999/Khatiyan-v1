CREATE TABLE property.room_activities (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    room_id UUID NOT NULL,
    room_number VARCHAR(40) NOT NULL,
    activity_type VARCHAR(40) NOT NULL,
    reason VARCHAR(280),
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_room_activities_property_time
    ON property.room_activities (property_id, occurred_at DESC);
