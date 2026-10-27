package com.khatiyan.d_modules.lead.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.d_modules.analytics.LargePropertySeeder;
import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.lead.api.dto.AppEventBatchRequest;
import com.khatiyan.d_modules.lead.api.dto.AppEventBatchRequest.AppEvent;
import com.khatiyan.d_modules.lead.api.dto.AppEventBatchResponse;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse;
import com.khatiyan.d_modules.lead.api.dto.ListingJourneyResponse.Step;
import com.khatiyan.support.IntegrationTest;

/**
 * The listing funnel on real Postgres (2026-10-18): profile events in through
 * the collector, leads on lead.leads, the funnel out.
 */
@IntegrationTest
class ListingJourneyIntegrationTest {

    @Autowired private ProfileEventService events;
    @Autowired private ListingJourneyService journeys;
    @Autowired private JdbcTemplate jdbc;

    private Seeded property;
    private final Instant now = Instant.now();

    @BeforeEach
    void seed() {
        property = LargePropertySeeder.seed(jdbc, LocalDate.now(ZoneId.of("Asia/Kolkata")), 12, 1, 31L);
    }

    @AfterEach
    void remove() {
        if (property != null) {
            jdbc.update("DELETE FROM lead.profile_events WHERE property_id = ?", property.propertyId());
            jdbc.update("DELETE FROM lead.rejected_profile_events WHERE user_id = ANY (?)",
                    (Object) property.userIds().toArray(UUID[]::new));
            jdbc.update("DELETE FROM lead.leads WHERE property_id = ?", property.propertyId());
            LargePropertySeeder.remove(jdbc, property);
        }
    }

    /** A tenant, never the owner, who is first in the seeder's list and whose views are internal. */
    private UUID person(int index) {
        return property.userIds().stream().filter(id -> !id.equals(property.ownerId())).toList().get(index);
    }

    private AppEvent opened(UUID view, Instant at) {
        return new AppEvent(UUID.randomUUID(), "PROFILE_OPENED", 1, at, property.propertyId(), view, "SEARCH", null, null);
    }

    private AppEvent closed(UUID view, Instant at, long seconds) {
        return new AppEvent(UUID.randomUUID(), "PROFILE_CLOSED", 1, at, property.propertyId(), view, null, seconds * 1000, null);
    }

    private AppEvent tapped(UUID view, Instant at) {
        return new AppEvent(UUID.randomUUID(), "CONTACT_TAPPED", 1, at, property.propertyId(), view, null, null, "CALL");
    }

    private AppEventBatchResponse send(UUID userId, AppEvent... batch) {
        return events.collect(userId, new AppEventBatchRequest(now, new AppEventBatchRequest.Context("1.0.0", "android"), List.of(batch)));
    }

    private void lead(UUID userId, Instant enquired, Instant responded, Instant visited, Instant booked, Instant movedIn) {
        String stage = movedIn != null ? "MOVED_IN" : booked != null ? "BOOKED" : visited != null ? "ADVANCED_LEAD" : "ENQUIRED";
        jdbc.update("""
                INSERT INTO lead.leads (id, reference_code, property_id, prospect_user_id, stage, state,
                    enquired_at, responded_at, advanced_lead_at, booked_at, moved_in_at)
                VALUES (gen_random_uuid(), ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)
                """,
                "LED-T" + UUID.randomUUID().toString().substring(0, 8), property.propertyId(), userId, stage,
                ts(enquired), ts(responded), ts(visited), ts(booked), ts(movedIn));
    }

    private static Timestamp ts(Instant at) {
        return at == null ? null : Timestamp.from(at);
    }

