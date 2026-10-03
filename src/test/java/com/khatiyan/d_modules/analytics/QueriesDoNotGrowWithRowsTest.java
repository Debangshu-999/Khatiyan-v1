package com.khatiyan.d_modules.analytics;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumSet;
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
import com.khatiyan.d_modules.concerns.ConcernModule;
import com.khatiyan.d_modules.dashboard.service.OwnerDashboardService;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryListScope;
import com.khatiyan.d_modules.enquiry.service.EnquiryService;
import com.khatiyan.d_modules.lead.service.LeadQueryService;
import com.khatiyan.d_modules.lead.service.LeadVisitService;
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
    @Autowired private EnquiryService enquiryService;
    @Autowired private LeadQueryService leadQueryService;
    @Autowired private LeadVisitService leadVisitService;
    @Autowired private PropertyVisitSlotService visitSlots;

    private final LocalDate today = LocalDate.now(IST);
    private Seeded small;
    private Seeded large;

    @BeforeEach
    void seed() {
        small = LargePropertySeeder.seed(jdbc, today, 12, 1, 21L);
        large = LargePropertySeeder.seed(jdbc, today, 48, 1, 22L);
        seedEnquiries(small);
        seedEnquiries(large);
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
                    handler_user_id, handler_assigned_by, handler_assigned_at, enquired_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'ENQUIRED', 'OPEN', ?, 'FIRST_RESPONSE', now(), now(), now(), now())
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
        reads.put("Concern summary", p -> concernModule.getPropertyConcernSummary(p.ownerId(), p.propertyId()));
        reads.put("Enquiries, the whole list", p -> enquiryService.listForProperty(p.ownerId(), p.propertyId()));
        reads.put("Enquiries, a page of the property's",
                p -> enquiryService.pageForProperty(p.ownerId(), p.propertyId(), EnquiryListScope.ALL, 0, 50));
        reads.put("Enquiries, a page of my own",
                p -> enquiryService.pageForProperty(p.ownerId(), p.propertyId(), EnquiryListScope.MINE, 0, 50));
        reads.put("Enquiry calls to settle", p -> enquiryService.callsToSettle(p.ownerId(), p.propertyId()));
        reads.put("Enquiry counts", p -> enquiryService.countsForProperty(p.ownerId(), p.propertyId()));
        reads.put("Leads, a page",
                p -> leadQueryService.pageForProperty(p.ownerId(), p.propertyId(), null, null, 0, 50));
        reads.put("Lead counts", p -> leadQueryService.countsForProperty(p.ownerId(), p.propertyId()));
        reads.put("Visit availability", p -> leadVisitService.availability(p.propertyId()));
        reads.put("Booked visits", p -> leadVisitService.bookedVisits(p.ownerId(), p.propertyId()));
        // One person with as many closed enquiries as the property has beds.
        reads.put("My enquiries", p -> enquiryService.myEnquiries(regular(p)));
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
