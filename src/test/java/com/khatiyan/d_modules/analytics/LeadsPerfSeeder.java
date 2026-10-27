package com.khatiyan.d_modules.analytics;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Leads data at the size the Leads insights dashboard has to stand up to
 * (2026-10-19): thousands of people who opened the listing over the years,
 * a quarter of them enquiring, and leads at every stage, written straight
 * into the tables for a property {@link LargePropertySeeder} built.
 *
 * <p>One DO block, so it runs in one session and its temp table lives for the
 * whole of it. Prospects' phones start +9172, so {@link #remove} finds them.
 */
public final class LeadsPerfSeeder {

    public record Seeded(int prospects, long events, long leads, long visits) {
    }

    private LeadsPerfSeeder() {
    }

    public static Seeded seed(JdbcTemplate jdbc, UUID propertyId, UUID ownerId, int years, int prospects) {
        jdbc.execute("""
                DO $$
                DECLARE
                  prop CONSTANT uuid := '%s';
                  owner_id CONSTANT uuid := '%s';
                  span_days CONSTANT int := %d * 365;
                BEGIN
                  PERFORM setseed(0.19);
                  CREATE TEMP TABLE perf_people ON COMMIT DROP AS
                  SELECT gen_random_uuid() AS id, g AS n,
                         -- More of them recent, as a growing listing has.
                         date_trunc('day', now()) - make_interval(days => floor(power(random(), 1.6) * span_days)::int)
                           + make_interval(hours => 8 + floor(random() * 15)::int, mins => floor(random() * 59)::int) AS first_open,
                         1 + (random() < 0.3)::int + (random() < 0.1)::int AS opens,
                         random() AS r_enquire, random() AS r_stage, random() AS r_tap
                  FROM generate_series(1, %d) g;

                  INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified, credential_version,
                                          gender, date_of_birth, created_at, updated_at)
                  SELECT id, '+9172' || lpad(n::text, 8, '0'), 'Visitor ' || n, 'USER', true, true, 0,
                         CASE WHEN n %% 3 = 0 THEN 'FEMALE' ELSE 'MALE' END, DATE '1998-01-01' + (n %% 1800), first_open, first_open
                  FROM perf_people;

                  -- Opens, each with its close most of the time, and a call tap for some.
                  CREATE TEMP TABLE perf_views ON COMMIT DROP AS
                  SELECT p.id AS user_id, gen_random_uuid() AS view_id,
                         p.first_open + make_interval(days => (k - 1) * (1 + floor(random() * 4)::int)) AS open_at,
                         k, p.r_tap
                  FROM perf_people p CROSS JOIN LATERAL generate_series(1, p.opens) k;
                  DELETE FROM perf_views WHERE open_at > now() - interval '10 minutes';

                  INSERT INTO lead.profile_events (id, event_name, schema_version, user_id, property_id, view_id, occurred_at,
                                                   client_occurred_at, sent_at, received_at, internal, source, app_version, platform)
                  SELECT gen_random_uuid(), 'PROFILE_OPENED', 1, user_id, prop, view_id, open_at, open_at, open_at, open_at, false,
                         CASE WHEN random() < 0.64 THEN 'SEARCH' WHEN random() < 0.75 THEN 'SMART_SEARCH' ELSE 'OTHER' END,
                         '1.0.0', 'android'
                  FROM perf_views;
                  INSERT INTO lead.profile_events (id, event_name, schema_version, user_id, property_id, view_id, occurred_at,
                                                   client_occurred_at, sent_at, received_at, internal, duration_ms, app_version, platform)
                  SELECT gen_random_uuid(), 'PROFILE_CLOSED', 1, user_id, prop, view_id, open_at + d, open_at + d, open_at + d,
                         open_at + d, false, (extract(epoch FROM d) * 1000)::bigint, '1.0.0', 'android'
                  FROM (SELECT *, make_interval(secs => 2 + floor(power(random(), 2) * 400)::int) AS d FROM perf_views) v
                  WHERE random() < 0.92;
                  INSERT INTO lead.profile_events (id, event_name, schema_version, user_id, property_id, view_id, occurred_at,
                                                   client_occurred_at, sent_at, received_at, internal, channel, app_version, platform)
                  SELECT gen_random_uuid(), 'CONTACT_TAPPED', 1, user_id, prop, view_id, open_at + interval '40 seconds',
                         open_at + interval '40 seconds', open_at + interval '40 seconds', open_at + interval '40 seconds',
                         false, 'CALL', '1.0.0', 'android'
                  FROM perf_views WHERE k = 1 AND r_tap < 0.12;

                  -- A quarter enquire, a day or two after their first look.
                  CREATE TEMP TABLE perf_leads ON COMMIT DROP AS
                  SELECT p.id AS user_id, gen_random_uuid() AS enquiry_id, gen_random_uuid() AS lead_id, p.n,
                         p.first_open + make_interval(hours => 2 + floor(random() * 40)::int) AS enquired,
                         p.r_stage
                  FROM perf_people p WHERE p.r_enquire < 0.25;
                  DELETE FROM perf_leads WHERE enquired > now() - interval '1 hour';

                  INSERT INTO enquiry.enquiries (id, property_id, enquirer_user_id, message, status, created_at, updated_at,
                                                 expires_at, handler_user_id, handler_assigned_by, handler_assigned_at,
                                                 responded_at, origin)
                  SELECT enquiry_id, prop, user_id, 'Is a single room available?',
                         CASE WHEN r_stage < 0.2 THEN 'EXPIRED' ELSE 'RESPONDED' END, enquired, enquired,
                         enquired + interval '30 days', owner_id, 'FIRST_RESPONSE', enquired,
                         CASE WHEN r_stage < 0.2 THEN NULL ELSE enquired + make_interval(mins => 5 + floor(random() * 600)::int) END,
                         'ENQUIRY'
                  FROM perf_leads;

                  -- Every stage, with the timestamps a lead that got there would have.
                  INSERT INTO lead.leads (id, reference_code, property_id, prospect_user_id, enquiry_id, stage, state,
                                          close_reason, closed_at, handler_user_id, handler_assigned_by, handler_assigned_at,
                                          enquired_at, responded_at, early_lead_at, advanced_lead_at, booked_at, moved_in_at,
                                          created_at, updated_at, ended_by_prospect, prospect_name)
                  SELECT l.lead_id, 'LD-P' || lpad(l.n::text, 6, '0'), prop, l.user_id, l.enquiry_id,
                         CASE WHEN r_stage < 0.45 THEN 'ENQUIRED' WHEN r_stage < 0.65 THEN 'EARLY_LEAD'
                              WHEN r_stage < 0.85 THEN 'ADVANCED_LEAD' WHEN r_stage < 0.93 THEN 'BOOKED' ELSE 'MOVED_IN' END,
                         CASE WHEN r_stage >= 0.93 OR l.enquired > now() - interval '20 days' THEN 'OPEN' ELSE 'CLOSED' END,
                         CASE WHEN r_stage >= 0.93 OR l.enquired > now() - interval '20 days' THEN NULL ELSE 'NOT_INTERESTED' END,
                         CASE WHEN r_stage >= 0.93 OR l.enquired > now() - interval '20 days' THEN NULL ELSE l.enquired + interval '15 days' END,
                         owner_id, 'FIRST_RESPONSE', l.enquired, l.enquired,
                         e.responded_at,
                         CASE WHEN r_stage >= 0.45 THEN l.enquired + interval '1 day' END,
                         CASE WHEN r_stage >= 0.65 THEN l.enquired + interval '3 days' END,
                         CASE WHEN r_stage >= 0.85 THEN l.enquired + interval '5 days' END,
                         CASE WHEN r_stage >= 0.93 THEN l.enquired + interval '15 days' END,
                         l.enquired, l.enquired, false, 'Visitor ' || l.n
                  FROM perf_leads l JOIN enquiry.enquiries e ON e.id = l.enquiry_id;
                  INSERT INTO lead.lead_enquiries (enquiry_id, lead_id, joined_at)
                  SELECT enquiry_id, lead_id, enquired FROM perf_leads;
                  INSERT INTO lead.lead_activities (id, lead_id, type, subject_user_id, enquiry_id, occurred_at)
                  SELECT gen_random_uuid(), lead_id, 'ENQUIRY_RAISED', user_id, enquiry_id, enquired FROM perf_leads;

                  -- A visit for every lead that reached Early, attended for those past it, some cancelled.
                  INSERT INTO lead.visits (id, reference_code, lead_id, property_id, prospect_user_id, enquiry_id, visit_date,
                                           slot_start_minute, slot_end_minute, booked_by, booked_by_user_id, status,
                                           created_at, updated_at, checked_in_at, checked_in_by_user_id, check_in_method, impression)
                  SELECT gen_random_uuid(), 'VIS-P' || lpad(l.n::text, 6, '0'), l.lead_id, prop, l.user_id, l.enquiry_id,
                         ((l.enquired + interval '3 days') AT TIME ZONE 'Asia/Kolkata')::date, 960, 1020, 'TENANT', l.user_id,
                         CASE WHEN r_stage >= 0.65 THEN 'VISITED' WHEN random() < 0.3 THEN 'CANCELLED' ELSE 'NOT_VISITED' END,
                         l.enquired + interval '1 day', l.enquired + interval '1 day',
                         CASE WHEN r_stage >= 0.65 THEN l.enquired + interval '3 days' END,
                         CASE WHEN r_stage >= 0.65 THEN owner_id END,
                         CASE WHEN r_stage >= 0.65 THEN 'OWNER' END,
                         CASE WHEN r_stage >= 0.65 THEN 'LIKED' END
                  FROM perf_leads l WHERE r_stage >= 0.45 AND l.enquired + interval '3 days' < now();
                  UPDATE lead.visits SET cancelled_by = 'TENANT', cancelled_at = updated_at
                  WHERE property_id = prop AND status = 'CANCELLED' AND reference_code LIKE 'VIS-P%%';
                END $$;
                """.formatted(propertyId, ownerId, years, prospects));
        return new Seeded(prospects,
                jdbc.queryForObject("SELECT count(*) FROM lead.profile_events WHERE property_id = ?", Long.class, propertyId),
                jdbc.queryForObject("SELECT count(*) FROM lead.leads WHERE property_id = ?", Long.class, propertyId),
                jdbc.queryForObject("SELECT count(*) FROM lead.visits WHERE property_id = ?", Long.class, propertyId));
    }

    public static void remove(JdbcTemplate jdbc, UUID propertyId) {
        jdbc.update("DELETE FROM lead.lead_activities WHERE lead_id IN (SELECT id FROM lead.leads WHERE property_id = ?)", propertyId);
        jdbc.update("DELETE FROM lead.visits WHERE property_id = ?", propertyId);
        jdbc.update("DELETE FROM lead.lead_enquiries WHERE lead_id IN (SELECT id FROM lead.leads WHERE property_id = ?)", propertyId);
        jdbc.update("DELETE FROM lead.leads WHERE property_id = ?", propertyId);
        jdbc.update("DELETE FROM enquiry.enquiries WHERE property_id = ?", propertyId);
        jdbc.update("DELETE FROM lead.profile_events WHERE property_id = ?", propertyId);
        jdbc.update("DELETE FROM auth.users WHERE phone LIKE '+9172%'");
    }
}
