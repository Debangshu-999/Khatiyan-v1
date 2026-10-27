package com.khatiyan.d_modules.lead.service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.ActionCount;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.Actions;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.BiggestDrop;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.Bucket;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.Charts;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.HeatCell;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.OverTime;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.VisitOutcomes;
import com.khatiyan.d_modules.lead.api.dto.LeadFunnelResponse;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.ProfileTime;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.Rates;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.Step;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.analytics.PropertyAnalytics;

import lombok.extern.slf4j.Slf4j;

/**
 * The listing funnel: from opening a property's profile to moving in
 * (2026-10-18). Read from the raw profile events and the leads, for one
 * property and one period. See {@link ListingJourneyResponse} for the rules.
 *
 * <p>Four queries whatever the size of the property: the funnel, the time on
 * the profile, who came back, and the leads behind the rates (plus one batched
 * read of their enquiries, to tell direct records apart).
 */
@Slf4j
@Service
public class ListingJourneyService {

    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final int TOUCH_WINDOW_DAYS = 30;
    static final long QUICK_EXIT_MS = 10_000;
    static final long READ_MS = 30_000;

    /**
     * The periods the owner can pick: the same presets, with the same dates, as
     * the other Insights screens (user, 2026-10-18), so one choice reads the
     * same everywhere. Mirrors the analytics module's resolver, which nothing
     * else may depend on.
     */
    public enum Period {
        THIS_MONTH, LAST_MONTH, LAST_3_MONTHS, LAST_6_MONTHS, CURRENT_FY, ALL_TIME, CUSTOM;

        /** From and to, both inclusive, in India's calendar. Starts no earlier than the property joined. */
        LocalDate[] range(LocalDate today, LocalDate dataSince, LocalDate customFrom, LocalDate customTo) {
            LocalDate monthStart = today.withDayOfMonth(1);
            LocalDate[] raw = switch (this) {
                case THIS_MONTH -> new LocalDate[] { monthStart, today };
                case LAST_MONTH -> new LocalDate[] { monthStart.minusMonths(1), monthStart.minusDays(1) };
                case LAST_3_MONTHS -> new LocalDate[] { monthStart.minusMonths(2), today };
                case LAST_6_MONTHS -> new LocalDate[] { monthStart.minusMonths(5), today };
                case CURRENT_FY -> new LocalDate[] {
                        LocalDate.of(today.getMonthValue() >= 4 ? today.getYear() : today.getYear() - 1, 4, 1), today };
                case ALL_TIME -> new LocalDate[] { dataSince.isAfter(today) ? today : dataSince, today };
                case CUSTOM -> custom(customFrom, customTo, today, dataSince);
            };
            // A range that began before the property joined starts when it joined.
            if (raw[0].isBefore(dataSince) && !dataSince.isAfter(raw[1])) {
                raw[0] = dataSince;
            }
            return raw;
        }

        private static LocalDate[] custom(LocalDate from, LocalDate to, LocalDate today, LocalDate dataSince) {
            if (from == null || to == null) {
                throw new ValidationException("Pick a start and an end date.");
            }
            if (to.isBefore(from)) {
                throw new ValidationException("The end date must be on or after the start date.");
            }
            if (to.isAfter(today)) {
                throw new ValidationException("Pick an end date on or before today.");
            }
            return new LocalDate[] { from, to };
        }
    }

    private final JdbcTemplate jdbc;
    private final PropertyModule propertyModule;
    private final EnquiryModule enquiryModule;
    private final LeadQueryService leadQueryService;
    private final PropertyAnalytics propertyAnalytics;
    private final Clock clock;