    @Test
    void theSamePeopleAreFollowedFromOpeningTheProfileToMovingIn() {
        Instant h5 = now.minus(Duration.ofHours(5));
        Instant h3 = now.minus(Duration.ofHours(3));
        // A left at a glance. B read it and tapped call. C enquired and visited.
        // D went all the way. E only looked, on two days.
        UUID a = UUID.randomUUID();
        send(person(0), opened(a, h3), closed(a, h3.plusSeconds(5), 5));
        UUID b = UUID.randomUUID();
        send(person(1), opened(b, h3), tapped(b, h3.plusSeconds(20)), closed(b, h3.plusSeconds(40), 40));
        send(person(2), opened(UUID.randomUUID(), h3));
        lead(person(2), now.minus(Duration.ofHours(2)), now.minus(Duration.ofHours(1)), now.minus(Duration.ofMinutes(30)), null, null);
        send(person(3), opened(UUID.randomUUID(), h5));
        lead(person(3), now.minus(Duration.ofHours(4)), now.minus(Duration.ofHours(2)), now.minus(Duration.ofHours(1)),
                now.minus(Duration.ofMinutes(50)), now.minus(Duration.ofMinutes(30)));
        send(person(4), opened(UUID.randomUUID(), now.minus(Duration.ofDays(2))), opened(UUID.randomUUID(), h3));
        // The owner looking at their own listing counts for nothing.
        send(property.ownerId(), opened(UUID.randomUUID(), h3));

        ListingJourneyResponse journey = journeys.journey(property.ownerId(), property.propertyId(), ListingJourneyService.Period.CUSTOM,
                LocalDate.now(ZoneId.of("Asia/Kolkata")).minusDays(29), LocalDate.now(ZoneId.of("Asia/Kolkata")));

        assertThat(journey.steps()).extracting(Step::people).containsExactly(5L, 3L, 2L, 2L, 1L, 1L);
        assertThat(journey.biggestDrop().fromStep()).isEqualTo("OPENED");
        assertThat(journey.biggestDrop().lost()).isEqualTo(2);
        assertThat(journey.biggestDrop().percent()).isEqualTo(40);

        // A and E did nothing, B called, C and D enquired.
        assertThat(journey.actions().opened()).isEqualTo(5);
        assertThat(journey.actions().acted()).isEqualTo(3);
        assertThat(journey.actions().byFurthest()).extracting(ListingJourneyResponse.ActionCount::people)
                .containsExactly(0L, 0L, 2L, 1L, 2L);
        assertThat(journey.actions().individual()).extracting(ListingJourneyResponse.ActionCount::people)
                .containsExactly(0L, 0L, 2L, 1L);
        // The pipeline read for the same dates rides along.
        assertThat(journey.activity()).isNotNull();
        assertThat(journey.activity().month()).isEqualTo("CUSTOM");

        assertThat(journey.profileTime().views()).isEqualTo(6);
        assertThat(journey.profileTime().people()).isEqualTo(5);
        assertThat(journey.profileTime().viewsWithLength()).isEqualTo(2);
        assertThat(journey.profileTime().medianSeconds()).isEqualTo(23);
        assertThat(journey.profileTime().quickExitPercent()).isEqualTo(50);
        assertThat(journey.profileTime().readPercent()).isEqualTo(50);
        assertThat(journey.profileTime().cameBack()).isEqualTo(1);

        // The graphs, for the same people and dates.
        ListingJourneyResponse.Charts charts = journey.charts();
        assertThat(charts.bucket()).isEqualTo("DAY");
        assertThat(charts.overTime()).hasSize(30);
        assertThat(charts.overTime().stream().mapToLong(ListingJourneyResponse.OverTime::opened).sum()).isEqualTo(6);
        assertThat(charts.whenTheyLook().stream().mapToLong(ListingJourneyResponse.HeatCell::views).sum()).isEqualTo(6);
        assertThat(charts.timeSpent()).extracting(ListingJourneyResponse.Bucket::count).containsExactly(1L, 0L, 1L, 0L, 0L);
        assertThat(charts.foundFrom().get(0)).isEqualTo(new ListingJourneyResponse.Bucket("SEARCH", 6));
        // C answered in an hour, D in two: both in the one to six hours bucket.
        assertThat(charts.answerSpeed()).extracting(ListingJourneyResponse.Bucket::count).containsExactly(0L, 2L, 0L, 0L);

        assertThat(journey.rates().enquiries()).isEqualTo(2);
        assertThat(journey.rates().responseRatePercent()).isEqualTo(100);
        assertThat(journey.rates().medianResponseSeconds()).isEqualTo(5400);
        assertThat(journey.rates().dropAfterAnswerPercent()).isZero();
        assertThat(journey.rates().enquiryToMoveInPercent()).isEqualTo(50);
    }

    /** The app resends a batch whose answer it never got: each event lands once. */
    @Test
    void aResentBatchIsCountedOnce() {
        UUID view = UUID.randomUUID();
        AppEvent open = opened(view, now.minus(Duration.ofMinutes(5)));

        send(person(0), open);
        send(person(0), open);

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM lead.profile_events WHERE property_id = ?",
                Long.class, property.propertyId())).isOne();
    }

    /** An enquiry more than 30 days after the first open did not come from it. */
    @Test
    void gettingInTouchCountsOnlyWithinThirtyDaysOfTheFirstOpen() {
        send(person(0), opened(UUID.randomUUID(), now.minus(Duration.ofDays(29))));
        // Not in this table's 30 days: the lead is placed by hand, so it can be late.
        lead(person(0), now.plus(Duration.ofDays(2)), null, null, null, null);

        ListingJourneyResponse journey = journeys.journey(property.ownerId(), property.propertyId(), ListingJourneyService.Period.LAST_3_MONTHS);

        assertThat(journey.steps().get(0).people()).isOne();
        assertThat(journey.steps().get(1).people()).isZero();
    }

    /** A malformed event is set aside with its reason; the rest of the batch lands. */
    @Test
    void aBadEventIsKeptAsideAndTheRestLand() {
        AppEvent noDuration = new AppEvent(UUID.randomUUID(), "PROFILE_CLOSED", 1, now, property.propertyId(), UUID.randomUUID(), null, null, null);

        AppEventBatchResponse result = send(person(0), opened(UUID.randomUUID(), now.minusSeconds(30)), noDuration);

        assertThat(result.accepted()).isOne();
        assertThat(result.rejected()).isOne();
        List<String> reasons = new ArrayList<>(jdbc.queryForList(
                "SELECT reason FROM lead.rejected_profile_events WHERE user_id = ?", String.class, person(0)));
        assertThat(reasons).containsExactly("a close needs durationMs between 0 and 6 hours");
    }

    // Profiles show no email (2026-10-18): an email tap from an old build is kept aside.
    @Test
    void anEmailTapIsRejected() {
        AppEvent emailed = new AppEvent(UUID.randomUUID(), "CONTACT_TAPPED", 1, now, property.propertyId(), UUID.randomUUID(), null, null, "EMAIL");

        AppEventBatchResponse result = send(person(1), emailed);

        assertThat(result.accepted()).isZero();
        assertThat(result.rejected()).isOne();
        assertThat(jdbc.queryForList("SELECT reason FROM lead.rejected_profile_events WHERE user_id = ?", String.class, person(1)))
                .containsExactly("a contact tap needs channel CALL");
    }
}
