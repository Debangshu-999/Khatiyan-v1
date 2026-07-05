-- Legacy notifications predate the listeners writing propertyId into the
-- jsonb data payload. The alerts screens scope management feeds by
-- data->>'propertyId', so property-less rows leak across every property's
-- queue. Backfill the id by resolving source_id against each category's
-- source table. Rows whose source no longer exists stay property-less and
-- remain visible everywhere, same as account-level alerts.
-- Every statement is idempotent (guarded by NOT data ? 'propertyId').

UPDATE notification.notifications n
SET data = jsonb_set(coalesce(n.data, '{}'::jsonb), '{propertyId}', to_jsonb(c.property_id::text), true)
FROM concern.concerns c
WHERE n.category = 'CONCERN' AND c.id = n.source_id AND NOT n.data ? 'propertyId';

UPDATE notification.notifications n
SET data = jsonb_set(coalesce(n.data, '{}'::jsonb), '{propertyId}', to_jsonb(t.property_id::text), true)
FROM tenancy.tenancies t
WHERE n.category = 'TENANCY' AND t.id = n.source_id AND NOT n.data ? 'propertyId';

-- PAYMENT and BILLING notifications point at the billing cycle.
UPDATE notification.notifications n
SET data = jsonb_set(coalesce(n.data, '{}'::jsonb), '{propertyId}', to_jsonb(b.property_id::text), true)
FROM billing.billing_cycles b
WHERE n.category IN ('PAYMENT', 'BILLING') AND b.id = n.source_id AND NOT n.data ? 'propertyId';

UPDATE notification.notifications n
SET data = jsonb_set(coalesce(n.data, '{}'::jsonb), '{propertyId}', to_jsonb(p.id::text), true)
FROM property.properties p
WHERE n.category = 'PROPERTY' AND p.id = n.source_id AND NOT n.data ? 'propertyId';

UPDATE notification.notifications n
SET data = jsonb_set(coalesce(n.data, '{}'::jsonb), '{propertyId}', to_jsonb(x.property_id::text), true)
FROM notice.notices x
WHERE n.category = 'NOTICE' AND x.id = n.source_id AND NOT n.data ? 'propertyId';