    public ListingJourneyService(
            JdbcTemplate jdbc,
            PropertyModule propertyModule,
            EnquiryModule enquiryModule,
            LeadQueryService leadQueryService,
            PropertyAnalytics propertyAnalytics,
            Clock clock) {
        this.jdbc = jdbc;
        this.propertyModule = propertyModule;
        this.enquiryModule = enquiryModule;
        this.leadQueryService = leadQueryService;
        this.propertyAnalytics = propertyAnalytics;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ListingJourneyResponse journey(UUID actorUserId, UUID propertyId, Period period) {
        return journey(actorUserId, propertyId, period, null, null);
    }

    @Transactional(readOnly = true)
    public ListingJourneyResponse journey(UUID actorUserId, UUID propertyId, Period period, LocalDate customFrom, LocalDate customTo) {
        Laps laps = new Laps();
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        Period chosen = period == null ? Period.THIS_MONTH : period;
        LocalDate dataSince = propertyAnalytics.registeredOn(propertyId);
        LocalDate[] range = chosen.range(LocalDate.now(clock.withZone(IST)), dataSince, customFrom, customTo);
        Instant since = range[0].atStartOfDay(IST).toInstant();
        Instant until = range[1].plusDays(1).atStartOfDay(IST).toInstant();
        Timestamp from = Timestamp.from(since);
        Timestamp to = Timestamp.from(until);
        laps.lap("access");

        List<Person> people = people(propertyId, from, to);
        laps.lap("people");
        Map<UUID, String> origins = originsOf(people);
        laps.lap("origins");
        List<Step> steps = steps(people);
        LeadFunnelResponse activity = leadQueryService.funnelBetween(propertyId, since, until, chosen.name(), clock.instant());
        laps.lap("leads funnel");
        List<LeadRow> leads = leadRows(propertyId, from, to);
        ProfileTime profileTime = profileTime(propertyId, from, to);
        laps.lap("profile time");
        Charts charts = charts(propertyId, range, from, to, leads, activity);
        laps.lap("charts");
        log.info("Leads insights built propertyId={} period={} in {}", propertyId, chosen, laps);
        return new ListingJourneyResponse(
                chosen.name(), range[0], range[1], dataSince, steps, biggestDrop(steps), actions(people, origins),
                profileTime, rates(leads), activity, charts);
    }

    /** How long each part of one read took, for the log line: "12 ms (people 3, charts 4, ...)". */
    private static final class Laps {
        private final long start = System.nanoTime();
        private long last = start;
        private final StringBuilder parts = new StringBuilder();

        void lap(String part) {
            long now = System.nanoTime();
            parts.append(parts.isEmpty() ? "" : ", ").append(part).append(' ').append((now - last) / 1_000_000);
            last = now;
        }

        @Override
        public String toString() {
            return (last - start) / 1_000_000 + " ms (" + parts + ")";
        }
    }

    // ------------------------------------------------------------ the graphs

    private Charts charts(
            UUID propertyId, LocalDate[] range, Timestamp from, Timestamp to,
            List<LeadRow> leads, LeadFunnelResponse activity) {
        // A point a day up to about six weeks, a week up to about six months, then a month.
        long days = java.time.temporal.ChronoUnit.DAYS.between(range[0], range[1]) + 1;
        String unit = days <= 45 ? "day" : days <= 200 ? "week" : "month";
        return new Charts(
                unit.toUpperCase(java.util.Locale.ROOT),
                overTime(propertyId, range, from, to, unit),
                whenTheyLook(propertyId, from, to),
                timeSpent(propertyId, from, to),
                foundFrom(propertyId, from, to),
                answerSpeed(leads),
                new VisitOutcomes(activity.visitsAttended(), activity.visitsMissed(), cancelledVisits(propertyId, from, to)));
    }

    /**
     * People who opened, and people who got in touch, per day or week.
     * Getting in touch here is a tap or an enquiry on that day, whoever it was.
     */
    private List<OverTime> overTime(UUID propertyId, LocalDate[] range, Timestamp from, Timestamp to, String unit) {
        Map<LocalDate, long[]> byBucket = new java.util.TreeMap<>();
        jdbc.query("""
                SELECT bucket, SUM(opened) AS opened, SUM(touched) AS touched FROM (
                    SELECT date_trunc(?, occurred_at AT TIME ZONE 'Asia/Kolkata')::date AS bucket,
                        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'PROFILE_OPENED') AS opened,
                        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'CONTACT_TAPPED') AS touched
                    FROM lead.profile_events
                    WHERE property_id = ? AND NOT internal AND occurred_at >= ? AND occurred_at < ?
                    GROUP BY 1
                    UNION ALL
                    SELECT date_trunc(?, enquired_at AT TIME ZONE 'Asia/Kolkata')::date, 0, COUNT(DISTINCT prospect_user_id)
                    FROM lead.leads
                    WHERE property_id = ? AND enquired_at >= ? AND enquired_at < ?
                    GROUP BY 1
                ) counted
                GROUP BY bucket
                """,
                rs -> {
                    byBucket.put(rs.getDate("bucket").toLocalDate(), new long[] { rs.getLong("opened"), rs.getLong("touched") });
                },
                unit, propertyId, from, to, unit, propertyId, from, to);
        // Every day or week in the period, at zero when nothing happened, so the line is continuous.
        List<OverTime> points = new ArrayList<>();
        LocalDate start = switch (unit) {
            case "week" -> range[0].with(java.time.DayOfWeek.MONDAY);
            case "month" -> range[0].withDayOfMonth(1);
            default -> range[0];
        };
        for (LocalDate day = start; !day.isAfter(range[1]);
                day = switch (unit) { case "week" -> day.plusWeeks(1); case "month" -> day.plusMonths(1); default -> day.plusDays(1); }) {
            long[] counted = byBucket.getOrDefault(day, new long[2]);
            points.add(new OverTime(day, counted[0], counted[1]));
        }
        return points;
    }

    private List<HeatCell> whenTheyLook(UUID propertyId, Timestamp from, Timestamp to) {
        return jdbc.query("""
                SELECT EXTRACT(ISODOW FROM occurred_at AT TIME ZONE 'Asia/Kolkata')::int AS weekday,
                    (EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'Asia/Kolkata')::int / 6) AS quarter,
                    COUNT(*) AS views
                FROM lead.profile_events
                WHERE property_id = ? AND NOT internal AND event_name = 'PROFILE_OPENED'
                  AND occurred_at >= ? AND occurred_at < ?
                GROUP BY 1, 2
                ORDER BY 1, 2
                """,
                (rs, row) -> new HeatCell(rs.getInt("weekday"), rs.getInt("quarter"), rs.getLong("views")),
                propertyId, from, to);
    }

    private List<Bucket> timeSpent(UUID propertyId, Timestamp from, Timestamp to) {
        return jdbc.queryForObject("""
                SELECT
                    COUNT(*) FILTER (WHERE duration_ms < 10000),
                    COUNT(*) FILTER (WHERE duration_ms >= 10000 AND duration_ms < 30000),
                    COUNT(*) FILTER (WHERE duration_ms >= 30000 AND duration_ms < 60000),
                    COUNT(*) FILTER (WHERE duration_ms >= 60000 AND duration_ms < 180000),
                    COUNT(*) FILTER (WHERE duration_ms >= 180000)
                FROM lead.profile_events
                WHERE property_id = ? AND NOT internal AND event_name = 'PROFILE_CLOSED'
                  AND occurred_at >= ? AND occurred_at < ?
                """,
                (rs, row) -> List.of(
                        new Bucket("UNDER_10S", rs.getLong(1)),
                        new Bucket("UNDER_30S", rs.getLong(2)),
                        new Bucket("UNDER_1M", rs.getLong(3)),
                        new Bucket("UNDER_3M", rs.getLong(4)),
                        new Bucket("LONGER", rs.getLong(5))),
                propertyId, from, to);
    }

    private List<Bucket> foundFrom(UUID propertyId, Timestamp from, Timestamp to) {
        Map<String, Long> counted = new HashMap<>();
        jdbc.query("""
                SELECT COALESCE(source, 'OTHER') AS source, COUNT(*) AS views
                FROM lead.profile_events
                WHERE property_id = ? AND NOT internal AND event_name = 'PROFILE_OPENED'
                  AND occurred_at >= ? AND occurred_at < ?
                GROUP BY 1
                """,
                rs -> {
                    counted.merge(rs.getString("source"), rs.getLong("views"), Long::sum);
                },
                propertyId, from, to);
        List<Bucket> buckets = new ArrayList<>();
        for (String source : List.of("SEARCH", "SMART_SEARCH", "MAP", "LINK", "OTHER")) {
            buckets.add(new Bucket(source, counted.getOrDefault(source, 0L)));
        }
        return buckets;
    }

    /** Enquiries answered in the period, by how long the first answer took. Direct records are left out. */
    private static List<Bucket> answerSpeed(List<LeadRow> leads) {
        long[] counts = new long[4];
        for (LeadRow lead : leads) {
            if (lead.direct() || lead.responded() == null) {
                continue;
            }
            long seconds = Math.max(0, lead.responded().getEpochSecond() - lead.enquired().getEpochSecond());
            counts[seconds < 3600 ? 0 : seconds < 6 * 3600 ? 1 : seconds < 24 * 3600 ? 2 : 3]++;
        }
        return List.of(
                new Bucket("UNDER_1H", counts[0]), new Bucket("UNDER_6H", counts[1]),
                new Bucket("UNDER_24H", counts[2]), new Bucket("LONGER", counts[3]));
    }

    private long cancelledVisits(UUID propertyId, Timestamp from, Timestamp to) {
        Long count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM lead.visits
                WHERE property_id = ? AND status = 'CANCELLED' AND cancelled_at >= ? AND cancelled_at < ?
                """, Long.class, propertyId, from, to);
        return count == null ? 0 : count;
    }

    /** One person who opened the profile in the period, and how far they went. */
    record Person(
            UUID userId,
            boolean called,
            UUID enquiryId,
            boolean enquired,
            boolean answered,
            boolean visited,
            boolean booked,
            boolean movedIn) {
    }

    private List<Person> people(UUID propertyId, Timestamp from, Timestamp to) {
        return jdbc.query("""
                WITH opens AS (
                    SELECT user_id, MIN(occurred_at) AS first_open
                    FROM lead.profile_events
                    WHERE property_id = ? AND NOT internal AND event_name = 'PROFILE_OPENED'
                      AND occurred_at >= ? AND occurred_at < ?
                    GROUP BY user_id
                ), taps AS (
                    SELECT o.user_id, BOOL_OR(t.channel = 'CALL') AS called
                    FROM opens o
                    JOIN lead.profile_events t
                      ON t.property_id = ? AND NOT t.internal AND t.user_id = o.user_id
                     AND t.event_name = 'CONTACT_TAPPED'
                     AND t.occurred_at >= o.first_open
                     AND t.occurred_at < o.first_open + make_interval(days => ?)
                    GROUP BY o.user_id
                ), first_lead AS (
                    -- Each person's first lead within the window, for everyone in one
                    -- pass (2026-10-19). Asked per person, it scanned the leads once for
                    -- each of them: about a second on three years of a large listing.
                    SELECT DISTINCT ON (l.prospect_user_id)
                        l.prospect_user_id, l.enquiry_id, l.enquired_at, l.responded_at,
                        l.advanced_lead_at, l.booked_at, l.moved_in_at
                    FROM lead.leads l
                    JOIN opens o ON o.user_id = l.prospect_user_id
                    WHERE l.property_id = ?
                      AND l.enquired_at >= o.first_open
                      AND l.enquired_at < o.first_open + make_interval(days => ?)
                    ORDER BY l.prospect_user_id, l.enquired_at
                )
                SELECT o.user_id,
                    COALESCE(taps.called, FALSE) AS called,
                    l.enquiry_id,
                    l.enquired_at IS NOT NULL AS enquired,
                    (l.responded_at IS NOT NULL OR l.advanced_lead_at IS NOT NULL
                        OR l.booked_at IS NOT NULL OR l.moved_in_at IS NOT NULL) AS answered,
                    (l.advanced_lead_at IS NOT NULL OR l.booked_at IS NOT NULL OR l.moved_in_at IS NOT NULL) AS visited,
                    (l.booked_at IS NOT NULL OR l.moved_in_at IS NOT NULL) AS booked,
                    l.moved_in_at IS NOT NULL AS moved_in
                FROM opens o
                LEFT JOIN taps ON taps.user_id = o.user_id
                LEFT JOIN first_lead l ON l.prospect_user_id = o.user_id
                """,
                (rs, row) -> new Person(
                        rs.getObject("user_id", UUID.class),
                        rs.getBoolean("called"),
                        rs.getObject("enquiry_id", UUID.class),
                        rs.getBoolean("enquired"),
                        rs.getBoolean("answered"),
                        rs.getBoolean("visited"),
                        rs.getBoolean("booked"),
                        rs.getBoolean("moved_in")),
                propertyId, from, to, propertyId, TOUCH_WINDOW_DAYS, propertyId, TOUCH_WINDOW_DAYS);
    }

    /** How each lead began: ENQUIRY, DIRECT_VISIT or DIRECT_BOOKING. One batched read. */
    private Map<UUID, String> originsOf(List<Person> people) {
        Set<UUID> enquiryIds = people.stream().map(Person::enquiryId).filter(id -> id != null).collect(Collectors.toSet());
        Map<UUID, String> origins = new HashMap<>();
        enquiryModule.originsOf(enquiryIds).forEach((id, origin) -> origins.put(id, String.valueOf(origin)));
        return origins;
    }

    static List<Step> steps(List<Person> people) {
        long[] counts = new long[6];
        for (Person person : people) {
            counts[0]++;
            if (person.called() || person.enquired()) counts[1]++;
            if (person.answered()) counts[2]++;
            if (person.visited()) counts[3]++;
            if (person.booked()) counts[4]++;
            if (person.movedIn()) counts[5]++;
        }
        List<Step> steps = new ArrayList<>();
        for (int i = 0; i < ListingJourneyResponse.STEP_KEYS.size(); i++) {
            steps.add(new Step(ListingJourneyResponse.STEP_KEYS.get(i), counts[i]));
        }
        return steps;
    }

    /** What each person did from the buttons on the profile: how their lead began, and their taps. */
    static Actions actions(List<Person> people, Map<UUID, String> origins) {
        Map<String, Long> furthest = new HashMap<>();
        Map<String, Long> individual = new HashMap<>();
        long acted = 0;
        for (Person person : people) {
            List<String> did = new ArrayList<>();
            if (person.enquired()) {
                String origin = person.enquiryId() == null ? "ENQUIRY" : origins.getOrDefault(person.enquiryId(), "ENQUIRY");
                did.add(switch (origin) {
                    case "DIRECT_BOOKING" -> "BOOKING_REQUESTED";
                    case "DIRECT_VISIT" -> "VISIT_SCHEDULED";
                    default -> "ENQUIRED";
                });
            }
            if (person.called()) did.add("CALLED");
            did.forEach(action -> individual.merge(action, 1L, Long::sum));
            String strongest = ListingJourneyResponse.ACTIONS.stream().filter(did::contains).findFirst().orElse("NONE");
            furthest.merge(strongest, 1L, Long::sum);
            if (!did.isEmpty()) acted++;
        }
        List<ActionCount> byFurthest = new ArrayList<>();
        List<ActionCount> each = new ArrayList<>();
        for (String action : ListingJourneyResponse.ACTIONS) {
            byFurthest.add(new ActionCount(action, furthest.getOrDefault(action, 0L)));
            each.add(new ActionCount(action, individual.getOrDefault(action, 0L)));
        }
        byFurthest.add(new ActionCount("NONE", furthest.getOrDefault("NONE", 0L)));
        return new Actions(people.size(), acted, byFurthest, each);
    }

    /** The step that loses the most people. Ties go to the earlier step, where fixing it helps everyone after. */
    static BiggestDrop biggestDrop(List<Step> steps) {
        BiggestDrop worst = null;
        for (int i = 1; i < steps.size(); i++) {
            long before = steps.get(i - 1).people();
            long lost = before - steps.get(i).people();
            if (before > 0 && lost > 0 && (worst == null || lost > worst.lost())) {
                worst = new BiggestDrop(steps.get(i - 1).key(), steps.get(i).key(), lost, (int) Math.round(lost * 100.0 / before));
            }
        }
        return worst;
    }

    private ProfileTime profileTime(UUID propertyId, Timestamp from, Timestamp to) {
        // The events read once (2026-10-19). People and who came back come from
        // one grouping by person, and "on two or more days" is first day before
        // last day, which needs no distinct-sort. It was three sorts of the same
        // rows, about 75 ms on three years of a large listing.
        return jdbc.queryForObject("""
                WITH ev AS MATERIALIZED (
                    SELECT event_name, user_id, duration_ms, occurred_at
                    FROM lead.profile_events
                    WHERE property_id = ? AND NOT internal AND occurred_at >= ? AND occurred_at < ?
                ), per_person AS (
                    SELECT MIN((occurred_at AT TIME ZONE 'Asia/Kolkata')::date)
                               < MAX((occurred_at AT TIME ZONE 'Asia/Kolkata')::date) AS came_back
                    FROM ev WHERE event_name = 'PROFILE_OPENED'
                    GROUP BY user_id
                )
                SELECT
                    (SELECT COUNT(*) FROM ev WHERE event_name = 'PROFILE_OPENED') AS views,
                    (SELECT COUNT(*) FROM per_person) AS people,
                    (SELECT COUNT(*) FILTER (WHERE came_back) FROM per_person) AS came_back,
                    closes.closed, closes.median_ms, closes.quick, closes.read
                FROM (
                    SELECT COUNT(*) AS closed,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS median_ms,
                        COUNT(*) FILTER (WHERE duration_ms < ?) AS quick,
                        COUNT(*) FILTER (WHERE duration_ms >= ?) AS read
                    FROM ev WHERE event_name = 'PROFILE_CLOSED'
                ) closes
                """,
                (rs, row) -> {
                    long closed = rs.getLong("closed");
                    double median = rs.getDouble("median_ms");
                    boolean noMedian = rs.wasNull();
                    return new ProfileTime(
                            rs.getLong("views"),
                            rs.getLong("people"),
                            closed,
                            noMedian ? null : Math.round(median / 1000.0),
                            percent(rs.getLong("quick"), closed),
                            percent(rs.getLong("read"), closed),
                            rs.getLong("came_back"));
                },
                propertyId, from, to, QUICK_EXIT_MS, READ_MS);
    }

    /** One enquiry-led record in the period. {@code direct} for a visit or booking made straight from the profile. */
    record LeadRow(Instant enquired, Instant responded, boolean visited, boolean movedIn, boolean closed, boolean direct) {
    }

    private List<LeadRow> leadRows(UUID propertyId, Timestamp from, Timestamp to) {
        record Raw(UUID enquiryId, Instant enquired, Instant responded, boolean visited, boolean movedIn, boolean closed) {
        }
        List<Raw> raw = jdbc.query("""
                SELECT enquiry_id, enquired_at, responded_at,
                    (advanced_lead_at IS NOT NULL OR booked_at IS NOT NULL OR moved_in_at IS NOT NULL) AS visited,
                    moved_in_at IS NOT NULL AS moved_in,
                    state = 'CLOSED' AS closed
                FROM lead.leads
                WHERE property_id = ? AND enquired_at >= ? AND enquired_at < ?
                """,
                (rs, row) -> new Raw(
                        rs.getObject("enquiry_id", UUID.class),
                        rs.getTimestamp("enquired_at").toInstant(),
                        rs.getTimestamp("responded_at") == null ? null : rs.getTimestamp("responded_at").toInstant(),
                        rs.getBoolean("visited"), rs.getBoolean("moved_in"), rs.getBoolean("closed")),
                propertyId, from, to);
        Set<UUID> enquiryIds = raw.stream().map(Raw::enquiryId).filter(id -> id != null).collect(Collectors.toSet());
        Set<UUID> direct = new java.util.HashSet<>();
        enquiryModule.originsOf(enquiryIds).forEach((id, origin) -> {
            if (!"ENQUIRY".equals(String.valueOf(origin))) {
                direct.add(id);
            }
        });
        return raw.stream()
                .map(row -> new LeadRow(row.enquired(), row.responded(), row.visited(), row.movedIn(), row.closed(),
                        row.enquiryId() != null && direct.contains(row.enquiryId())))
                .toList();
    }

    private static Rates rates(List<LeadRow> leads) {
        List<LeadRow> asked = leads.stream().filter(lead -> !lead.direct()).toList();
        long answered = asked.stream().filter(lead -> lead.responded() != null).count();
        long droppedAfterAnswer = asked.stream()
                .filter(lead -> lead.responded() != null && !lead.visited() && lead.closed()).count();
        List<Long> responseSeconds = asked.stream()
                .filter(lead -> lead.responded() != null)
                .map(lead -> Math.max(0, lead.responded().getEpochSecond() - lead.enquired().getEpochSecond()))
                .sorted()
                .toList();
        long movedIn = leads.stream().filter(LeadRow::movedIn).count();
        return new Rates(
                leads.size(),
                percent(answered, asked.size()),
                median(responseSeconds),
                percent(droppedAfterAnswer, answered),
                percent(movedIn, leads.size()));
    }

    static Integer percent(long part, long whole) {
        return whole == 0 ? null : (int) Math.round(part * 100.0 / whole);
    }

    static Long median(List<Long> sorted) {
        if (sorted.isEmpty()) {
            return null;
        }
        int middle = sorted.size() / 2;
        return sorted.size() % 2 == 1 ? sorted.get(middle) : (sorted.get(middle - 1) + sorted.get(middle)) / 2;
    }
}
