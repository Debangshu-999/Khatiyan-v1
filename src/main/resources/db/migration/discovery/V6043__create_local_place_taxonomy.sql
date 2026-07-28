-- Category -> subcategory taxonomy for nearby places. Curated rows are global
-- (property_id NULL, is_custom false) and carry search keywords; owner-custom
-- rows are scoped to a property. Places link to subcategories via a join table
-- that replaces the flat property_local_place_tags element collection.

CREATE TABLE discovery.local_place_categories (
    id              UUID PRIMARY KEY,
    slug            VARCHAR(40)  NOT NULL UNIQUE,
    name            VARCHAR(60)  NOT NULL,
    display_order   INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE discovery.local_place_subcategories (
    id              UUID PRIMARY KEY,
    category_id     UUID         NOT NULL REFERENCES discovery.local_place_categories(id),
    slug            VARCHAR(60)  NOT NULL,
    name            VARCHAR(80)  NOT NULL,
    keywords        TEXT         NOT NULL DEFAULT '',   -- comma-separated synonyms; curated only
    is_custom       BOOLEAN      NOT NULL DEFAULT false,
    property_id     UUID,                                -- NULL for curated/global rows
    display_order   INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One curated subcategory slug per category; one custom subcategory name per property.
CREATE UNIQUE INDEX ux_subcat_curated_slug
    ON discovery.local_place_subcategories(category_id, slug) WHERE property_id IS NULL;
CREATE UNIQUE INDEX ux_subcat_custom_name
    ON discovery.local_place_subcategories(property_id, lower(name)) WHERE property_id IS NOT NULL;
CREATE INDEX idx_subcat_property ON discovery.local_place_subcategories(property_id);

CREATE TABLE discovery.property_local_place_subcategories (
    local_place_id  UUID NOT NULL REFERENCES discovery.property_local_places(id) ON DELETE CASCADE,
    subcategory_id  UUID NOT NULL REFERENCES discovery.local_place_subcategories(id),
    PRIMARY KEY (local_place_id, subcategory_id)
);
CREATE INDEX idx_place_subcat_subcat ON discovery.property_local_place_subcategories(subcategory_id);

-- ---- Seed curated categories ----
INSERT INTO discovery.local_place_categories (id, slug, name, display_order) VALUES
    (gen_random_uuid(), 'healthcare',  'Healthcare',   10),
    (gen_random_uuid(), 'transport',   'Transport',    20),
    (gen_random_uuid(), 'food',        'Food & drink', 30),
    (gen_random_uuid(), 'shopping',    'Shopping',     40),
    (gen_random_uuid(), 'services',    'Services',     50),
    (gen_random_uuid(), 'fitness',     'Fitness',      60),
    (gen_random_uuid(), 'emergency',   'Emergency',    70),
    (gen_random_uuid(), 'daily_needs', 'Daily needs',  80),
    (gen_random_uuid(), 'other',       'Other',        90);

-- ---- Seed curated subcategories (keywords drive smart search) ----
INSERT INTO discovery.local_place_subcategories (id, category_id, slug, name, keywords, display_order)
SELECT gen_random_uuid(), c.id, v.slug, v.name, v.keywords, v.display_order
FROM (VALUES
    ('healthcare', 'pharmacy',     'Pharmacy',         'medicine,medicines,chemist,drugstore,medical store,medical', 10),
    ('healthcare', 'hospital',     'Hospital',         'hospital,nursing home,emergency', 20),
    ('healthcare', 'clinic',       'Clinic',           'clinic,doctor,dispensary,polyclinic', 30),
    ('healthcare', 'diagnostic',   'Diagnostic lab',   'lab,diagnostic,pathology,blood test,test', 40),
    ('transport',  'bus_stand',    'Bus stand',        'bus,bus stop,bus stand', 10),
    ('transport',  'metro',        'Metro station',    'metro,subway', 20),
    ('transport',  'railway',      'Railway station',  'railway,train,station', 30),
    ('transport',  'auto_taxi',    'Auto & taxi',      'auto,taxi,cab,rickshaw,ola,uber', 40),
    ('food',       'restaurant',   'Restaurant',       'restaurant,food,dine,eatery,hotel', 10),
    ('food',       'mess_tiffin',  'Mess / tiffin',    'mess,tiffin,dabba,meals', 20),
    ('food',       'cafe',         'Cafe',             'cafe,coffee,tea', 30),
    ('food',       'bakery',       'Bakery',           'bakery,cake,bread', 40),
    ('shopping',   'grocery',      'Grocery',          'grocery,kirana,supermarket,provisions', 10),
    ('shopping',   'market',       'Market',           'market,bazaar', 20),
    ('shopping',   'stationery',   'Stationery',       'stationery,books,xerox', 30),
    ('services',   'laundry',      'Laundry',          'laundry,dhobi,wash,dry clean', 10),
    ('services',   'repair',       'Repair',           'repair,mechanic,electrician,plumber', 20),
    ('services',   'printing',     'Printing / Xerox', 'printing,xerox,print,photocopy', 30),
    ('services',   'salon',        'Salon',            'salon,barber,haircut,parlour', 40),
    ('services',   'atm_bank',     'ATM / Bank',       'atm,bank,cash', 50),
    ('fitness',    'gym',          'Gym',              'gym,fitness,workout', 10),
    ('fitness',    'yoga_sports',  'Yoga / sports',    'yoga,sports,playground', 20),
    ('emergency',  'police',       'Police',           'police,thana', 10),
    ('emergency',  'fire',         'Fire station',     'fire,fire station', 20),
    ('daily_needs','water',        'Water supply',     'water,ro,drinking water', 10),
    ('daily_needs','gas',          'Gas / cylinder',   'gas,cylinder,lpg', 20),
    ('other',      'other',        'Other',            '', 10)
) AS v(cat_slug, slug, name, keywords, display_order)
JOIN discovery.local_place_categories c ON c.slug = v.cat_slug;

-- ---- Migrate existing places' flat tags to subcategories (best-effort; owners can re-edit) ----
INSERT INTO discovery.property_local_place_subcategories (local_place_id, subcategory_id)
SELECT DISTINCT t.local_place_id, s.id
FROM discovery.property_local_place_tags t
JOIN (VALUES
    ('MEDICAL',     'healthcare', 'clinic'),
    ('HOSPITAL',    'healthcare', 'hospital'),
    ('PHARMACY',    'healthcare', 'pharmacy'),
    ('CLINIC',      'healthcare', 'clinic'),
    ('GROCERY',     'shopping',   'grocery'),
    ('FOOD',        'food',       'restaurant'),
    ('MARKET',      'shopping',   'market'),
    ('LAUNDRY',     'services',   'laundry'),
    ('TRANSPORT',   'transport',  'bus_stand'),
    ('REPAIR',      'services',   'repair'),
    ('PRINTING',    'services',   'printing'),
    ('GYM',         'fitness',    'gym'),
    ('EMERGENCY',   'healthcare', 'hospital'),
    ('DAILY_NEEDS', 'shopping',   'grocery'),
    ('OTHER',       'other',      'other')
) AS m(tag, cat_slug, sub_slug) ON m.tag = t.tag
JOIN discovery.local_place_categories c ON c.slug = m.cat_slug
JOIN discovery.local_place_subcategories s ON s.category_id = c.id AND s.slug = m.sub_slug AND s.property_id IS NULL
ON CONFLICT DO NOTHING;

-- Keep property_local_place_tags in place for now (not dropped) so a failed
-- rollout can still read old data; a later migration drops it once verified.
