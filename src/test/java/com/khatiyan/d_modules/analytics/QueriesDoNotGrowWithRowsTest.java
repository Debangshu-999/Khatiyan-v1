package com.khatiyan.d_modules.analytics;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.analytics.metric.AnalyticsDivision;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;
import com.khatiyan.d_modules.analytics.service.AnalyticsService;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.service.BookingRequestService;
import com.khatiyan.d_modules.concerns.ConcernModule;
import com.khatiyan.d_modules.dashboard.service.OwnerDashboardService;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryListScope;
import com.khatiyan.d_modules.enquiry.service.EnquiryService;
import com.khatiyan.d_modules.lead.model.LeadRepeatFlag;
import com.khatiyan.d_modules.lead.service.LeadQueryService;
import com.khatiyan.d_modules.lead.service.LeadVisitService;
import com.khatiyan.d_modules.lead.service.VisitDayService;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.SaveVisitSlotsRequest;
import com.khatiyan.d_modules.property.service.PropertyVisitSlotService;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.support.IntegrationTest;
import com.khatiyan.support.QueryCount;

/**
 * No read here may cost a query per row (N+1).
 *
 * <p>Each call below runs against a small property and one four times its
 * size, and must run the same number of SQL statements on both, give or take
 * {@link #ALLOWANCE}. A count that grows with the rows is a query per row. On the small database everyone
 * develops against, that costs nothing and nobody sees it. On a customer with
 * 150 beds it is the Home screen taking a second to open.
 *
 * <p><b>The rule (user, 2026-10-02): every new list, summary or report query
 * gets a line here before it ships.</b> Add it to {@link #reads()}.
 *
 * <p>Both properties are one year old, so a section that legitimately runs a
 * query per MONTH runs the same number on both. The sizes stay under fifty
 * rooms, the batch size for lazy lists, so a batched list is one query on both.
 */
