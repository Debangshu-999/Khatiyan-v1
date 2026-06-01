CREATE TABLE discovery.property_local_place_tags (
    local_place_id UUID NOT NULL,
    tag VARCHAR(40) NOT NULL,

    CONSTRAINT pk_property_local_place_tags
        PRIMARY KEY (local_place_id, tag),

    CONSTRAINT fk_property_local_place_tags_place
        FOREIGN KEY (local_place_id)
        REFERENCES discovery.property_local_places (id)
        ON DELETE CASCADE
);

CREATE INDEX idx_property_local_place_tags_tag
    ON discovery.property_local_place_tags (tag);
