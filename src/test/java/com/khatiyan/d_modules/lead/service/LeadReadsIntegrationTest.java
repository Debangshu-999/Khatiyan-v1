package com.khatiyan.d_modules.lead.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.concurrency.ExpectedVersionHolder;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.service.BookingNegotiationService;
import com.khatiyan.d_modules.booking.service.BookingRequestService;
import com.khatiyan.d_modules.booking.service.BookingSettingsService;
import com.khatiyan.d_modules.booking.service.BookingTokenService;
import com.khatiyan.d_modules.lead.api.dto.LeadActivityResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadCountsResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadDetailResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadFunnelResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadFunnelResponse.DeadLeads;
import com.khatiyan.d_modules.lead.api.dto.LeadFunnelResponse.LostEnquiries;
import com.khatiyan.d_modules.lead.api.dto.LeadResponse;
import com.khatiyan.d_modules.lead.model.LeadActivityType;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadColdReason;
import com.khatiyan.d_modules.lead.model.LeadKind;
import com.khatiyan.d_modules.lead.model.LeadRepeatFlag;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;
import com.khatiyan.d_modules.lead.model.VisitStatus;
import com.khatiyan.support.IntegrationTest;
import com.khatiyan.support.PublishedEvents;

/**
 * Reading the pipeline (user, 2026-10-11): the kind of every record, who came
 * back, who keeps walking away (2026-10-17), what is going cold, and the
 * month's numbers.
 *
 * <p>Sunrise takes a Rs 2,000 token. Lakeview takes none, so agreeing terms
 * there confirms the booking at once. Enquiries, visits and moving in are
 * written as their own modules leave them: how they get there is those suites'
 * business.
 */
