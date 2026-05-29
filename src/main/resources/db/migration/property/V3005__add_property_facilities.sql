CREATE TABLE property.property_facilities (
    property_id UUID NOT NULL,
    facility VARCHAR(40) NOT NULL,

    CONSTRAINT pk_property_facilities
        PRIMARY KEY (property_id, facility),

    CONSTRAINT fk_property_facilities_property
        FOREIGN KEY (property_id)
        REFERENCES property.properties (id)
);

CREATE TABLE property.property_custom_facilities (
    property_id UUID NOT NULL,
    name VARCHAR(80) NOT NULL,

    CONSTRAINT pk_property_custom_facilities
        PRIMARY KEY (property_id, name),

    CONSTRAINT fk_property_custom_facilities_property
        FOREIGN KEY (property_id)
        REFERENCES property.properties (id)
);

CREATE INDEX idx_property_facilities_facility
    ON property.property_facilities (facility, property_id);

CREATE INDEX idx_property_custom_facilities_property
    ON property.property_custom_facilities (property_id, name);