@IntegrationTest
class QueriesDoNotGrowWithRowsTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    /**
     * How many more queries the large property may run.
     *
     * <p>Not zero, because some cards only ask their question once there are
     * enough rows to answer it (a median needs five), so a section can run one
     * more query on the larger property and that is not a query per row. A real
     * one is not close to this: four times the rooms, stays and bills means
     * dozens of extra queries.
     */
    private static final long ALLOWANCE = 2;

    @Autowired private JdbcTemplate jdbc;
    @Autowired private OwnerDashboardService ownerDashboard;
    @Autowired private AnalyticsService analytics;
    @Autowired private PropertyModule propertyModule;
    @Autowired private TenancyModule tenancyModule;
    @Autowired private BillingModule billingModule;
    @Autowired private ConcernModule concernModule;
    @Autowired private com.khatiyan.d_modules.lead.service.ListingJourneyService listingJourneyService;
    @Autowired private EnquiryService enquiryService;
    @Autowired private LeadQueryService leadQueryService;
    @Autowired private LeadVisitService leadVisitService;
    @Autowired private VisitDayService visitDayService;
    @Autowired private PropertyVisitSlotService visitSlots;
    @Autowired private BookingRequestService bookingRequests;
    @Autowired private com.khatiyan.d_modules.chat.service.ChatService chatService;
    @Autowired private com.khatiyan.d_modules.booking.BookingModule bookingModule;
    @Autowired private com.khatiyan.d_modules.enquiry.EnquiryModule enquiryModule;
    @Autowired private com.khatiyan.d_modules.lead.VisitModule visitModule;
    @Autowired private com.khatiyan.d_modules.booking.service.BookingTokenService bookingTokens;

    private final LocalDate today = LocalDate.now(IST);
    private Seeded small;
    private Seeded large;
    /** By property: the enquiry whose visit can book, and one open booking request. */
    private final Map<UUID, UUID> bookingFormEnquiry = new HashMap<>();
    private final Map<UUID, UUID> anOpenBooking = new HashMap<>();

    @BeforeEach
    void seed() {
        small = LargePropertySeeder.seed(jdbc, today, 12, 1, 21L);
        large = LargePropertySeeder.seed(jdbc, today, 48, 1, 22L);
        seedEnquiries(small);
        seedEnquiries(large);
        seedBookingRequests(small);
        seedBookingRequests(large);
        seedBookingTokens(small);
        seedBookingTokens(large);
        seedBookingChats(small);
        seedBookingChats(large);
        seedBookingForm(small);
        seedBookingForm(large);
        seedConcernsRaisedToday(small);
        seedConcernsRaisedToday(large);
    }

    /**
     * One concern raised today for every four beds, from different live stays
     * (2026-10-18). The seeder dates concerns at random, so a small property
     * could have none today and the comparison would be an empty list against
     * a full one.
     */
    private void seedConcernsRaisedToday(Seeded property) {
        jdbc.update("""
                INSERT INTO concern.concerns (id, property_id, room_id, tenancy_id, raised_by_user_id, category, status,
                    title, description, created_at, updated_at, reference_code)
                SELECT gen_random_uuid(), t.property_id, t.room_id, t.id, t.user_id, 'WATER', 'OPEN',
                    'Raised today', 'Seeded for the query count.', now(), now(),
                    'CON-T' || substr(md5(random()::text), 1, 8)
                FROM tenancy.tenancies t
                WHERE t.property_id = ? AND t.status = 'ACTIVE' AND t.user_id IS NOT NULL
                ORDER BY t.id
                LIMIT ?
                """, property.propertyId(), Math.max(1, property.beds() / 4));
    }

    @AfterEach
    void remove() {
        for (Seeded seeded : new Seeded[] { small, large }) {
            if (seeded != null) {
                // Attempts and shared channels go with their enquiry, and the link with its lead.
                jdbc.update("DELETE FROM lead.leads WHERE property_id = ?", seeded.propertyId());
                // The slots go with their settings.
                jdbc.update("DELETE FROM property.property_visit_settings WHERE property_id = ?", seeded.propertyId());
                jdbc.update("DELETE FROM enquiry.enquiries WHERE property_id = ?", seeded.propertyId());
                // Offers and history go with their request.
                jdbc.update("DELETE FROM booking.requests WHERE property_id = ?", seeded.propertyId());
                jdbc.update("DELETE FROM chat.chat_thread_members WHERE thread_id IN "
                        + "(SELECT id FROM chat.chat_threads WHERE property_id = ?)", seeded.propertyId());
                jdbc.update("DELETE FROM chat.chat_threads WHERE property_id = ?", seeded.propertyId());
                jdbc.update("DELETE FROM booking.settings WHERE property_id = ?", seeded.propertyId());
                jdbc.update("DELETE FROM property.room_molds WHERE property_id = ?", seeded.propertyId());
            }
        }
        LargePropertySeeder.remove(jdbc, small);
        LargePropertySeeder.remove(jdbc, large);
    }

    /**
     * One enquiry per bed, each from a different person, handled by the owner,
     * with a call still to settle and a chat that failed, and the lead that
     * enquiry opened. So every enquiry and lead read has rows that grow with
     * the property: the records, their attempts, and the people named on them.
     */
    private void seedEnquiries(Seeded property) {
        List<UUID> enquirers = property.userIds().stream()
                .filter(id -> !id.equals(property.ownerId()))
                .limit(property.beds())
                .toList();
        List<Object[]> enquiries = new ArrayList<>();
        List<Object[]> shared = new ArrayList<>();
        List<Object[]> calls = new ArrayList<>();
        List<Object[]> chats = new ArrayList<>();
        List<Object[]> leads = new ArrayList<>();
        List<Object[]> links = new ArrayList<>();
        List<Object[]> visits = new ArrayList<>();
        // One slot a day that takes fifty, so every lead's visit fits and
        // the count behind "spots left" has a row per lead to add up.
        visitSlots.create(property.ownerId(), property.propertyId(), new SaveVisitSlotsRequest(
                EnumSet.allOf(DayOfWeek.class),
                List.of(new SaveVisitSlotsRequest.SlotInput(LocalTime.of(10, 0), LocalTime.of(11, 0))),
                50));
        for (UUID enquirer : enquirers) {
            UUID enquiry = UUID.randomUUID();
            UUID lead = UUID.randomUUID();
            visits.add(new Object[] {
                    UUID.randomUUID(), "VIS-T-" + lead.toString().substring(0, 18), lead, property.propertyId(),
                    enquirer, enquiry, java.sql.Date.valueOf(today.plusDays(1 + visits.size() % 20)), enquirer });
            leads.add(new Object[] {
                    lead, "LEAD-T-" + lead.toString().substring(0, 18), property.propertyId(), enquirer, enquiry,
                    property.ownerId() });
            links.add(new Object[] { enquiry, lead });
            enquiries.add(new Object[] { enquiry, property.propertyId(), enquirer, property.ownerId() });
            shared.add(new Object[] { enquiry });
            calls.add(new Object[] { UUID.randomUUID(), enquiry, property.ownerId() });
            chats.add(new Object[] { UUID.randomUUID(), enquiry, property.ownerId() });
        }
        jdbc.batchUpdate("""
                INSERT INTO enquiry.enquiries (id, property_id, enquirer_user_id, message, status, expires_at,
                    handler_user_id, handler_assigned_by, handler_assigned_at, created_at, updated_at)
                VALUES (?, ?, ?, 'Is a single room free?', 'NEW', now() + INTERVAL '20 days',
                    ?, 'FIRST_RESPONSE', now(), now(), now())
                """, enquiries);
        jdbc.batchUpdate(
                "INSERT INTO enquiry.enquiry_shared_channels (enquiry_id, channel) VALUES (?, 'CALL_BACK')", shared);
        jdbc.batchUpdate("""
                INSERT INTO enquiry.enquiry_responses (id, enquiry_id, channel, responded_by_user_id, outcome,
                    created_at, updated_at)
                VALUES (?, ?, 'CALL_BACK', ?, 'OPEN', now(), now())
                """, calls);
        jdbc.batchUpdate("""
                INSERT INTO enquiry.enquiry_responses (id, enquiry_id, channel, responded_by_user_id, outcome,
                    settled_at, created_at, updated_at)
                VALUES (?, ?, 'CHAT', ?, 'FAILED', now(), now(), now())
                """, chats);
        jdbc.batchUpdate("""
                INSERT INTO lead.leads (id, reference_code, property_id, prospect_user_id, enquiry_id, stage, state,
                    handler_user_id, handler_assigned_by, handler_assigned_at, enquired_at, early_lead_at,
                    became_lead_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'EARLY_LEAD', 'OPEN', ?, 'FIRST_RESPONSE', now(), now(), now(), now(), now(),
                    now())
                """, leads);
        jdbc.batchUpdate(
                "INSERT INTO lead.lead_enquiries (enquiry_id, lead_id, joined_at) VALUES (?, ?, now())", links);
        // The enquirer's own list grows with them: one person, a closed
        // enquiry per bed.
        UUID regular = enquirers.get(0);
        List<Object[]> closed = new ArrayList<>();
        for (int i = 0; i < property.beds(); i++) {
            closed.add(new Object[] {
                    UUID.randomUUID(), property.propertyId(), regular,
                    property.ownerId(), property.ownerId(), property.ownerId() });
        }
        jdbc.batchUpdate("""
                INSERT INTO enquiry.enquiries (id, property_id, enquirer_user_id, message, status, expires_at,
                    handler_user_id, handler_assigned_by, handler_assigned_at, responded_at, sentiment,
                    sentiment_set_by_user_id, sentiment_set_at, ended_at, ended_by_user_id, end_reason,
                    created_at, updated_at)
                VALUES (?, ?, ?, 'Do you have parking?', 'RESPONDED', now() + INTERVAL '10 days',
                    ?, 'FIRST_RESPONSE', now(), now(), 'NOT_INTERESTED', ?, now(), now(),
                    ?, 'NOT_INTERESTED', now(), now())
                """, closed);
        jdbc.batchUpdate("""
                INSERT INTO lead.visits (id, reference_code, lead_id, property_id, prospect_user_id, enquiry_id,
                    visit_date, slot_start_minute, slot_end_minute, booked_by, booked_by_user_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 600, 660, 'TENANT', ?, 'SCHEDULED')
                """, visits);
    }

    /**
     * An open booking request per bed, each from a different person, and one
     * person with an expired request per bed. So the property's open list, its
     * history, its counts and a person's own list all have rows that grow
     * with the property.
     */
    private void seedBookingRequests(Seeded property) {
        List<UUID> askers = property.userIds().stream()
                .filter(id -> !id.equals(property.ownerId()))
                .limit(property.beds())
                .toList();
        List<Object[]> open = new ArrayList<>();
        for (UUID asker : askers) {
            UUID id = UUID.randomUUID();
            open.add(new Object[] {
                    id, "BKG-T-" + id.toString().substring(0, 18), property.propertyId(), asker,
                    UUID.randomUUID(), UUID.randomUUID(), 1, id.toString(), UUID.randomUUID(),
                    "AWAITING_HANDLER", null });
        }
        List<Object[]> expired = new ArrayList<>();
        for (int i = 0; i < property.beds(); i++) {
            UUID id = UUID.randomUUID();
            expired.add(new Object[] {
                    id, "BKG-T-" + id.toString().substring(0, 18), property.propertyId(), regular(property),
                    UUID.randomUUID(), UUID.randomUUID(), null, id.toString(), UUID.randomUUID(),
                    "EXPIRED", java.sql.Timestamp.from(java.time.Instant.now()) });
        }
        for (List<Object[]> rows : List.of(open, expired)) {
            jdbc.batchUpdate("""
                    INSERT INTO booking.requests (id, reference_code, property_id, prospect_user_id, enquiry_id,
                        visit_id, visit_slot, idempotency_key, property_name, room_id, room_number,
                        listed_rent_paise, deposit_paise, token_required, token_amount_paise, token_refundable,
                        tenant_name, tenant_phone, tenant_gender, tenant_date_of_birth,
                        submitted_at, booking_date, earliest_move_in_date, latest_move_in_date,
                        original_move_in_date, move_in_date, expires_at, status,
                        current_offer_sequence, current_offer_by, current_rent_paise, current_offer_negotiable,
                        closed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Seeded PG', ?, '101',
                        800000, 1000000, true, 200000, false,
                        'Seeded Asker', '+919000000000', 'FEMALE', DATE '2000-01-01',
                        now(), CURRENT_DATE, CURRENT_DATE + 3, CURRENT_DATE + 21,
                        CURRENT_DATE + 10, CURRENT_DATE + 10, now() + INTERVAL '7 days', ?,
                        1, 'TENANT', 800000, true, ?)
                    """, rows);
        }
    }

    /**
     * A chat with something said in it on every open booking request, between
     * its asker and the owner (2026-10-27): the Bookings section of Chats has a
     * row per bed, each naming a different person.
     */
    private void seedBookingChats(Seeded property) {
        jdbc.update("""
                INSERT INTO chat.chat_threads (id, property_id, kind, origin, origin_id, status,
                    last_message_at, last_message_seq, last_message_preview, last_message_kind)
                SELECT gen_random_uuid(), r.property_id, 'DIRECT', 'BOOKING', r.id, 'OPEN',
                    now(), 1, 'Is the room still free?', 'TEXT'
                FROM booking.requests r
                WHERE r.property_id = ? AND r.status = 'AWAITING_HANDLER'
                """, property.propertyId());
        jdbc.update("""
                INSERT INTO chat.chat_thread_members (id, thread_id, user_id)
                SELECT gen_random_uuid(), t.id, r.prospect_user_id
                FROM chat.chat_threads t JOIN booking.requests r ON r.id = t.origin_id
                WHERE t.property_id = ? AND t.origin = 'BOOKING'
                UNION ALL
                SELECT gen_random_uuid(), t.id, ?
                FROM chat.chat_threads t
                WHERE t.property_id = ? AND t.origin = 'BOOKING'
                """, property.propertyId(), property.ownerId(), property.propertyId());
    }

    /** A token received, and kept, on every expired request: a ledger row per bed. */
    private void seedBookingTokens(Seeded property) {
        jdbc.update("""
                INSERT INTO booking.tokens (id, request_id, property_id, amount_paise, status, received_method,
                    received_by_user_id, received_at, receipt_code)
                SELECT gen_random_uuid(), id, property_id, 200000, 'KEPT', 'UPI', ?, now(),
                       'TKN-T-' || substring(id::text, 1, 30)
                FROM booking.requests WHERE property_id = ? AND status = 'EXPIRED'
                """, property.ownerId(), property.propertyId());
    }

    /**
     * Bookings switched on, and one of a person's enquiries left as an
     * attended visit leaves it. So the booking form has every room of the
     * property to list, and the picker for another bed has a booking to be for.
     */
    private void seedBookingForm(Seeded property) {
        jdbc.update("""
                INSERT INTO booking.settings (property_id, token_required, token_amount_paise, token_refundable,
                    maximum_advance_days, show_future_vacancies, updated_by_user_id)
                VALUES (?, true, 200000, false, 45, true, ?)
                """, property.propertyId(), property.ownerId());
        UUID enquiry = jdbc.queryForObject("""
                UPDATE enquiry.enquiries
                SET booking_visit_id = gen_random_uuid(), booking_visit_date = CURRENT_DATE - 1,
                    pre_visit_expires_at = expires_at, expires_at = now() + INTERVAL '25 days'
                WHERE id = (SELECT id FROM enquiry.enquiries WHERE property_id = ? AND enquirer_user_id = ?
                            ORDER BY id LIMIT 1)
                RETURNING id
                """, UUID.class, property.propertyId(), regular(property));
        bookingFormEnquiry.put(property.propertyId(), enquiry);
        // A type of its own for every room, each with two photos, so a form that read photos
        // room by room or type by type would run more queries on the larger property.
        jdbc.update("""
                WITH numbered AS (
                    SELECT id, row_number() OVER (ORDER BY id) AS n FROM property.rooms WHERE property_id = ?),
                made AS (
                    INSERT INTO property.room_molds (id, property_id, sharing_type, conditioning, bed_count,
                        base_rent_paise)
                    SELECT gen_random_uuid(), ?, 'DORMITORY', 'NON_AC', 100 + n, 800000 FROM numbered
                    RETURNING id, bed_count)
                UPDATE property.rooms r SET mold_id = made.id
                FROM made JOIN numbered ON made.bed_count = 100 + numbered.n
                WHERE r.id = numbered.id
                """, property.propertyId(), property.propertyId());
        jdbc.update("""
                INSERT INTO property.room_mold_images (mold_id, position, url)
                SELECT m.id, g, 'https://img.example/' || m.id || '-' || g
                FROM property.room_molds m CROSS JOIN generate_series(0, 1) g
                WHERE m.property_id = ?
                """, property.propertyId());
        anOpenBooking.put(property.propertyId(), jdbc.queryForObject("""
                SELECT id FROM booking.requests WHERE property_id = ? AND status = 'AWAITING_HANDLER'
                ORDER BY id LIMIT 1
                """, UUID.class, property.propertyId()));
    }

    /** The person seeded with an enquiry per bed. */
    private static UUID regular(Seeded property) {
        return property.userIds().stream().filter(id -> !id.equals(property.ownerId())).findFirst().orElseThrow();
    }

    /** Every read that must not grow with the rows, by the name a failure will print. */
    private Map<String, Consumer<Seeded>> reads() {
        String thisMonth = YearMonth.from(today).toString();
        LocalDate monthStart = today.withDayOfMonth(1);
        Map<String, Consumer<Seeded>> reads = new LinkedHashMap<>();

        reads.put("Home summary", p -> ownerDashboard.getPropertyActionCenter(p.ownerId(), p.propertyId()));
        reads.put("Booking attention", p -> bookingModule.attentionForProperty(p.propertyId()));
        reads.put("Bookings chats", p -> chatService.listBookingSection(p.ownerId(), p.propertyId()));
        reads.put("Enquiry attention", p -> enquiryModule.attentionForProperty(p.propertyId()));
        reads.put("Visit attention", p -> visitModule.attentionForProperty(p.propertyId()));
        for (var action : com.khatiyan.d_modules.booking.api.dto.BookingAttentionFilter.values()) {
            reads.put("Booking action queue " + action, p -> bookingRequests.pageForProperty(
                    p.ownerId(), p.propertyId(), com.khatiyan.d_modules.booking.api.dto.BookingListFilter.OPEN,
                    null, false, false, action, null, 0, 20));
        }
        for (AnalyticsDivision division : new AnalyticsDivision[] {
                AnalyticsDivision.BILLING, AnalyticsDivision.FINANCE, AnalyticsDivision.TENANTS }) {
            for (PeriodPreset period : new PeriodPreset[] { PeriodPreset.THIS_MONTH, PeriodPreset.LAST_3_MONTHS, PeriodPreset.CURRENT_FY }) {
                reads.put("Insights, " + division + " " + period,
                        p -> analytics.divisionAnalytics(p.ownerId(), p.propertyId(), division, period, null, null));
            }
        }
        reads.put("Room list", p -> propertyModule.listRooms(p.ownerId(), p.propertyId()));
        reads.put("Live stays", p -> tenancyModule.findActiveByPropertyId(p.propertyId()));
        reads.put("Stays ended since last month", p -> tenancyModule.findInactiveEndedOnOrAfter(p.propertyId(), monthStart.minusMonths(1)));
        reads.put("Every ended stay", p -> tenancyModule.findInactiveByPropertyId(p.propertyId()));
        reads.put("Live exit requests", p -> tenancyModule.listOpenPropertyExitRequests(p.ownerId(), p.propertyId()));
        reads.put("Every exit request", p -> tenancyModule.listPropertyExitRequests(p.ownerId(), p.propertyId()));
        reads.put("Pending room changes", p -> tenancyModule.listPendingPropertyRoomChangeRequests(p.ownerId(), p.propertyId()));
        reads.put("Bills of a month", p -> billingModule.listPropertyCycles(p.ownerId(), p.propertyId(), null, thisMonth));
        reads.put("Upcoming bills", p -> billingModule.listUpcomingPropertyCycles(p.ownerId(), p.propertyId(), thisMonth, 0, 20));
        reads.put("Bill summary of a month", p -> billingModule.getPropertyMonthSummaryForDashboard(p.propertyId(), thisMonth));
        reads.put("Bills paid today", p -> billingModule.listPropertyCyclesPaidToday(p.ownerId(), p.propertyId()));
        reads.put("Concern summary", p -> concernModule.getPropertyConcernSummary(p.ownerId(), p.propertyId()));
        reads.put("Concerns raised today", p -> concernModule.listConcernsRaisedToday(p.ownerId(), p.propertyId()));
        reads.put("Enquiries, the whole list", p -> enquiryService.listForProperty(p.ownerId(), p.propertyId()));
        reads.put("Enquiries, a page of the property's",
                p -> enquiryService.pageForProperty(p.ownerId(), p.propertyId(), EnquiryListScope.ALL, 0, 50));
        reads.put("Enquiries, a page of my own",
                p -> enquiryService.pageForProperty(p.ownerId(), p.propertyId(), EnquiryListScope.MINE, 0, 50));
        reads.put("Enquiry calls to settle", p -> enquiryService.callsToSettle(p.ownerId(), p.propertyId()));
        reads.put("Enquiry counts", p -> enquiryService.countsForProperty(p.ownerId(), p.propertyId()));
        reads.put("Leads, a page",
                p -> leadQueryService.pageForProperty(p.ownerId(), p.propertyId(), null, false, false, 0, 50));
        reads.put("Lead counts", p -> leadQueryService.countsForProperty(p.ownerId(), p.propertyId()));
        reads.put("Leads insights, last 3 months", p -> listingJourneyService.journey(
                p.ownerId(), p.propertyId(), com.khatiyan.d_modules.lead.service.ListingJourneyService.Period.LAST_3_MONTHS));
        // Kinds, going cold and the month's numbers (2026-10-11): every seeded lead is in play with a visit.
        reads.put("Leads, a page of the ones going cold",
                p -> leadQueryService.pageForProperty(p.ownerId(), p.propertyId(), null, false, true, 0, 50));
        // Duplicates and potential spam are marked by a rule (2026-10-17): the same page, narrowed by the mark.
        reads.put("Leads, a page of the potential spam",
                p -> leadQueryService.pageForProperty(
                        p.ownerId(), p.propertyId(), null, false, false, LeadRepeatFlag.POTENTIAL_SPAM, 0, 50));
        reads.put("Leads, a page searched by name",
                p -> leadQueryService.pageForProperty(
                        p.ownerId(), p.propertyId(), null, false, false, null, "a", 0, 50));
        reads.put("Lead funnel of a month",
                p -> leadQueryService.funnel(p.ownerId(), p.propertyId(), YearMonth.from(today)));
        reads.put("Visit availability", p -> leadVisitService.availability(p.propertyId()));
        reads.put("Booked visits", p -> leadVisitService.bookedVisits(p.ownerId(), p.propertyId()));
        // The Manage Visits screen and the visitor's own list (2026-10-04).
        reads.put("Manage visits", p -> visitDayService.propertyVisits(p.ownerId(), p.propertyId()));
        reads.put("My visits", p -> visitDayService.myVisits(regular(p)));
        // One person with as many closed enquiries as the property has beds.
        reads.put("My enquiries", p -> enquiryService.myEnquiries(regular(p)));
        // Booking requests (2026-10-10): an open one per bed, and one person with an expired one per bed.
        reads.put("Booking requests, a page of the open ones",
                p -> bookingRequests.pageForProperty(p.ownerId(), p.propertyId(), BookingListFilter.OPEN, 0, 50));
        reads.put("Booking requests, a page of the history",
                p -> bookingRequests.pageForProperty(p.ownerId(), p.propertyId(), BookingListFilter.HISTORY, 0, 50));
        reads.put("Booking request counts", p -> bookingRequests.countsForProperty(p.ownerId(), p.propertyId()));
        reads.put("My booking requests", p -> bookingRequests.pageForTenant(regular(p), 0, 50));
        reads.put("Booking tokens ledger",
                p -> bookingTokens.ledgerForProperty(p.ownerId(), p.propertyId(), 0, 50));
        // The Tokens screen's filter and search (2026-10-11), with who may mark a refund read once for the page.
        reads.put("Booking tokens ledger, searched and narrowed",
                p -> bookingTokens.ledgerForProperty(p.ownerId(), p.propertyId(),
                        com.khatiyan.d_modules.booking.model.BookingTokenStatus.RECEIVED, "tkn", 0, 50));
        // What the screens read before anything is sent (2026-10-10): every room of the property each time.
        reads.put("Booking requests, searched and narrowed",
                p -> bookingRequests.pageForProperty(p.ownerId(), p.propertyId(), BookingListFilter.OPEN,
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER, false, "seeded", 0, 50));
        reads.put("Booking form options", p -> {
            var form = bookingRequests.formOptions(regular(p), bookingFormEnquiry.get(p.propertyId()));
            if (form.rooms().isEmpty()) {
                throw new IllegalStateException(
                        "The form stopped before its rooms, so nothing was measured: " + form.whyNot());
            }
            if (form.rooms().stream().anyMatch(room -> room.imageUrls().size() != 2)) {
                throw new IllegalStateException("A room came without its type's photos, so their read was not measured");
            }
        });
        reads.put("Another bed options",
                p -> bookingRequests.anotherBedOptions(p.ownerId(), p.propertyId(), anOpenBooking.get(p.propertyId())));
        return reads;
    }

    @Test
    void theSameReadRunsTheSameNumberOfQueriesOnASmallAndALargeProperty() {
        SoftAssertions softly = new SoftAssertions();
        reads().forEach((name, read) -> {
            // Once unmeasured first, so anything loaded lazily on a first call is not counted against either.
            read.accept(small);
            read.accept(large);
            long few = QueryCount.of(() -> read.accept(small));
            long many = QueryCount.of(() -> read.accept(large));
            softly.assertThat(many)
                    .as("%s: %d queries for %d beds, %d for %d beds. More queries for more rows is a query per row",
                            name, few, small.beds(), many, large.beds())
                    .isLessThanOrEqualTo(few + ALLOWANCE);
            softly.assertThat(few).as("%s ran no query at all, so nothing was measured", name).isPositive();
        });
        softly.assertAll();
    }
}