@IntegrationTest
@Import(BookingTestClock.class)
class LeadReadsIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private BookingTokenService tokens;
    @Autowired private BookingSettingsService settings;
    @Autowired private LeadPipelineService pipeline;
    @Autowired private LeadPipelineSchedulerService sweep;
    @Autowired private LeadQueryService leads;
    @Autowired private com.khatiyan.d_modules.enquiry.service.EnquiryService enquiries;
    @Autowired private SettableClock clock;

    private BookingFixtures fx;
    private UUID sunrise;
    private UUID sunriseOwner;
    private UUID sunriseRoom;
    private UUID lakeview;
    private UUID lakeviewOwner;
    private UUID lakeviewRoom;
    private LocalDate today;

    @BeforeEach
    void seed() {
        clock.set(null);
        ExpectedVersionHolder.clear();
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        sunrise = fx.property();
        sunriseOwner = fx.ownerOf(sunrise);
        sunriseRoom = fx.room(sunrise, 6, 0);
        fx.paymentDetails(sunrise, true, false);
        settings.create(sunriseOwner, sunrise, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true));
        lakeview = fx.property();
        lakeviewOwner = fx.ownerOf(lakeview);
        lakeviewRoom = fx.room(lakeview, 6, 0);
        fx.paymentDetails(lakeview, true, false);
        settings.create(lakeviewOwner, lakeview, new SaveBookingSettingsRequest(false, null, null, 21, true));
    }

    @AfterEach
    void remove() {
        clock.set(null);
        ExpectedVersionHolder.clear();
        fx.remove();
    }

    // ---- Kinds --------------------------------------------------------------

    @Test
    void everyRecordHasOneKindAndTheListAndTheCountsAgree() {
        UUID asker = fx.person();
        UUID visitor = fx.person();
        UUID booker = fx.person();
        UUID gone = fx.person();
        UUID unanswered = fx.person();

        enquired(lakeview, asker);
        attended(lakeview, visitor);
        confirmAtLakeview(booker, attended(lakeview, booker));
        windowRunsOut(attended(lakeview, gone));
        UUID never = enquired(lakeview, unanswered);
        jdbc.update("UPDATE enquiry.enquiries SET status = 'EXPIRED', expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), never);
        pipeline.syncFromEnquiry(never, lakeview, unanswered);
        sweep.levelOpenLeads();

        assertThat(leads.countsForProperty(lakeviewOwner, lakeview))
                .isEqualTo(new LeadCountsResponse(1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0));

        // The database's reading of a kind and the record's own are the same reading.
        for (LeadKind kind : LeadKind.values()) {
            assertThat(page(lakeview, kind).items()).as("the list of %s", kind)
                    .allSatisfy(lead -> assertThat(lead.kind()).isEqualTo(kind));
        }
        assertThat(only(lakeview, LeadKind.ENQUIRY).prospectUserId()).isEqualTo(asker);
        assertThat(only(lakeview, LeadKind.ADVANCED_LEAD).prospectUserId()).isEqualTo(visitor);
        assertThat(only(lakeview, LeadKind.BOOKED).prospectUserId()).isEqualTo(booker);
        assertThat(only(lakeview, LeadKind.DEAD).prospectUserId()).isEqualTo(gone);
        assertThat(only(lakeview, LeadKind.LOST_ENQUIRY).prospectUserId()).isEqualTo(unanswered);
        assertThat(page(lakeview).totalElements()).isEqualTo(5);
        // Several kinds at once: the leads in play.
        assertThat(page(lakeview, LeadKind.EARLY_LEAD, LeadKind.ADVANCED_LEAD, LeadKind.BOOKED).items())
                .extracting(LeadResponse::prospectUserId).containsExactlyInAnyOrder(visitor, booker);

        // A lead carries what is happening on it: its visit, and its booking.
        LeadResponse booked = only(lakeview, LeadKind.BOOKED);
        assertThat(booked.visit().status()).isEqualTo(VisitStatus.VISITED);
        assertThat(booked.booking().status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(booked.booking().referenceCode()).isNotBlank();
        assertThat(booked.goingCold()).isNull();
        LeadResponse dead = only(lakeview, LeadKind.DEAD);
        assertThat(dead.stage()).isEqualTo(LeadStage.ADVANCED_LEAD);
        assertThat(dead.closeReason()).isEqualTo(LeadCloseReason.BOOKING_WINDOW_EXPIRED);
        assertThat(only(lakeview, LeadKind.ENQUIRY).visit()).isNull();

        LeadDetailResponse detail = leads.detail(lakeviewOwner, booked.id());
        assertThat(detail.enquiryIds()).hasSize(1);
        // Each in a line for the lead details: what was asked, and that it is still open.
        assertThat(detail.enquiries()).singleElement().satisfies(enquiry -> {
            assertThat(enquiry.id()).isEqualTo(detail.enquiryIds().get(0));
            assertThat(enquiry.message()).isEqualTo("Is a bed free?");
            assertThat(enquiry.open()).isTrue();
        });
        assertThat(detail.bookings().get(0).roomNumber()).isNotBlank();
        assertThat(detail.visits()).hasSize(1);
        assertThat(detail.bookings()).singleElement()
                .satisfies(booking -> assertThat(booking.id()).isEqualTo(booked.booking().id()));
        assertThat(detail.timeline()).filteredOn(entry -> entry.bookingRequestId() != null)
                .extracting(LeadActivityResponse::type).containsExactlyInAnyOrder(
                        LeadActivityType.BOOKING_REQUESTED, LeadActivityType.BOOKING_AGREED,
                        LeadActivityType.BOOKING_CONFIRMED);
    }

    // ---- Coming back --------------------------------------------------------

    @Test
    void aPersonWhoComesBackAfterThePropertyLetThemDownIsTaggedResumed() {
        UUID tenant = fx.person();
        // Nobody tried to reach them, so its ending is the property's.
        UUID first = enquired(sunrise, tenant);
        expireUnanswered(sunrise, tenant, first, false);
        LeadResponse lost = only(sunrise, LeadKind.LOST_ENQUIRY);
        assertThat(lost.closeReason()).isEqualTo(LeadCloseReason.NO_REPLY);
        assertThat(lost.resumed()).isFalse();
        assertThat(leads.detail(sunriseOwner, lost.id()).cameBackAs()).isNull();

        // They ask again.
        enquired(sunrise, tenant);

        LeadResponse back = only(sunrise, LeadKind.ENQUIRY);
        assertThat(back.resumed()).isTrue();
        assertThat(back.repeat()).isNull();
        assertThat(back.resumedFrom().id()).isEqualTo(lost.id());
        assertThat(back.resumedFrom().referenceCode()).isEqualTo(lost.referenceCode());
        assertThat(leads.detail(sunriseOwner, lost.id()).cameBackAs().id()).isEqualTo(back.id());
        assertThat(leads.pageForProperty(sunriseOwner, sunrise, null, true, false, 0, 20).items())
                .extracting(LeadResponse::id).containsExactly(back.id());
        // Counted as a resumed lead once it is a lead again, not while it is still an enquiry.
        assertThat(leads.countsForProperty(sunriseOwner, sunrise).resumed()).isZero();

        visited(sunrise, tenant, enquiryOf(back.id()));

        assertThat(only(sunrise, LeadKind.ADVANCED_LEAD).resumed()).isTrue();
        assertThat(leads.countsForProperty(sunriseOwner, sunrise).resumed()).isEqualTo(1);
    }

    @Test
    void aPersonWhoKeepsWalkingAwayComesBackAsADuplicateAndTheFourthTimeAsPotentialSpam() {
        UUID tenant = fx.person();
        // Came, and let the days to book run out: their own doing.
        UUID first = attended(sunrise, tenant);
        windowRunsOut(first);
        sweep.levelOpenLeads();
        LeadResponse dead = only(sunrise, LeadKind.DEAD);
        assertThat(dead.repeat()).isNull();

        // They ask again: a duplicate of that one, and not a resumed lead.
        jdbc.update("UPDATE enquiry.enquiries SET status = 'EXPIRED' WHERE id = ?", first);
        UUID second = enquired(sunrise, tenant);
        LeadResponse duplicate = only(sunrise, LeadKind.ENQUIRY);
        assertThat(duplicate.resumed()).isFalse();
        assertThat(duplicate.resumedFrom()).isNull();
        assertThat(duplicate.state()).isEqualTo(LeadState.OPEN);
        assertThat(duplicate.repeat().flag()).isEqualTo(LeadRepeatFlag.DUPLICATE);
        assertThat(duplicate.repeat().earlierLeads()).isEqualTo(1);
        assertThat(duplicate.repeat().reason())
                .isEqualTo("Has 1 expired lead from this user before, expired due to the user's non interest.");
        assertThat(duplicate.repeat().latest().id()).isEqualTo(dead.id());
        assertThat(leads.detail(sunriseOwner, duplicate.id()).timeline())
                .filteredOn(entry -> entry.type() == LeadActivityType.MARKED_DUPLICATE)
                .singleElement().satisfies(entry -> assertThat(entry.detail()).isEqualTo(dead.referenceCode()));

        // The Enquiries screen shows the same mark on the enquiry that opened it (user, 2026-10-17).
        assertThat(enquiries.pageForProperty(sunriseOwner, sunrise,
                com.khatiyan.d_modules.enquiry.api.dto.EnquiryListScope.ALL, 0, 50).items())
                .filteredOn(enquiry -> enquiry.id().equals(second)).singleElement()
                .satisfies(enquiry -> {
                    assertThat(enquiry.repeatMark().flag())
                            .isEqualTo(com.khatiyan.d_modules.enquiry.api.dto.EnquiryRepeatFlag.DUPLICATE);
                    assertThat(enquiry.repeatMark().reason()).isEqualTo(duplicate.repeat().reason());
                });

        // Someone tried to reach them and they never answered: theirs too. Twice more.
        expireUnanswered(sunrise, tenant, second, true);
        UUID third = enquired(sunrise, tenant);
        assertThat(only(sunrise, LeadKind.ENQUIRY).repeat().flag()).isEqualTo(LeadRepeatFlag.DUPLICATE);
        assertThat(only(sunrise, LeadKind.ENQUIRY).repeat().earlierLeads()).isEqualTo(2);
        expireUnanswered(sunrise, tenant, third, true);

        // The fourth record: potential spam, still worked like any other.
        UUID fourth = enquired(sunrise, tenant);
        LeadResponse spam = only(sunrise, LeadKind.ENQUIRY);
        assertThat(spam.repeat().flag()).isEqualTo(LeadRepeatFlag.POTENTIAL_SPAM);
        assertThat(spam.repeat().earlierLeads()).isEqualTo(3);
        assertThat(spam.repeat().reason())
                .isEqualTo("Has 3 expired leads from this user before, expired due to the user's non interest.");
        assertThat(spam.repeat().latest().id()).isEqualTo(leadOf(sunrise, tenant, third));
        assertThat(leads.detail(sunriseOwner, spam.id()).timeline()).extracting(LeadActivityResponse::type)
                .contains(LeadActivityType.MARKED_SPAM).doesNotContain(LeadActivityType.RESUMED);

        // Both marks at once: every repeat.
        assertThat(leads.pageForProperty(sunriseOwner, sunrise, null, false, false, false,
                Set.of(LeadRepeatFlag.DUPLICATE, LeadRepeatFlag.POTENTIAL_SPAM), null, 0, 50).items()).hasSize(3);
        // Each mark has its own list, whatever the kind.
        assertThat(repeats(sunrise, LeadRepeatFlag.POTENTIAL_SPAM)).extracting(LeadResponse::id)
                .containsExactly(spam.id());
        assertThat(repeats(sunrise, LeadRepeatFlag.DUPLICATE)).extracting(LeadResponse::id)
                .containsExactlyInAnyOrder(duplicate.id(), leadOf(sunrise, tenant, third));

        // Counted once it is a lead, as resumed leads are.
        assertThat(leads.countsForProperty(sunriseOwner, sunrise).potentialSpam()).isZero();
        visited(sunrise, tenant, fourth);
        LeadCountsResponse counts = leads.countsForProperty(sunriseOwner, sunrise);
        assertThat(counts.potentialSpam()).isEqualTo(1);
        assertThat(counts.advancedLeads()).isEqualTo(1);
        assertThat(counts.duplicates()).isZero();

        // The month counts this person once: their first record, never the repeats.
        LeadFunnelResponse month = leads.funnel(sunriseOwner, sunrise, null);
        assertThat(month.enquiriesRaised()).isEqualTo(1);
        assertThat(month.deadLeads()).containsExactly(
                new DeadLeads(LeadStage.ADVANCED_LEAD, LeadCloseReason.BOOKING_WINDOW_EXPIRED, 1));
        assertThat(month.lostEnquiries()).isEmpty();
    }

    // ---- The Leads screen (user's design, 2026-10-17) ------------------------

    @Test
    void theLeadsScreenSearchesByNameOrCodeAndEachCardSaysWhatComesNext() {
        UUID aarav = named(fx.person(), "Aarav Sharma");
        UUID priya = named(fx.person(), "Priya Das");
        UUID aaravsEnquiry = attended(sunrise, aarav);
        attended(sunrise, priya);
        LeadResponse lead = leadFor(sunrise, aarav);

        // By part of the name, in any case, or by the short code.
        assertThat(search(sunrise, "aarav", false)).extracting(LeadResponse::id).containsExactly(lead.id());
        assertThat(search(sunrise, "  SHAR ", false)).extracting(LeadResponse::id).containsExactly(lead.id());
        assertThat(search(sunrise, lead.referenceCode().toLowerCase(), false))
                .extracting(LeadResponse::id).containsExactly(lead.id());
        assertThat(search(sunrise, "Das", false)).extracting(LeadResponse::prospectUserId).containsExactly(priya);
        assertThat(search(sunrise, "nobody", false)).isEmpty();
        // A wildcard typed into the box is only a character.
        assertThat(search(sunrise, "%", false)).hasSize(2);

        // The cold list searches the same way.
        awaitListeners();
        Instant ends = Instant.now().plus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE enquirer_user_id IN (?, ?)",
                Timestamp.from(ends), aarav, priya);
        assertThat(search(sunrise, "priya", true)).extracting(LeadResponse::prospectUserId).containsExactly(priya);

        // What comes next on the card: the days left to book, and the enquiry Follow up opens.
        LeadResponse card = leadFor(sunrise, aarav);
        assertThat(card.bookingWindowEndsAt()).isEqualTo(ends);
        assertThat(card.followUpEnquiryId()).isEqualTo(aaravsEnquiry);
        // The owner may follow up. A manager may not on an enquiry someone else handles.
        assertThat(card.viewerMayFollowUp()).isTrue();
        UUID anita = fx.manager(sunrise, "Anita");
        // Handled by me: the owner handles both, Anita neither.
        assertThat(leads.pageForProperty(sunriseOwner, sunrise, null, false, false, true, Set.of(), null, 0, 20)
                .items()).hasSize(2);
        assertThat(leads.pageForProperty(anita, sunrise, null, false, false, true, Set.of(), null, 0, 20)
                .items()).isEmpty();
        assertThat(leads.pageForProperty(anita, sunrise, null, false, true, true, Set.of(), null, 0, 20)
                .items()).isEmpty();
        assertThat(leads.pageForProperty(anita, sunrise, null, false, false, null, "aarav", 0, 20).items())
                .singleElement().satisfies(seen -> assertThat(seen.viewerMayFollowUp()).isFalse());
        // Follow up reads that one enquiry for the respond sheet.
        assertThat(enquiries.detailForManagement(sunriseOwner, aaravsEnquiry).enquirerUserId()).isEqualTo(aarav);
        assertThatThrownBy(() -> enquiries.detailForManagement(lakeviewOwner, aaravsEnquiry))
                .isInstanceOf(RuntimeException.class);

        // Once it is over there is nothing left to follow up on, or to book from.
        windowRunsOut(aaravsEnquiry);
        sweep.levelOpenLeads();
        LeadResponse dead = leadFor(sunrise, aarav);
        assertThat(dead.kind()).isEqualTo(LeadKind.DEAD);
        assertThat(dead.followUpEnquiryId()).isNull();
        assertThat(dead.viewerMayFollowUp()).isFalse();
        assertThat(dead.bookingWindowEndsAt()).isNull();
    }

    // ---- Going cold ---------------------------------------------------------

    @Test
    void anAdvancedLeadGoesColdAsItsBookingWaitsOrItsTokenFallsDueOrItsDaysRunDown() {
        UUID tenant = fx.person();
        UUID enquiry = attended(sunrise, tenant);
        assertThat(only(sunrise, LeadKind.ADVANCED_LEAD).goingCold()).isNull();
        assertThat(leads.countsForProperty(sunriseOwner, sunrise).goingCold()).isZero();
        assertThat(cold(sunrise).items()).isEmpty();

        // A request just sent is the property's to answer, and has not waited yet.
        BookingRequestResponse sent = act(() -> bookings.create(
                tenant, BookingFixtures.ask(enquiry, sunriseRoom, today.plusDays(10))));
        assertThat(only(sunrise, LeadKind.ADVANCED_LEAD).goingCold()).isNull();

        untouchedFor(sent.id(), 2);
        LeadResponse waiting = only(sunrise, LeadKind.ADVANCED_LEAD);
        assertThat(waiting.goingCold().reason()).isEqualTo(LeadColdReason.BOOKING_WAITING_ON_PROPERTY);
        assertThat(waiting.goingCold().since()).isNotNull();
        assertThat(waiting.goingCold().by()).isEqualTo(waiting.booking().expiresAt());
        assertThat(leads.countsForProperty(sunriseOwner, sunrise).goingCold()).isEqualTo(1);
        assertThat(cold(sunrise).items()).extracting(LeadResponse::id).containsExactly(waiting.id());

        // Terms agreed: the tenant's move now, with two days to pay.
        act(() -> negotiation.acceptForProperty(sunriseOwner, sunrise, sent.id(), 1));
        assertThat(only(sunrise, LeadKind.ADVANCED_LEAD).goingCold()).isNull();

        Instant due = Instant.now().plus(6, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS);
        jdbc.update("UPDATE booking.requests SET token_due_at = ? WHERE id = ?", Timestamp.from(due), sent.id());
        LeadResponse owing = only(sunrise, LeadKind.ADVANCED_LEAD);
        assertThat(owing.goingCold().reason()).isEqualTo(LeadColdReason.TOKEN_DUE_SOON);
        assertThat(owing.goingCold().by()).isEqualTo(due);

        // They say they paid. The clock stops, and it is the property's to check.
        tokens.claimPaid(tenant, sent.id(), ManualPaymentMethod.UPI, "UTR20261011", List.of());
        assertThat(only(sunrise, LeadKind.ADVANCED_LEAD).goingCold()).isNull();
        untouchedFor(sent.id(), 2);
        LeadResponse unchecked = only(sunrise, LeadKind.ADVANCED_LEAD);
        assertThat(unchecked.goingCold().reason()).isEqualTo(LeadColdReason.BOOKING_WAITING_ON_PROPERTY);
        assertThat(unchecked.goingCold().by()).isNull();

        // The property cancels. Nothing is live, and the days to ask again are what is left.
        act(() -> negotiation.cancelForProperty(sunriseOwner, sunrise, sent.id(), "The room is being repaired"));
        assertThat(only(sunrise, LeadKind.ADVANCED_LEAD).goingCold()).isNull();

        Instant ends = Instant.now().plus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?", Timestamp.from(ends), enquiry);
        LeadResponse running = only(sunrise, LeadKind.ADVANCED_LEAD);
        assertThat(running.goingCold().reason()).isEqualTo(LeadColdReason.BOOKING_WINDOW_CLOSING);
        assertThat(running.goingCold().by()).isEqualTo(ends);
    }

    @Test
    void anEarlyLeadGoesColdAfterAMissedVisitAndABookedOneAfterItsMoveInDay() {
        // Missed their visit. A week to say they are still interested.
        UUID visitor = fx.person();
        UUID lead = leadOf(sunrise, visitor, enquired(sunrise, visitor));
        UUID visit = earlyLeadWithVisit(sunrise, visitor, lead, today.minusDays(1), "NOT_VISITED");
        Instant missed = Instant.now().minus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
        jdbc.update("UPDATE lead.visits SET no_visit_at = ? WHERE id = ?", Timestamp.from(missed), visit);
        LeadResponse fresh = only(sunrise, LeadKind.EARLY_LEAD);
        assertThat(fresh.goingCold()).isNull();
        assertThat(fresh.visit().stillInterestedUntil()).isEqualTo(missed.plus(7, ChronoUnit.DAYS));

        // Five days on, two are left.
        Instant longAgo = Instant.now().minus(5, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
        jdbc.update("UPDATE lead.visits SET no_visit_at = ? WHERE id = ?", Timestamp.from(longAgo), visit);
        LeadResponse cooling = only(sunrise, LeadKind.EARLY_LEAD);
        assertThat(cooling.goingCold().reason()).isEqualTo(LeadColdReason.MISSED_VISIT_UNANSWERED);
        assertThat(cooling.goingCold().since()).isEqualTo(longAgo);
        assertThat(cooling.goingCold().by()).isEqualTo(longAgo.plus(7, ChronoUnit.DAYS));

        // Booked at Lakeview for ten days from now. On time, until the day has gone by.
        UUID booker = fx.person();
        confirmAtLakeview(booker, attended(lakeview, booker));
        assertThat(only(lakeview, LeadKind.BOOKED).goingCold()).isNull();

        clock.set(Instant.now().plus(11, ChronoUnit.DAYS));
        LeadResponse late = only(lakeview, LeadKind.BOOKED);
        assertThat(late.goingCold().reason()).isEqualTo(LeadColdReason.MOVE_IN_OVERDUE);
        assertThat(late.goingCold().since())
                .isEqualTo(today.plusDays(11).atStartOfDay(IST).toInstant());
        assertThat(late.goingCold().by()).isNull();
        assertThat(cold(lakeview).items()).extracting(LeadResponse::id).containsExactly(late.id());
    }

    // ---- The month ----------------------------------------------------------

    @Test
    void theMonthsFunnelCountsEachStepInTheMonthItHappened() {
        UUID mover = fx.person();
        UUID gone = fx.person();
        UUID unanswered = fx.person();
        UUID answered = fx.person();

        // Booked and moved in.
        UUID moversEnquiry = attended(lakeview, mover);
        BookingRequestResponse confirmed = confirmAtLakeview(mover, moversEnquiry);
        jdbc.update("""
                UPDATE booking.requests
                SET tenancy_id = ?, converted_at = now(), converted_by_user_id = ?, status = 'MOVED_IN',
                    closed_at = now(), end_cause = 'MOVED_IN'
                WHERE id = ?
                """, UUID.randomUUID(), lakeviewOwner, confirmed.id());
        pipeline.syncFromEnquiry(moversEnquiry, lakeview, mover);
        // Came, and never booked.
        UUID gonesEnquiry = attended(lakeview, gone);
        windowRunsOut(gonesEnquiry);
        // Asked, and nobody answered.
        UUID never = enquired(lakeview, unanswered);
        jdbc.update("UPDATE enquiry.enquiries SET status = 'EXPIRED', expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), never);
        pipeline.syncFromEnquiry(never, lakeview, unanswered);
        sweep.levelOpenLeads();
        // Asked, and reached ten minutes later.
        UUID reached = leadOf(lakeview, answered, enquired(lakeview, answered));
        jdbc.update("UPDATE lead.leads SET enquired_at = now() - INTERVAL '10 minutes', responded_at = now()"
                + " WHERE id = ?", reached);

        LeadFunnelResponse month = leads.funnel(lakeviewOwner, lakeview, YearMonth.from(today));

        assertThat(month.month()).isEqualTo(YearMonth.from(today).toString());
        assertThat(month.enquiriesRaised()).isEqualTo(4);
        assertThat(month.enquiriesAnswered()).isEqualTo(1);
        assertThat(month.firstResponseMedianSeconds()).isEqualTo(600);
        assertThat(month.firstResponseP90Seconds()).isEqualTo(600);
        assertThat(month.bookingRequests()).isEqualTo(1);
        assertThat(month.bookingsConfirmed()).isEqualTo(1);
        assertThat(month.moveIns()).isEqualTo(1);
        assertThat(month.deadLeads()).containsExactly(
                new DeadLeads(LeadStage.ADVANCED_LEAD, LeadCloseReason.BOOKING_WINDOW_EXPIRED, 1));
        assertThat(month.lostEnquiries()).containsExactly(new LostEnquiries(LeadCloseReason.NO_REPLY, 1));
        assertThat(month.resumedLeads()).isZero();
        assertThat(month.goingCold()).isZero();

        // The one who never booked asks again: a duplicate, so the month does not count them twice.
        jdbc.update("UPDATE enquiry.enquiries SET status = 'EXPIRED' WHERE id = ?", gonesEnquiry);
        enquired(lakeview, gone);
        assertThat(leads.funnel(lakeviewOwner, lakeview, null).enquiriesRaised()).isEqualTo(4);
        // The one nobody answered asks again: a resumed lead of this month, not yet moved in.
        enquired(lakeview, unanswered);
        LeadFunnelResponse after = leads.funnel(lakeviewOwner, lakeview, null);
        assertThat(after.enquiriesRaised()).isEqualTo(5);
        assertThat(after.resumedLeads()).isEqualTo(1);
        assertThat(after.resumedConverted()).isZero();

        // Nothing of it happened last month.
        LeadFunnelResponse before = leads.funnel(lakeviewOwner, lakeview, YearMonth.from(today).minusMonths(1));
        assertThat(before.enquiriesRaised() + before.bookingRequests() + before.moveIns() + before.resumedLeads())
                .isZero();
        assertThat(before.firstResponseMedianSeconds()).isNull();
        assertThat(before.deadLeads()).isEmpty();
        assertThat(before.lostEnquiries()).isEmpty();

        // Another property's manager reads none of it.
        assertThatThrownBy(() -> leads.funnel(sunriseOwner, lakeview, null)).isInstanceOf(RuntimeException.class);
    }

    // ---- Helpers ------------------------------------------------------------

    /** An enquiry nobody has visited on, with the record it opens. */
    private UUID enquired(UUID property, UUID person) {
        UUID enquiry = fx.enquiry(property, person);
        pipeline.syncFromEnquiry(enquiry, property, person);
        return enquiry;
    }

    /**
     * Someone whose visit was attended yesterday: an advanced lead, with the
     * days after the visit still open.
     *
     * @return their enquiry
     */
    private UUID attended(UUID property, UUID person) {
        UUID enquiry = fx.attendedEnquiry(property, person, today.minusDays(1));
        pipeline.syncFromEnquiry(enquiry, property, person);
        visited(property, person, enquiry);
        return enquiry;
    }

    /** The attended visit itself, as the visit day leaves it, on an enquiry that may not have had one. */
    private void visited(UUID property, UUID person, UUID enquiry) {
        if (fx.visitOf(enquiry) == null) {
            jdbc.update("""
                    UPDATE enquiry.enquiries
                    SET booking_visit_id = ?, booking_visit_date = ?, pre_visit_expires_at = expires_at,
                        expires_at = now() + INTERVAL '29 days'
                    WHERE id = ?
                    """, UUID.randomUUID(), today.minusDays(1), enquiry);
        }
        UUID visit = fx.visitOf(enquiry);
        jdbc.update("""
                INSERT INTO lead.visits (id, reference_code, lead_id, property_id, prospect_user_id, enquiry_id,
                    visit_date, slot_start_minute, slot_end_minute, booked_by, booked_by_user_id, status,
                    checked_in_at, checked_in_by_user_id, check_in_method)
                VALUES (?, ?, ?, ?, ?, ?, ?, 600, 660, 'TENANT', ?, 'VISITED', ?, ?, 'QR')
                """, visit, "VIS-T-" + visit.toString().substring(0, 12), leadOf(property, person, enquiry),
                property, person, enquiry, today.minusDays(1), person,
                Timestamp.from(Instant.now().minus(1, ChronoUnit.DAYS)), fx.ownerOf(property));
        pipeline.syncFromEnquiry(enquiry, property, person);
    }

    /** Makes a record an early lead with one visit, as scheduling leaves it, in the state asked for. */
    private UUID earlyLeadWithVisit(UUID property, UUID person, UUID lead, LocalDate on, String status) {
        jdbc.update("UPDATE lead.leads SET stage = 'EARLY_LEAD', early_lead_at = now(), became_lead_at = now()"
                + " WHERE id = ?", lead);
        UUID visit = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO lead.visits (id, reference_code, lead_id, property_id, prospect_user_id, enquiry_id,
                    visit_date, slot_start_minute, slot_end_minute, booked_by, booked_by_user_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 600, 660, 'TENANT', ?, ?)
                """, visit, "VIS-T-" + visit.toString().substring(0, 12), lead, property, person,
                enquiryOf(lead), on, person, status);
        return visit;
    }

    private UUID leadOf(UUID property, UUID person, UUID enquiry) {
        return jdbc.queryForObject("SELECT lead_id FROM lead.lead_enquiries WHERE enquiry_id = ?", UUID.class, enquiry);
    }

    private UUID enquiryOf(UUID lead) {
        return jdbc.queryForObject("SELECT enquiry_id FROM lead.leads WHERE id = ?", UUID.class, lead);
    }

    /** A request at Lakeview, agreed by its owner. It takes no token, so that confirms it. */
    private BookingRequestResponse confirmAtLakeview(UUID person, UUID enquiry) {
        BookingRequestResponse sent = act(() -> bookings.create(
                person, BookingFixtures.ask(enquiry, lakeviewRoom, today.plusDays(10))));
        BookingRequestResponse confirmed = act(
                () -> negotiation.acceptForProperty(lakeviewOwner, lakeview, sent.id(), 1));
        assertThat(confirmed.status()).isEqualTo(BookingStatus.CONFIRMED);
        return confirmed;
    }

    /** The days after the visit are over, with nothing having said so. */
    private void windowRunsOut(UUID enquiry) {
        awaitListeners();
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), enquiry);
    }

    /** Nothing has been written on the booking for this many days. */
    private void untouchedFor(UUID request, int days) {
        awaitListeners();
        jdbc.update("UPDATE booking.requests SET updated_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minus(days, ChronoUnit.DAYS)), request);
    }

    private <T> T act(Supplier<T> action) {
        T result = action.get();
        awaitListeners();
        return result;
    }

    private void awaitListeners() {
        for (UUID property : List.of(sunrise, lakeview)) {
            PublishedEvents.awaitHandled(jdbc, "LeadBookingEventListener", property);
            PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);
        }
    }

    /**
     * The enquiry runs out with nobody having reached them, as the expiry
     * sweep leaves it, and the pipeline hears of it.
     *
     * @param tried somebody did try, so the ending is theirs
     */
    private void expireUnanswered(UUID property, UUID person, UUID enquiry, boolean tried) {
        awaitListeners();
        jdbc.update("UPDATE enquiry.enquiries SET status = 'EXPIRED', expires_at = ?, end_reason = ? WHERE id = ?",
                // A moment ago, so it ends after whatever ended before it in the test.
                Timestamp.from(Instant.now().minusMillis(1)),
                tried ? "TENANT_DID_NOT_RESPOND" : "HANDLER_DID_NOT_RESPOND", enquiry);
        pipeline.syncFromEnquiry(enquiry, property, person);
    }

    private UUID named(UUID person, String name) {
        jdbc.update("UPDATE auth.users SET full_name = ? WHERE id = ?", name, person);
        return person;
    }

    private List<LeadResponse> search(UUID property, String search, boolean goingCold) {
        return leads.pageForProperty(
                fx.ownerOf(property), property, null, false, goingCold, null, search, 0, 50).items();
    }

    private List<LeadResponse> repeats(UUID property, LeadRepeatFlag flag) {
        return leads.pageForProperty(fx.ownerOf(property), property, null, false, false, flag, 0, 50).items();
    }

    /** The property's records of these kinds. None named, every record. */
    private PageResponse<LeadResponse> page(UUID property, LeadKind... kinds) {
        return leads.pageForProperty(
                fx.ownerOf(property), property, kinds.length == 0 ? null : Set.of(kinds), false, false, 0, 50);
    }

    private PageResponse<LeadResponse> cold(UUID property) {
        return leads.pageForProperty(fx.ownerOf(property), property, null, false, true, 0, 50);
    }

    private LeadResponse only(UUID property, LeadKind kind) {
        List<LeadResponse> found = page(property, kind).items();
        assertThat(found).as("the %s records", kind).hasSize(1);
        return found.get(0);
    }

    private LeadResponse leadFor(UUID property, UUID person) {
        return page(property).items().stream()
                .filter(lead -> lead.prospectUserId().equals(person))
                .findFirst()
                .orElseThrow();
    }
}
