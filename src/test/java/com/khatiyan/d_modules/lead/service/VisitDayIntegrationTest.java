package com.khatiyan.d_modules.lead.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.analytics.LargePropertySeeder;
import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.chat.ChatModule;
import com.khatiyan.d_modules.chat.event.ChatMessageSentEvent;
import com.khatiyan.d_modules.chat.model.ChatThreadOrigin;
import com.khatiyan.d_modules.enquiry.api.dto.MyEnquiryItemResponse;
import com.khatiyan.d_modules.enquiry.api.dto.PostVisitBookingEligibility;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.enquiry.PostVisitBookingWindow;
import com.khatiyan.d_modules.enquiry.service.EnquiryExpirySchedulerService;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.enquiry.api.dto.MyEnquiryState;
import com.khatiyan.d_modules.enquiry.api.dto.RaiseEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.RespondToEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.UpdateEnquiryChannelConsentsRequest;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.service.EnquiryChannelConsentService;
import com.khatiyan.d_modules.enquiry.service.EnquiryService;
import com.khatiyan.d_modules.lead.api.dto.CancelVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.CheckInVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.PropertyVisitsResponse;
import com.khatiyan.d_modules.lead.api.dto.RescheduleVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.ScheduleVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.VisitCardResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitCardState;
import com.khatiyan.d_modules.lead.api.dto.VisitFormRequest;
import com.khatiyan.d_modules.lead.api.dto.VisitMoveOptionsResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitPassResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitResponse;
import com.khatiyan.d_modules.lead.model.VisitCheckInMethod;
import com.khatiyan.d_modules.lead.model.VisitImpression;
import com.khatiyan.d_modules.lead.model.VisitWindow;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.api.dto.SaveVisitSlotsRequest;
import com.khatiyan.d_modules.property.service.PropertyVisitSlotService;
import com.khatiyan.support.IntegrationTest;
import com.khatiyan.support.PublishedEvents;

/**
 * The visit day, end to end (user, 2026-10-04): the visitor's pass, checking
 * in by QR or code, the owner's missed check-in, No visit after midnight and
 * the week that follows, and who may move a visit when.
 *
 * <p>The property offers two slots every day, 10 to 11 and 4 to 5, each taking
 * two visits. The clock is the test's own, so a rule that turns on the time of
 * day is checked at that time whatever hour the build runs at. Its date is
 * always the real one.
 */
@IntegrationTest
@Import(VisitDayIntegrationTest.ClockOverride.class)
class VisitDayIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final LocalTime TEN = LocalTime.of(10, 0);
    private static final LocalTime FOUR = LocalTime.of(16, 0);

    @Autowired private JdbcTemplate jdbc;
    @Autowired private EnquiryService enquiryService;
    @Autowired private EnquiryChannelConsentService consentService;
    @Autowired private PropertyVisitSlotService visitSlots;
    @Autowired private LeadVisitService visits;
    @Autowired private VisitDayService visitDay;
    @Autowired private VisitDaySchedulerService sweep;
    @Autowired private VisitNotificationSchedulerService notices;
    @Autowired private AfterVisitTelling afterVisit;

    @MockitoBean private NotificationModule notifications;
    @MockitoBean private ChatModule chat;
    @Autowired private SettableClock clock;

    private final EnquiryModule enquiries;
    private final EnquiryExpirySchedulerService enquiryExpiry;
    private final LeadPipelineService pipeline;

    @Autowired
    VisitDayIntegrationTest(EnquiryModule enquiries, EnquiryExpirySchedulerService enquiryExpiry,
            LeadPipelineService pipeline) {
        this.enquiries = enquiries;
        this.enquiryExpiry = enquiryExpiry;
        this.pipeline = pipeline;
    }

    private Seeded seeded;
    private UUID property;
    private UUID owner;
    private UUID manager;
    private UUID otherManager;
    private List<UUID> prospects;

    private final UUID thread = UUID.randomUUID();
    private final LocalDate today = LocalDate.now(IST);
    private final LocalDate tomorrow = today.plusDays(1);

    /**
     * The application's clock, settable. A real one and not a mock: the event
     * registry stamps every publication with it while the context starts, long
     * before a test could stub anything. Left alone it is the system clock.
     */
    static class SettableClock extends Clock {
        private volatile Instant fixed;

        void set(Instant instant) {
            this.fixed = instant;
        }

        @Override
        public ZoneId getZone() {
            return IST;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            Instant set = fixed;
            return set != null ? set : Instant.now();
        }
    }

    @TestConfiguration
    static class ClockOverride {
        @Bean
        @Primary
        SettableClock settableClock() {
            return new SettableClock();
        }
    }

    @BeforeEach
    void seed() {
        itIs(9, 0);

        seeded = LargePropertySeeder.seed(jdbc, today, 8, 1, 62L);
        property = seeded.propertyId();
        owner = seeded.ownerId();
        // Visitors who do not stay here: a tenant of the place books no visit (user, 2026-10-17).
        prospects = List.of(visitor("Visitor A"), visitor("Visitor B"), visitor("Visitor C"));
        assertThat(prospects).hasSize(3);
        manager = manager("Manager A");
        otherManager = manager("Manager B");
        when(chat.openEnquiryThread(any(), any(), any(), any(), any())).thenReturn(thread);

        visitSlots.create(owner, property, new SaveVisitSlotsRequest(
                EnumSet.allOf(DayOfWeek.class),
                List.of(new SaveVisitSlotsRequest.SlotInput(TEN, LocalTime.of(11, 0)),
                        new SaveVisitSlotsRequest.SlotInput(FOUR, LocalTime.of(17, 0))),
                2));
    }

    @AfterEach
    void remove() {
        PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);
        clock.set(null);
        jdbc.update("DELETE FROM lead.visit_notices WHERE property_id = ?", property);
        for (UUID prospect : prospects) {
            jdbc.update("DELETE FROM mail.outbox WHERE user_id = ?", prospect);
        }
        jdbc.update("DELETE FROM lead.leads WHERE property_id = ?", property);
        jdbc.update("DELETE FROM enquiry.enquiries WHERE property_id = ?", property);
        for (UUID prospect : prospects) {
            jdbc.update("DELETE FROM enquiry.enquiry_channel_consents WHERE user_id = ?", prospect);
        }
        jdbc.update("""
                DELETE FROM property.property_visit_slots WHERE settings_id IN
                    (SELECT id FROM property.property_visit_settings WHERE property_id = ?)
                """, property);
        jdbc.update("DELETE FROM property.property_visit_settings WHERE property_id = ?", property);
        jdbc.update("DELETE FROM property.property_managers WHERE property_id = ?", property);
        LargePropertySeeder.remove(jdbc, seeded);
        jdbc.update("DELETE FROM auth.users WHERE id IN (?, ?)", manager, otherManager);
        for (UUID prospect : prospects) {
            jdbc.update("DELETE FROM auth.users WHERE id = ?", prospect);
        }
    }

    // ---- Mails to the visitor (user, 2026-10-18) -------------------------------

    @Test
    void theVisitorIsMailedWhenTheirVisitIsBookedMovedAndCancelledOnlyWithAVerifiedEmail() {
        UUID mailed = prospects.get(0);
        verifiedEmail(mailed);
        UUID visit = visitOn(mailed, tomorrow, TEN);
        visits.reschedule(mailed, visit, new RescheduleVisitRequest(tomorrow, FOUR, null));
        visits.cancel(mailed, visit, new CancelVisitRequest(true, "Plans changed"));

        assertThat(mailKinds(mailed)).containsExactly("VISIT_SCHEDULED", "VISIT_RESCHEDULED", "VISIT_CANCELLED");
        assertThat(mailSubject(mailed, "VISIT_RESCHEDULED")).endsWith(" was moved");
        // The new slot and the old one are both in it, and the short code, never the id.
        String moved = mailText(mailed, "VISIT_RESCHEDULED");
        assertThat(moved).contains("4:00 pm").contains("Was:").contains("10:00 am").contains("VIS-")
                .doesNotContain(visit.toString());
        assertThat(mailText(mailed, "VISIT_CANCELLED")).contains("You cancelled your visit");

        // No verified email, no mail. The push still goes, as it always has.
        visitOn(prospects.get(2), tomorrow, TEN);
        assertThat(mailKinds(prospects.get(2))).isEmpty();
    }

    @Test
    void threeHoursAfterCheckInTheVisitorIsToldHowToBookOnceAndNotAtNight() {
        UUID mailed = prospects.get(0);
        verifiedEmail(mailed);
        UUID visit = visitOn(mailed, today, TEN);
        UUID pushed = visitOn(prospects.get(1), today, TEN);
        itIs(10, 5);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(mailed, visit).token(), null));
        visitDay.checkIn(manager, pushed, new CheckInVisitRequest(visitDay.pass(prospects.get(1), pushed).token(), null));

        itIs(13, 0);
        assertThat(afterVisit.tellDue()).as("not three hours yet").isZero();
        itIs(13, 10);
        assertThat(afterVisit.tellDue()).isEqualTo(2);
        assertThat(mailKinds(mailed)).contains("VISIT_AFTER");
        assertThat(mailText(mailed, "VISIT_AFTER")).contains("Book a stay").contains("Book by:");
        // No verified email: the app says it instead.
        verify(notifications).notifyUser(eq(prospects.get(1)), contains("Liked"), contains("Book a stay"), any(), any(),
                eq(NotificationSubtype.VISIT_AFTER_BOOK_A_STAY), eq(pushed), any(), any(), any());
        // Once.
        itIs(14, 0);
        assertThat(afterVisit.tellDue()).isZero();
    }

    @Test
    void noAfterVisitTellingForSomeoneWhoDidNotLikeItNorBetweenNineAtNightAndNineInTheMorning() {
        UUID disliked = prospects.get(0);
        verifiedEmail(disliked);
        UUID visit = visitOn(disliked, today, FOUR);
        UUID late = visitOn(prospects.get(1), today, FOUR);
        verifiedEmail(prospects.get(1));
        itIs(16, 10);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(disliked, visit).token(), null));
        visitDay.checkIn(manager, late, new CheckInVisitRequest(visitDay.pass(prospects.get(1), late).token(), null));
        visitDay.completeForm(manager, visit, new VisitFormRequest(LocalTime.of(16, 40), 1, VisitImpression.DISLIKED));

        // Three hours on is 7:10 pm, inside the day: the one who disliked it is settled and not told.
        itIs(19, 15);
        afterVisit.tellDue();
        assertThat(mailKinds(disliked)).doesNotContain("VISIT_AFTER");
        assertThat(jdbc.queryForObject("SELECT after_visit_told_at IS NOT NULL FROM lead.visits WHERE id = ?",
                Boolean.class, visit)).isTrue();
        assertThat(mailKinds(prospects.get(1))).contains("VISIT_AFTER");

        assertThat(AfterVisitTelling.isQuiet(today.atTime(21, 0).atZone(IST).toInstant())).isTrue();
        assertThat(AfterVisitTelling.isQuiet(today.atTime(8, 59).atZone(IST).toInstant())).isTrue();
        assertThat(AfterVisitTelling.isQuiet(today.atTime(9, 0).atZone(IST).toInstant())).isFalse();
    }

    private void verifiedEmail(UUID user) {
        jdbc.update("UPDATE auth.users SET email = ?, is_email_verified = true WHERE id = ?",
                "visitor-" + user + "@example.test", user);
    }

    private List<String> mailKinds(UUID user) {
        return jdbc.queryForList("SELECT kind FROM mail.outbox WHERE user_id = ? ORDER BY created_at", String.class, user);
    }

    private String mailSubject(UUID user, String kind) {
        return jdbc.queryForObject("SELECT subject FROM mail.outbox WHERE user_id = ? AND kind = ?", String.class, user, kind);
    }

    private String mailText(UUID user, String kind) {
        return jdbc.queryForObject("SELECT text_body FROM mail.outbox WHERE user_id = ? AND kind = ?", String.class, user, kind);
    }

    // ---- The screen --------------------------------------------------------

    @Test
    void historyKeepsAttendedMissedAndCancelledVisitsAndPagesNewestFirst() {
        UUID attended = visitOn(prospects.get(0), today, TEN);
        itIs(10, 5);
        VisitPassResponse pass = visitDay.pass(prospects.get(0), attended);
        visitDay.checkIn(manager, attended, new CheckInVisitRequest(pass.token(), null));
        jdbc.update("UPDATE lead.visits SET visit_date = ? WHERE id = ?", java.sql.Date.valueOf(today.minusDays(1)), attended);
        itIs(9, 0);

        UUID missed = visitOn(prospects.get(1), today.minusDays(2), FOUR);
        sweep.markNoVisits();
        jdbc.update("UPDATE enquiry.enquiries SET status = 'EXPIRED', expires_at = now() - interval '1 day' WHERE id = ?", enquiryOf(missed));
        UUID cancelled = visitOn(prospects.get(2), tomorrow, TEN);
        visits.cancel(prospects.get(2), cancelled, new CancelVisitRequest(true, "Plans changed"));

        var first = visitDay.propertyHistory(otherManager, property, 0, 2);
        assertThat(first.totalElements()).isEqualTo(3);
        assertThat(first.hasNext()).isTrue();
        assertThat(first.items()).extracting(VisitCardResponse::visitId, VisitCardResponse::state)
                .containsExactly(tuple(cancelled, VisitCardState.CANCELLED), tuple(attended, VisitCardState.VISITED));
        assertThat(first.items()).allSatisfy(card -> assertThat(card.prospectName()).isNotBlank());
        assertThat(visitDay.propertyHistory(owner, property, 1, 2).items())
                .extracting(VisitCardResponse::visitId).containsExactly(missed);

        // Narrowed by status, All when not given (user, 2026-10-19).
        assertThat(visitDay.propertyHistory(owner, property, 0, 12, "VISITED").items())
                .extracting(VisitCardResponse::visitId).containsExactly(attended);
        assertThat(visitDay.propertyHistory(owner, property, 0, 12, "NO_VISIT").items())
                .extracting(VisitCardResponse::visitId).containsExactly(missed);
        assertThat(visitDay.propertyHistory(owner, property, 0, 12, "cancelled").items())
                .extracting(VisitCardResponse::visitId).containsExactly(cancelled);
        assertThat(visitDay.propertyHistory(owner, property, 0, 12, null).totalElements()).isEqualTo(3);
        assertThatThrownBy(() -> visitDay.propertyHistory(owner, property, 0, 12, "LATE"))
                .isInstanceOf(com.khatiyan.c_shared.exception.ValidationException.class);

        // Each visitor sees their own records, including their cancellation.
        assertThat(visitDay.myHistory(prospects.get(2), 0, 12).items())
                .singleElement().satisfies(card -> {
                    assertThat(card.visitId()).isEqualTo(cancelled);
                    assertThat(card.state()).isEqualTo(VisitCardState.CANCELLED);
                });
        assertThat(visitDay.myHistory(prospects.get(0), 0, 12).items())
                .singleElement().satisfies(card -> assertThat(card.visitId()).isEqualTo(attended));
        assertThat(visitDay.myHistory(owner, 0, 12).items()).isEmpty();
        assertThatThrownBy(() -> visitDay.propertyHistory(prospects.get(0), property, 0, 12))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void historyExcludesTodaysAndUpcomingScheduledVisits() {
        UUID todays = visitOn(prospects.get(0), today, TEN);
        UUID upcoming = visitOn(prospects.get(1), tomorrow, FOUR);
        UUID past = visitOn(prospects.get(2), today.minusDays(1), TEN);
        assertThat(visitDay.propertyHistory(owner, property, 0, 12).items())
                .extracting(VisitCardResponse::visitId).containsExactly(past);
        assertThat(visitDay.myHistory(prospects.get(0), 0, 12).items()).isEmpty();
        assertThat(visitDay.myHistory(prospects.get(1), 0, 12).items()).isEmpty();
        assertThat(visitDay.propertyVisits(owner, property).today())
                .extracting(VisitCardResponse::visitId).containsExactly(todays);
        assertThat(visitDay.propertyVisits(owner, property).upcoming())
                .extracting(VisitCardResponse::visitId).containsExactly(upcoming);
    }

    /** Every manager sees the property's visits: today's, the ones to come, and the missed. */
    @Test
    void theScreenListsTodayUpcomingAndMissedForEveryManager() {
        UUID todays = visitOn(prospects.get(0), today, TEN);
        UUID tomorrows = visitOn(prospects.get(1), tomorrow, FOUR);
        UUID yesterdays = visitOn(prospects.get(2), today.minusDays(1), TEN);
        sweep.markNoVisits();

        PropertyVisitsResponse screen = visitDay.propertyVisits(otherManager, property);

        assertThat(screen.viewerIsOwner()).isFalse();
        assertThat(screen.today()).extracting(VisitCardResponse::visitId).containsExactly(todays);
        assertThat(screen.upcoming()).extracting(VisitCardResponse::visitId).containsExactly(tomorrows);
        assertThat(screen.missed()).extracting(VisitCardResponse::visitId).containsExactly(yesterdays);
        VisitCardResponse card = screen.today().get(0);
        assertThat(card.state()).isEqualTo(VisitCardState.SCHEDULED);
        assertThat(card.prospectName()).isNotBlank();
        assertThat(card.handlerName()).isEqualTo("Manager A");
        assertThat(card.referenceCode()).startsWith("VIS-");
        assertThat(card.slotStartsAt()).isEqualTo(today.atTime(TEN).atZone(IST).toInstant());
        assertThat(screen.missed().get(0).state()).isEqualTo(VisitCardState.MISSED);
        assertThat(visitDay.propertyVisits(owner, property).viewerIsOwner()).isTrue();
        // Every slot the property offers today, with or without a visit in it
        // (user, 2026-10-04): the afternoon one is empty and still listed.
        assertThat(screen.todaySlots())
                .extracting(PropertyVisitsResponse.TodaySlot::start, PropertyVisitsResponse.TodaySlot::capacity)
                .containsExactly(tuple(TEN, 2), tuple(FOUR, 2));
        assertThat(screen.todaySlots().get(1).startsAt()).isEqualTo(today.atTime(FOUR).atZone(IST).toInstant());

        // Not for someone who does not manage the property.
        assertThatThrownBy(() -> visitDay.propertyVisits(prospects.get(0), property))
                .isInstanceOf(ForbiddenException.class);
    }

    /** The visitor's own list: their visits at any property, with the moments their screen needs. */
    @Test
    void theVisitorSeesTheirOwnVisits() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, FOUR);
        visitOn(prospects.get(1), tomorrow, TEN);

        assertThat(visitDay.myVisits(prospect)).singleElement().satisfies(mine -> {
            assertThat(mine.visitId()).isEqualTo(visit);
            assertThat(mine.state()).isEqualTo(VisitCardState.SCHEDULED);
            assertThat(mine.propertyName()).isNotBlank();
            // Where to, for the Directions card: Google Maps works out where from.
            assertThat(mine.directionsUrl()).startsWith("https://www.google.com/maps/dir/?api=1&destination=");
            assertThat(mine.passOpensAt()).isEqualTo(today.atTime(15, 0).atZone(IST).toInstant());
            // It stays for the rest of the day, the slot having ended or not.
            assertThat(mine.passClosesAt()).isEqualTo(today.plusDays(1).atStartOfDay(IST).toInstant());
            assertThat(mine.runningLateFrom()).isEqualTo(today.atTime(16, 30).atZone(IST).toInstant());
            assertThat(mine.enquiryOpen()).isTrue();
            assertThat(mine.checkedInByName()).as("nobody has checked them in").isNull();
        });
        assertThat(visitDay.myVisits(owner)).isEmpty();
    }

    /**
     * Moved to another day, a visit still shows on Today, under the slot it
     * left, as Rescheduled with where it went (user, 2026-10-04). It is in
     * Upcoming as well, as the visit it now is.
     */
    @Test
    void aVisitMovedToAnotherDayShowsAsRescheduledTodayAndInUpcoming() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, FOUR);
        UUID staying = visitOn(prospects.get(1), today, TEN);
        itIs(9, 0);

        visits.reschedule(prospect, visit, new RescheduleVisitRequest(tomorrow, TEN, null));

        PropertyVisitsResponse screen = visitDay.propertyVisits(owner, property);
        assertThat(screen.today()).extracting(VisitCardResponse::visitId).containsExactly(staying, visit);
        VisitCardResponse rescheduled = screen.today().get(1);
        assertThat(rescheduled.state()).isEqualTo(VisitCardState.RESCHEDULED);
        // Under the slot it left.
        assertThat(rescheduled.date()).isEqualTo(today);
        assertThat(rescheduled.slotStart()).isEqualTo(FOUR);
        assertThat(rescheduled.rescheduledToDate()).isEqualTo(tomorrow);
        assertThat(rescheduled.rescheduledToSlotStart()).isEqualTo(TEN);

        assertThat(screen.upcoming()).singleElement().satisfies(upcoming -> {
            assertThat(upcoming.visitId()).isEqualTo(visit);
            assertThat(upcoming.state()).isEqualTo(VisitCardState.SCHEDULED);
            assertThat(upcoming.date()).isEqualTo(tomorrow);
            assertThat(upcoming.rescheduledToDate()).isNull();
            // When it took the date it has now: the move. The Upcoming tab counts by it.
            assertThat(upcoming.placedAt()).isEqualTo(jdbc.queryForObject(
                    "SELECT moved_at FROM lead.visits WHERE id = ?", java.sql.Timestamp.class, visit).toInstant());
        });
        // Never moved by its visitor: when it was booked.
        assertThat(screen.today().get(0).placedAt()).isEqualTo(jdbc.queryForObject(
                "SELECT created_at FROM lead.visits WHERE id = ?", java.sql.Timestamp.class, staying).toInstant());

        // Moved on the day it was due: the enquiry's card says "Visit rescheduled" for it, and not for the other.
        assertThat(visits.bookedVisits(owner, property))
                .filteredOn(booked -> booked.visitId().equals(visit)).singleElement()
                .satisfies(booked -> assertThat(booked.rescheduled()).isTrue());
        assertThat(visits.bookedVisits(owner, property))
                .filteredOn(booked -> booked.visitId().equals(staying)).singleElement()
                .satisfies(booked -> assertThat(booked.rescheduled()).isFalse());
    }

    // ---- The pass and checking in ------------------------------------------

    /** The pass is still theirs to show once their slot has ended, until the day is over (user, 2026-10-04). */
    @Test
    void thePassStaysForTheRestOfTheDay() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);

        itIs(15, 0);
        VisitPassResponse pass = visitDay.pass(prospect, visit);
        assertThat(pass.token()).isNotBlank();
        assertThat(pass.validUntil()).isEqualTo(today.plusDays(1).atStartOfDay(IST).toInstant());
    }

    /**
     * The pass opens an hour before the slot, for the visitor only. Anyone
     * managing the property checks them in with it, by QR or by its code, once
     * the slot has started.
     */
    @Test
    void aPassOpensAnHourBeforeAndAnyManagerChecksThemIn() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, FOUR);

        itIs(14, 30);
        assertThatThrownBy(() -> visitDay.pass(prospect, visit))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("3:00 pm");

        itIs(15, 10);
        VisitPassResponse pass = visitDay.pass(prospect, visit);
        assertThat(pass.token()).isNotBlank();
        assertThat(pass.code()).matches("\\d{6}");
        assertThat(visitDay.pass(prospect, visit).token()).as("the same pass again").isEqualTo(pass.token());
        assertThatThrownBy(() -> visitDay.pass(manager, visit)).isInstanceOf(ForbiddenException.class);

        // Not before the slot starts.
        assertThatThrownBy(() -> visitDay.checkIn(otherManager, visit, new CheckInVisitRequest(pass.token(), null)))
                .isInstanceOf(ValidationException.class);

        itIs(16, 10);
        assertThatThrownBy(() -> visitDay.checkIn(otherManager, visit, new CheckInVisitRequest(null, "000000")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("does not match");
        assertThatThrownBy(() -> visitDay.checkIn(prospect, visit, new CheckInVisitRequest(pass.token(), null)))
                .isInstanceOf(ForbiddenException.class);

        // Manager B is not the enquiry's handler. Whoever is at the door checks them in.
        VisitCardResponse checkedIn = visitDay.checkIn(otherManager, visit, new CheckInVisitRequest(pass.token(), null));
        assertThat(checkedIn.state()).isEqualTo(VisitCardState.VISITED);
        assertThat(checkedIn.checkInMethod()).isEqualTo(VisitCheckInMethod.QR);
        assertThat(checkedIn.checkedInByName()).isEqualTo("Manager B");
        // Their id too, so the card can read "Visit handled by you" to them.
        assertThat(checkedIn.checkedInByUserId()).isEqualTo(otherManager);
        assertThat(checkedIn.late()).isFalse();
        assertThat(checkedIn.viewerFillsForm()).isTrue();
        // The visitor's own card says who received them, and whether they were on time.
        assertThat(visitDay.myVisits(prospect)).singleElement().satisfies(mine -> {
            assertThat(mine.state()).isEqualTo(VisitCardState.VISITED);
            assertThat(mine.checkedInByName()).isEqualTo("Manager B");
            assertThat(mine.checkInMethod()).isEqualTo(VisitCheckInMethod.QR);
            assertThat(mine.late()).isFalse();
        });
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM lead.lead_activities WHERE type = 'VISIT_ATTENDED' AND lead_id ="
                        + " (SELECT lead_id FROM lead.visits WHERE id = ?)", Integer.class, visit)).isEqualTo(1);

        assertThatThrownBy(() -> visitDay.checkIn(manager, visit, new CheckInVisitRequest(null, pass.code())))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already checked in");
    }

    /** The code on the pass checks them in when the QR cannot be scanned. */
    @Test
    void theCodeOnThePassChecksThemIn() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        itIs(10, 40);
        VisitPassResponse pass = visitDay.pass(prospect, visit);

        VisitCardResponse checkedIn = visitDay.checkIn(manager, visit, new CheckInVisitRequest(null, pass.code()));

        assertThat(checkedIn.checkInMethod()).isEqualTo(VisitCheckInMethod.CODE);
        // Past half the slot: late.
        assertThat(checkedIn.late()).isTrue();
    }

    /** Whoever checked them in fills the visit form, or the owner. Nobody else. */
    @Test
    void whoeverCheckedThemInFillsTheVisitForm() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, FOUR);
        itIs(16, 10);
        visitDay.checkIn(otherManager, visit, new CheckInVisitRequest(visitDay.pass(prospect, visit).token(), null));
        VisitFormRequest form = new VisitFormRequest(LocalTime.of(16, 50), 2, VisitImpression.LIKED);

        // The enquiry's handler did not receive them.
        assertThatThrownBy(() -> visitDay.completeForm(manager, visit, form))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Manager B");
        assertThat(cardFor(manager, visit).viewerFillsForm()).isFalse();

        VisitCardResponse done = visitDay.completeForm(otherManager, visit, form);
        assertThat(done.formCompleted()).isTrue();
        assertThat(done.partySize()).isEqualTo(2);
        assertThat(done.impression()).isEqualTo(VisitImpression.LIKED);
        assertThat(done.departedAt()).isEqualTo(LocalTime.of(16, 50));

        // The owner may correct it.
        assertThat(visitDay.completeForm(owner, visit,
                new VisitFormRequest(LocalTime.of(16, 55), 3, VisitImpression.OKAY)).partySize()).isEqualTo(3);
    }

    /**
     * The visit form is optional (user, 2026-10-04). Left unfilled, the visit
     * takes its slot's end as the time they left, once the day is over.
     */
    @Test
    void anUnfilledVisitFormTakesTheSlotsEndAsTheTimeTheyLeft() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        itIs(10, 10);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospect, visit).token(), null));

        // Still its own day: nothing is assumed yet.
        assertThat(sweep.closeDepartures()).isZero();

        jdbc.update("UPDATE lead.visits SET visit_date = ? WHERE id = ?", java.sql.Date.valueOf(today.minusDays(1)), visit);
        assertThat(sweep.closeDepartures()).isEqualTo(1);
        assertThat(sweep.closeDepartures()).as("once").isZero();
        assertThat(jdbc.queryForObject(
                "SELECT departed_minute FROM lead.visits WHERE id = ?", Integer.class, visit)).isEqualTo(11 * 60);
        assertThat(jdbc.queryForObject(
                "SELECT form_completed_at FROM lead.visits WHERE id = ?", java.sql.Timestamp.class, visit)).isNull();
    }

    /** Saved with only what is known: how many came and what they made of it may be left out. */
    @Test
    void theVisitFormIsSavedWithOnlyWhatIsKnown() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, FOUR);
        itIs(16, 10);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospect, visit).token(), null));

        VisitCardResponse saved = visitDay.completeForm(
                manager, visit, new VisitFormRequest(LocalTime.of(16, 50), null, null));

        assertThat(saved.formCompleted()).isTrue();
        assertThat(saved.departedAt()).isEqualTo(LocalTime.of(16, 50));
        assertThat(saved.partySize()).isNull();
        assertThat(saved.impression()).isNull();
    }

    /**
     * After the slot, a visitor nobody scanned is the owner's alone to mark,
     * before midnight. One who turns up late with their pass is still checked
     * in at the door by anyone managing the property (user, 2026-10-04).
     */
    @Test
    void afterTheSlotOnlyTheOwnerMarksAMissedCheckInAndTheDoorStillScansAPass() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        itIs(12, 0);

        // Without their pass, nobody but the owner marks it.
        assertThatThrownBy(() -> visitDay.checkIn(manager, visit, new CheckInVisitRequest(null, "123456")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("does not match");
        assertThatThrownBy(() -> visitDay.missedCheckIn(manager, visit))
                .isInstanceOf(ForbiddenException.class);

        VisitCardResponse marked = visitDay.missedCheckIn(owner, visit);
        assertThat(marked.state()).isEqualTo(VisitCardState.VISITED);
        assertThat(marked.checkInMethod()).isEqualTo(VisitCheckInMethod.OWNER);
        assertThat(marked.late()).isNull();

        // Someone else turns up an hour after their slot, pass in hand.
        UUID latecomer = prospects.get(1);
        UUID lateVisit = visitOn(latecomer, today, TEN);
        VisitCardResponse scanned = visitDay.checkIn(
                manager, lateVisit, new CheckInVisitRequest(visitDay.pass(latecomer, lateVisit).token(), null));
        assertThat(scanned.state()).isEqualTo(VisitCardState.VISITED);
        assertThat(scanned.checkInMethod()).isEqualTo(VisitCheckInMethod.QR);
        assertThat(scanned.late()).isTrue();
    }

    // ---- No visit ----------------------------------------------------------

    /**
     * Not checked in by midnight: No visit. The visitor has a week to say they
     * are still interested by moving it. Past the week, the enquiry expires.
     */
    @Test
    void anUncheckedVisitBecomesNoVisitAndTheEnquiryExpiresAfterAWeek() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today.minusDays(1), TEN);
        itIs(0, 10);

        assertThat(sweep.markNoVisits()).isEqualTo(1);
        assertThat(sweep.markNoVisits()).as("once").isZero();
        assertThat(status(visit)).isEqualTo("NOT_VISITED");

        MyEnquiryItemResponse mine = enquiryService.myEnquiries(prospect).get(0);
        assertThat(mine.visit().state()).hasToString("MISSED");
        assertThat(mine.visit().answerBy())
                .isBetween(Instant.now().plus(Duration.ofDays(6)), Instant.now().plus(Duration.ofDays(8)));

        assertThat(sweep.expireUnansweredNoVisits()).isZero();
        jdbc.update("UPDATE lead.visits SET no_visit_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minus(Duration.ofDays(7)).minusSeconds(60)), visit);
        assertThat(sweep.expireUnansweredNoVisits()).isEqualTo(1);

        assertThat(enquiryService.myEnquiries(prospect).get(0).state()).isEqualTo(MyEnquiryState.EXPIRED);
        assertThat(endReasonOf(visit)).isEqualTo("VISIT_MISSED");
        assertThat(leadCloseReasonOf(visit)).isEqualTo("NO_ANSWER_AFTER_MISSED_VISIT");
        // Its enquiry is over, so it is off the Missed tab.
        assertThat(visitDay.propertyVisits(owner, property).missed()).isEmpty();
        assertThat(sweep.expireUnansweredNoVisits()).as("once").isZero();
    }

    /** "Are you still interested?" answered No: the enquiry expires at once. Only the visitor answers. */
    @Test
    void sayingNoToStillInterestedExpiresTheEnquiryAtOnce() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today.minusDays(1), TEN);
        sweep.markNoVisits();

        assertThatThrownBy(() -> visitDay.notInterested(manager, visit)).isInstanceOf(ForbiddenException.class);

        visitDay.notInterested(prospect, visit);

        assertThat(enquiryService.myEnquiries(prospect).get(0).state()).isEqualTo(MyEnquiryState.EXPIRED);
        assertThat(endReasonOf(visit)).isEqualTo("VISIT_MISSED");
        assertThat(leadCloseReasonOf(visit)).isEqualTo("NO_ANSWER_AFTER_MISSED_VISIT");
    }

    /** A No visit is the visitor's to move, on the missed count. The property can no longer touch it. */
    @Test
    void onlyTheVisitorMovesANoVisit() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today.minusDays(1), TEN);
        sweep.markNoVisits();

        assertThatThrownBy(() -> visits.reschedule(manager, visit, new RescheduleVisitRequest(tomorrow, TEN, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Only the visitor");
        assertThatThrownBy(() -> visits.cancel(owner, visit, new CancelVisitRequest(true, "No longer needed")))
                .isInstanceOf(ValidationException.class);

        VisitResponse moved = visits.reschedule(prospect, visit, new RescheduleVisitRequest(tomorrow, TEN, null));

        assertThat(moved.upcoming()).isTrue();
        assertThat(status(visit)).isEqualTo("SCHEDULED");
        assertThat(jdbc.queryForObject(
                "SELECT tenant_missed_reschedules FROM lead.visits WHERE id = ?", Integer.class, visit)).isEqualTo(1);
        assertThat(visitDay.propertyVisits(manager, property).missed()).isEmpty();
    }

    // ---- Notifications ------------------------------------------------------

    /**
     * The visitor is reminded at 10 am the day before, told they can still
     * reschedule today, and again two hours before their slot, told they can
     * change slots (user, 2026-10-04). Once each.
     */
    @Test
    void theVisitorIsRemindedTheDayBeforeAndBeforeTheirSlot() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, tomorrow, FOUR);
        reset(notifications);

        itIs(9, 55);
        notices.sendDue();
        verify(notifications, never()).notifyUser(
                eq(prospect), any(), any(), any(), any(), any(), any(), any(), any(), any());

        itIs(10, 5);
        notices.sendDue();
        notices.sendDue();
        verify(notifications, times(1)).notifyUser(
                eq(prospect), eq("Visit tomorrow"), contains("reschedule it until the end of today"), any(), any(),
                eq(NotificationSubtype.VISIT_REMINDER_DAY_BEFORE), eq(visit), any(), any(),
                eq(NotificationAudience.TENANT));

        // The day comes: two hours before the slot, not earlier.
        jdbc.update("UPDATE lead.visits SET visit_date = ? WHERE id = ?", java.sql.Date.valueOf(today), visit);
        reset(notifications);
        itIs(13, 55);
        notices.sendDue();
        verify(notifications, never()).notifyUser(
                eq(prospect), any(), any(), any(), any(), any(), any(), any(), any(), any());

        itIs(14, 5);
        notices.sendDue();
        notices.sendDue();
        verify(notifications, times(1)).notifyUser(
                eq(prospect), eq("Visit today"), contains("change to another slot"), any(), any(),
                eq(NotificationSubtype.VISIT_REMINDER_TODAY), eq(visit), any(), any(),
                eq(NotificationAudience.TENANT));
    }

    /**
     * The owner and every manager are told at 7 am how many people are coming
     * today, and 15 minutes before each slot how many are coming in it, with
     * the reminder to mark their attendance. Once each.
     */
    @Test
    void thePropertyIsToldWhoIsComingTodayAndBeforeEachSlot() {
        visitOn(prospects.get(0), today, TEN);
        visitOn(prospects.get(1), today, TEN);
        visitOn(prospects.get(2), today, FOUR);
        reset(notifications);

        itIs(6, 55);
        notices.sendDue();
        verify(notifications, never()).notifyUser(
                eq(owner), any(), any(), any(), any(), any(), any(), any(), any(), any());

        itIs(7, 5);
        notices.sendDue();
        notices.sendDue();
        for (UUID recipient : List.of(owner, manager, otherManager)) {
            verify(notifications, times(1)).notifyUser(
                    eq(recipient), eq("Visitors today"), contains("3 people are visiting"), any(), any(),
                    eq(NotificationSubtype.VISITORS_TODAY), eq(property), any(), any(),
                    eq(NotificationAudience.MANAGEMENT));
        }

        reset(notifications);
        itIs(9, 40);
        notices.sendDue();
        verify(notifications, never()).notifyUser(
                eq(owner), any(), any(), any(), any(), any(), any(), any(), any(), any());

        itIs(9, 46);
        notices.sendDue();
        notices.sendDue();
        for (UUID recipient : List.of(owner, manager, otherManager)) {
            verify(notifications, times(1)).notifyUser(
                    eq(recipient), eq("Visitors arriving"), contains("2 people are visiting"), any(), any(),
                    eq(NotificationSubtype.VISIT_SLOT_STARTING), eq(property), any(), any(),
                    eq(NotificationAudience.MANAGEMENT));
        }

        reset(notifications);
        itIs(15, 50);
        notices.sendDue();
        verify(notifications, times(1)).notifyUser(
                eq(owner), eq("Visitors arriving"), contains("1 person is visiting"), any(), any(),
                eq(NotificationSubtype.VISIT_SLOT_STARTING), eq(property), any(), any(),
                eq(NotificationAudience.MANAGEMENT));
    }

    /**
     * "I'm on my way", past half the slot: the property is told, once. Only
     * the visitor says it, and not before they are late.
     */
    @Test
    void aVisitorSaysTheyAreRunningLateAndThePropertyIsToldOnce() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        reset(notifications);

        itIs(10, 20);
        assertThatThrownBy(() -> visitDay.runningLate(prospect, visit)).isInstanceOf(ValidationException.class);
        itIs(10, 40);
        assertThatThrownBy(() -> visitDay.runningLate(manager, visit)).isInstanceOf(ForbiddenException.class);

        visitDay.runningLate(prospect, visit);
        visitDay.runningLate(prospect, visit);

        for (UUID recipient : List.of(owner, manager, otherManager)) {
            verify(notifications, times(1)).notifyUser(
                    eq(recipient), eq("Visitor running late"), contains("is running late"), any(), any(),
                    eq(NotificationSubtype.VISITOR_RUNNING_LATE), eq(visit), any(), any(),
                    eq(NotificationAudience.MANAGEMENT));
        }
        assertThat(visitDay.myVisits(prospect).get(0).runningLateAt()).isNotNull();
        assertThat(cardFor(owner, visit).runningLateAt()).isNotNull();
    }

    /**
     * A check-in is told to everyone (user, 2026-10-04): the visitor, the
     * owner and every manager, in the app and by push. The visitor reads
     * "your visit", the property reads who it was and who checked them in.
     */
    @Test
    void everyoneIsToldWhenAVisitorIsCheckedIn() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, FOUR);
        itIs(16, 10);
        String token = visitDay.pass(prospect, visit).token();
        reset(notifications);

        visitDay.checkIn(otherManager, visit, new CheckInVisitRequest(token, null));

        verify(notifications, times(1)).notifyUser(
                eq(prospect), eq("Visit checked in"), contains("was checked in at 4:10 pm"), any(), any(),
                eq(NotificationSubtype.VISIT_CHECKED_IN), eq(visit), any(),
                eq(NotificationDeliveryMode.IN_APP_AND_PUSH), eq(NotificationAudience.TENANT));
        for (UUID recipient : List.of(owner, manager, otherManager)) {
            verify(notifications, times(1)).notifyUser(
                    eq(recipient), eq("Visitor checked in"), contains("was checked in at 4:10 pm by Manager B"),
                    any(), any(), eq(NotificationSubtype.VISIT_CHECKED_IN), eq(visit), any(),
                    eq(NotificationDeliveryMode.IN_APP_AND_PUSH), eq(NotificationAudience.MANAGEMENT));
        }
    }

    /** The owner's missed check-in is told too, as marked attended: nobody saw them arrive. */
    @Test
    void aMissedCheckInIsToldAsMarkedAttended() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        itIs(12, 0);
        reset(notifications);

        visitDay.missedCheckIn(owner, visit);

        verify(notifications, times(1)).notifyUser(
                eq(prospect), eq("Visit checked in"), contains("was marked as attended"), any(), any(),
                eq(NotificationSubtype.VISIT_CHECKED_IN), eq(visit), any(), any(), eq(NotificationAudience.TENANT));
        verify(notifications, times(1)).notifyUser(
                eq(manager), eq("Visitor checked in"), contains("was marked as attended by the owner"), any(), any(),
                eq(NotificationSubtype.VISIT_CHECKED_IN), eq(visit), any(), any(), eq(NotificationAudience.MANAGEMENT));
    }

    /**
     * When a slot ends, the property is told whose attendance was not marked,
     * leaving out anyone who said they were running late. The owner is told to
     * mark a missed check-in, the managers to tell the owner. Once.
     */
    @Test
    void afterASlotThePropertyIsToldWhoseAttendanceWasNotMarked() {
        UUID late = visitOn(prospects.get(0), today, TEN);
        visitOn(prospects.get(1), today, TEN);
        UUID attended = visitOn(prospects.get(2), today, TEN);
        itIs(10, 10);
        visitDay.checkIn(manager, attended, new CheckInVisitRequest(visitDay.pass(prospects.get(2), attended).token(), null));
        itIs(10, 40);
        visitDay.runningLate(prospects.get(0), late);
        reset(notifications);

        // The slot is still on.
        itIs(10, 59);
        notices.sendDue();
        verify(notifications, never()).notifyUser(
                any(), eq("Attendance not marked"), any(), any(), any(), any(), any(), any(), any(), any());

        itIs(11, 5);
        notices.sendDue();
        notices.sendDue();
        verify(notifications, times(1)).notifyUser(
                eq(owner), eq("Attendance not marked"), contains("mark a missed check-in"), any(), any(),
                eq(NotificationSubtype.VISIT_ATTENDANCE_NOT_MARKED), eq(property), any(), any(),
                eq(NotificationAudience.MANAGEMENT));
        for (UUID recipient : List.of(manager, otherManager)) {
            verify(notifications, times(1)).notifyUser(
                    eq(recipient), eq("Attendance not marked"), contains("tell the owner now"), any(), any(),
                    eq(NotificationSubtype.VISIT_ATTENDANCE_NOT_MARKED), eq(property), any(), any(),
                    eq(NotificationAudience.MANAGEMENT));
        }
        // One visitor: the one checked in and the one running late are left out.
        verify(notifications).notifyUser(
                eq(owner), any(), contains("1 visitor"), any(), any(),
                eq(NotificationSubtype.VISIT_ATTENDANCE_NOT_MARKED), any(), any(), any(), any());
    }

    // ---- Who may move it, and when -----------------------------------------

    /** The property moves or cancels a visit until two hours before its slot. After that only the visitor can. */
    @Test
    void thePropertyChangesAVisitOnlyUntilTwoHoursBeforeItsSlot() {
        UUID early = visitOn(prospects.get(0), today, FOUR);
        itIs(13, 30);
        assertThat(visits.reschedule(manager, early, new RescheduleVisitRequest(tomorrow, FOUR, null)).date())
                .isEqualTo(tomorrow);

        UUID late = visitOn(prospects.get(1), today, FOUR);
        itIs(14, 30);
        assertThatThrownBy(() -> visits.reschedule(manager, late, new RescheduleVisitRequest(tomorrow, TEN, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("two hours");
        assertThatThrownBy(() -> visits.cancel(owner, late, new CancelVisitRequest(true, "Nobody is free")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("two hours");
        VisitResponse forManager = visits.chatActions(manager, enquiryOf(late)).visit();
        assertThat(forManager.canReschedule()).isFalse();
        assertThat(forManager.canCancel()).isFalse();

        // The visitor still may.
        assertThat(visits.cancel(prospects.get(1), late, new CancelVisitRequest(true, "Something came up")).status())
                .hasToString("CANCELLED");
    }

    /**
     * On the day the visitor changes to another slot that day for free. Their
     * slot having started does not stop them moving it (user, 2026-10-04).
     */
    @Test
    void onTheDayTheVisitorChangesSlotForFreeAndStillMovesOnceTheirsHasStarted() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, FOUR);
        itIs(15, 0);

        VisitMoveOptionsResponse options = visits.moveOptions(prospect, visit);
        assertThat(options.window()).isEqualTo(VisitWindow.DAY_BEFORE_SLOT);
        assertThat(options.todayIsFree()).isTrue();
        // The morning slot is over, and theirs is the afternoon one: nothing left today.
        assertThat(options.days()).noneMatch(day -> day.date().equals(today));

        UUID morning = visitOn(prospects.get(1), today, TEN);
        itIs(9, 0);
        assertThat(visits.moveOptions(prospects.get(1), morning).days().get(0).date()).isEqualTo(today);
        visits.reschedule(prospects.get(1), morning, new RescheduleVisitRequest(today, FOUR, null));
        assertThat(jdbc.queryForObject(
                "SELECT tenant_reschedules FROM lead.visits WHERE id = ?", Integer.class, morning)).isZero();

        // Their slot has started. It is still theirs to move: another day, as one of their two.
        itIs(16, 10);
        VisitMoveOptionsResponse started = visits.moveOptions(prospect, visit);
        assertThat(started.window()).isEqualTo(VisitWindow.IN_SLOT);
        assertThat(started.refusal()).isNull();
        assertThat(started.anotherDayRefusal()).isNull();
        visits.reschedule(prospect, visit, new RescheduleVisitRequest(tomorrow, TEN, null));
        assertThat(jdbc.queryForObject(
                "SELECT tenant_reschedules FROM lead.visits WHERE id = ?", Integer.class, visit)).isEqualTo(1);
    }

    /**
     * Running late: past half the slot with nobody checking them in. A later
     * slot today is free. Another day is theirs to pick as well, a later slot
     * being free or not (user, 2026-10-04), and that one is a missed move.
     */
    @Test
    void runningLateMovesToALaterSlotTodayForFreeOrToAnotherDayAsAMissedMove() {
        UUID morning = visitOn(prospects.get(0), today, TEN);
        itIs(10, 40);
        VisitMoveOptionsResponse options = visits.moveOptions(prospects.get(0), morning);
        assertThat(options.window()).isEqualTo(VisitWindow.RUNNING_LATE);
        // Today's later slot first, and the days after it.
        assertThat(options.days().get(0).date()).isEqualTo(today);
        assertThat(options.days()).anyMatch(day -> day.date().isAfter(today));
        assertThat(options.anotherDayRefusal()).isNull();
        visits.reschedule(prospects.get(0), morning, new RescheduleVisitRequest(today, FOUR, null));
        assertThat(jdbc.queryForObject(
                "SELECT tenant_missed_reschedules FROM lead.visits WHERE id = ?", Integer.class, morning)).isZero();

        // Another day, with the afternoon slot still free today: it counts.
        UUID other = visitOn(prospects.get(1), today, TEN);
        visits.reschedule(prospects.get(1), other, new RescheduleVisitRequest(tomorrow, TEN, null));
        assertThat(jdbc.queryForObject(
                "SELECT tenant_missed_reschedules FROM lead.visits WHERE id = ?", Integer.class, other))
                .isEqualTo(1);

        // Both missed moves used: another day is refused in words, a later slot today is not.
        UUID spent = visitOn(prospects.get(2), today, TEN);
        jdbc.update("UPDATE lead.visits SET tenant_missed_reschedules = 2 WHERE id = ?", spent);
        VisitMoveOptionsResponse none = visits.moveOptions(prospects.get(2), spent);
        assertThat(none.refusal()).isNull();
        assertThat(none.anotherDayRefusal()).contains("twice");
        assertThat(none.days()).singleElement().satisfies(day -> assertThat(day.date()).isEqualTo(today));

        // The first visitor is in the afternoon slot now, the day's last: only another day is left.
        itIs(16, 40);
        assertThat(visits.moveOptions(prospects.get(0), morning).days())
                .isNotEmpty()
                .noneMatch(day -> day.date().equals(today));
    }

    // ---- Post-visit booking eligibility -----------------------------------

    @Test
    void recordedCheckInOpensThirtyDaysAndUpdatesBothEnquiryCards() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        UUID enquiry = enquiryOf(visit);
        Instant oldExpiry = jdbc.queryForObject("SELECT expires_at FROM enquiry.enquiries WHERE id = ?",
                Timestamp.class, enquiry).toInstant();
        itIs(10, 5);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospect, visit).token(), null));

        PostVisitBookingEligibility eligible = enquiries.bookingEligibilityFor(prospect, enquiry);
        assertThat(eligible.eligible()).isTrue();
        assertThat(eligible.visitId()).isEqualTo(visit);
        assertThat(eligible.visitedOn()).isEqualTo(today);
        assertThat(eligible.windowExpiresAt()).isEqualTo(PostVisitBookingWindow.expiresAt(today));
        assertThat(jdbc.queryForObject("SELECT pre_visit_expires_at FROM enquiry.enquiries WHERE id = ?",
                Timestamp.class, enquiry).toInstant()).isEqualTo(oldExpiry);
        assertThat(enquiryService.myEnquiries(prospect).get(0).bookingEligibility().eligible()).isTrue();
        assertThat(enquiryService.listForProperty(manager, property)).singleElement()
                .satisfies(card -> assertThat(card.bookingEligibility().eligible()).isTrue());
    }

    /** Coming to the visit is what makes an early lead an advanced one (user, 2026-10-11). */
    @Test
    void aCheckInMakesTheEarlyLeadAnAdvancedLead() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        String stageOfItsLead = "SELECT stage FROM lead.leads WHERE id = (SELECT lead_id FROM lead.visits WHERE id = ?)";
        assertThat(jdbc.queryForObject(stageOfItsLead, String.class, visit)).isEqualTo("EARLY_LEAD");

        itIs(10, 5);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospect, visit).token(), null));
        // Nothing tells the lead but the window the check-in opened on its enquiry.
        PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);

        assertThat(jdbc.queryForObject(stageOfItsLead, String.class, visit)).isEqualTo("ADVANCED_LEAD");
        assertThat(jdbc.queryForObject("SELECT advanced_lead_at IS NOT NULL AND became_lead_at IS NOT NULL"
                + " FROM lead.leads WHERE id = (SELECT lead_id FROM lead.visits WHERE id = ?)",
                Boolean.class, visit)).isTrue();
    }

    @Test
    void ownersValidMissedCheckInAlsoOpensTheWindowWithoutAVisitForm() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        itIs(12, 0);
        visitDay.missedCheckIn(owner, visit);
        assertThat(enquiries.bookingEligibilityFor(prospect, enquiryOf(visit)).eligible()).isTrue();
        assertThat(jdbc.queryForObject("SELECT form_completed_at FROM lead.visits WHERE id = ?",
                Timestamp.class, visit)).isNull();
    }

    @Test
    void scheduledMissedAndCancelledVisitsNeverGrantBookingEligibility() {
        UUID scheduled = visitOn(prospects.get(0), today, TEN);
        UUID missed = visitOn(prospects.get(1), today.minusDays(1), TEN);
        UUID cancelled = visitOn(prospects.get(2), tomorrow, TEN);
        visits.cancel(prospects.get(2), cancelled, new CancelVisitRequest(true, "Cannot come"));
        sweep.markNoVisits();
        for (int i = 0; i < 3; i++) {
            UUID enquiry = enquiryOf(List.of(scheduled, missed, cancelled).get(i));
            assertThat(enquiries.bookingEligibilityFor(prospects.get(i), enquiry).reason())
                    .isEqualTo("ATTENDED_VISIT_REQUIRED");
            UUID visit = List.of(scheduled, missed, cancelled).get(i);
            assertThatThrownBy(() -> enquiries.visitAttended(enquiry, visit)).isInstanceOf(ValidationException.class);
        }
    }

    @Test
    void anotherPersonCannotReadEligibilityAndAnotherVisitCannotEstablishIt() {
        UUID visit = visitOn(prospects.get(0), today, TEN);
        UUID enquiry = enquiryOf(visit);
        itIs(10, 5);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospects.get(0), visit).token(), null));
        for (UUID outsider : List.of(prospects.get(1), manager, owner)) {
            assertThatThrownBy(() -> enquiries.bookingEligibilityFor(outsider, enquiry))
                    .isInstanceOf(NotFoundException.class);
        }
        assertThatThrownBy(() -> enquiries.visitAttended(enquiry, UUID.randomUUID()))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void attendanceReplayPreservesTheOriginalDateAndVersion() {
        UUID visit = visitOn(prospects.get(0), today, TEN);
        UUID enquiry = enquiryOf(visit);
        itIs(10, 5);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospects.get(0), visit).token(), null));
        Long version = jdbc.queryForObject("SELECT version FROM enquiry.enquiries WHERE id = ?", Long.class, enquiry);
        clock.set(today.plusDays(29).atTime(12, 0).atZone(IST).toInstant());
        assertThat(enquiries.visitAttended(enquiry, visit)).isFalse();
        assertThat(enquiries.bookingEligibilityFor(prospects.get(0), enquiry).windowExpiresAt())
                .isEqualTo(PostVisitBookingWindow.expiresAt(today));
        assertThat(jdbc.queryForObject("SELECT version FROM enquiry.enquiries WHERE id = ?", Long.class, enquiry))
                .isEqualTo(version);
    }

    @Test
    void thePostVisitWindowSurvivesTheOldDeadlineThenClosesAtItsOwnBoundary() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        UUID enquiry = enquiryOf(visit);
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(today.atTime(11, 0).atZone(IST).toInstant()), enquiry);
        itIs(10, 5);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospect, visit).token(), null));
        reset(chat);
        clock.set(today.plusDays(1).atTime(12, 0).atZone(IST).toInstant());
        runEnquiryExpiry();
        assertThat(enquiries.bookingEligibilityFor(prospect, enquiry).eligible()).isTrue();
        verify(chat, never()).closeEnquiryThread(enquiry);
        // A late pre-visit expiry prompt must read the extended window, not
        // close the lead from the stale deadline carried by that prompt.
        pipeline.syncFromEnquiry(enquiry, property, prospect);
        assertThat(jdbc.queryForObject("SELECT state FROM lead.leads WHERE id = "
                + "(SELECT lead_id FROM lead.visits WHERE id = ?)", String.class, visit)).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT window_closed_at FROM enquiry.enquiries WHERE id = ?",
                Timestamp.class, enquiry)).isNull();

        Instant expires = PostVisitBookingWindow.expiresAt(today);
        clock.set(expires.minusNanos(1));
        assertThat(enquiries.bookingEligibilityFor(prospect, enquiry).eligible()).isTrue();
        clock.set(expires);
        assertThat(enquiries.bookingEligibilityFor(prospect, enquiry).reason()).isEqualTo("BOOKING_WINDOW_EXPIRED");
        assertThat(enquiryService.myEnquiries(prospect).get(0).state()).isEqualTo(MyEnquiryState.EXPIRED);
        runEnquiryExpiry();
        runEnquiryExpiry();
        verify(chat, times(1)).closeEnquiryThread(enquiry);
    }

    private void runEnquiryExpiry() {
        // Exercise the real worker at each simulated date, not ShedLock's
        // real database-time minimum interval between scheduler invocations.
        EnquiryExpirySchedulerService worker = org.springframework.test.util.AopTestUtils
                .getTargetObject(enquiryExpiry);
        worker.expireStaleEnquiries();
    }

    @Test
    void attendanceOfAnAlreadyBookedVisitCanRestoreAnOldTimerClosedChat() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        UUID enquiry = enquiryOf(visit);
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(today.atTime(9, 30).atZone(IST).toInstant()), enquiry);
        itIs(10, 0);
        runEnquiryExpiry();
        reset(chat);
        itIs(10, 5);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospect, visit).token(), null));
        assertThat(enquiries.bookingEligibilityFor(prospect, enquiry).eligible()).isTrue();
        verify(chat, times(1)).reopenEnquiryThread(enquiry);
        assertThat(jdbc.queryForObject("SELECT window_closed_at FROM enquiry.enquiries WHERE id = ?",
                Timestamp.class, enquiry)).isNull();
    }

    @Test
    void negativeSentimentAndFeedbackDoNotShortenAnAttendedWindow() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        UUID enquiry = enquiryOf(visit);
        jdbc.update("UPDATE enquiry.enquiries SET sentiment = 'NOT_INTERESTED', "
                + "sentiment_set_at = ?, sentiment_set_by_user_id = ? WHERE id = ?",
                Timestamp.from(clock.instant()), owner, enquiry);
        itIs(10, 5);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospect, visit).token(), null));
        visitDay.completeForm(manager, visit, new VisitFormRequest(
                LocalTime.of(10, 30), 1, VisitImpression.DISLIKED));
        reset(chat);
        clock.set(today.plusDays(8).atTime(12, 0).atZone(IST).toInstant());
        runEnquiryExpiry();
        assertThat(enquiries.bookingEligibilityFor(prospect, enquiry).eligible()).isTrue();
        assertThat(enquiryService.myEnquiries(prospect).get(0).notInterestedClosesAt()).isNull();
        verify(chat, never()).closeEnquiryThread(enquiry);
    }

    @Test
    void aRejectedAttendanceBridgeRollsBackTheVisitAndItsActivity() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        UUID enquiry = enquiryOf(visit);
        // An inconsistent pre-existing source is refused, never silently
        // overwritten. The synchronous bridge must roll back check-in too.
        jdbc.update("UPDATE enquiry.enquiries SET booking_visit_id = ?, booking_visit_date = ?, "
                + "pre_visit_expires_at = expires_at WHERE id = ?",
                UUID.randomUUID(), java.sql.Date.valueOf(today), enquiry);
        itIs(10, 5);
        String token = visitDay.pass(prospect, visit).token();
        assertThatThrownBy(() -> visitDay.checkIn(manager, visit, new CheckInVisitRequest(token, null)))
                .isInstanceOf(ValidationException.class);
        assertThat(status(visit)).isEqualTo("SCHEDULED");
        assertThat(jdbc.queryForObject("SELECT checked_in_at FROM lead.visits WHERE id = ?",
                Timestamp.class, visit)).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM lead.lead_activities "
                + "WHERE enquiry_id = ? AND type = 'VISIT_ATTENDED'", Integer.class, enquiry)).isZero();
    }

    @Test
    void manuallyClosedEnquiriesAreNotReopenedByCheckIn() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        UUID enquiry = enquiryOf(visit);
        jdbc.update("UPDATE enquiry.enquiries SET ended_at = now(), ended_by_user_id = ?, end_reason = 'NOT_INTERESTED' WHERE id = ?",
                owner, enquiry);
        itIs(10, 5);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospect, visit).token(), null));
        assertThat(enquiries.bookingEligibilityFor(prospect, enquiry).reason()).isEqualTo("ENQUIRY_CLOSED");
        assertThat(jdbc.queryForObject("SELECT booking_visit_id FROM enquiry.enquiries WHERE id = ?", UUID.class, enquiry))
                .isNull();
    }

    @Test
    void tenantCancellationClosureSurvivesAttendanceReplayAndIsScopedToItsSource() {
        UUID prospect = prospects.get(0);
        UUID visit = visitOn(prospect, today, TEN);
        UUID enquiry = enquiryOf(visit);
        itIs(10, 5);
        visitDay.checkIn(manager, visit, new CheckInVisitRequest(visitDay.pass(prospect, visit).token(), null));
        assertThatThrownBy(() -> enquiries.closeBookingWindowForTenantCancellation(enquiry, prospects.get(1), visit))
                .isInstanceOf(ValidationException.class);
        assertThat(enquiries.closeBookingWindowForTenantCancellation(enquiry, prospect, visit)).isTrue();
        assertThat(enquiries.closeBookingWindowForTenantCancellation(enquiry, prospect, visit)).isFalse();
        assertThat(enquiries.visitAttended(enquiry, visit)).isFalse();
        assertThat(enquiries.bookingEligibilityFor(prospect, enquiry).reason()).isEqualTo("BOOKING_WINDOW_CLOSED");
    }

    @Test
    void migrationBackfillsOnlyExistingOpenAttendanceAndRetainsOldDeadline() throws Exception {
        String schema = "booking_window_test_" + UUID.randomUUID().toString().replace("-", "");
        if (!schema.matches("booking_window_test_[a-f0-9]{32}")) {
            throw new IllegalStateException("Invalid isolated upgrade schema");
        }
        jdbc.execute("CREATE SCHEMA " + schema);
        try {
            jdbc.execute("CREATE TABLE " + schema + ".enquiries (id UUID PRIMARY KEY, property_id UUID NOT NULL, "
                    + "enquirer_user_id UUID NOT NULL, status VARCHAR(20) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, "
                    + "ended_at TIMESTAMPTZ, replaced_at TIMESTAMPTZ, chat_closed_at TIMESTAMPTZ, "
                    + "window_closed_at TIMESTAMPTZ, end_reason VARCHAR(30), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
                    + "version BIGINT NOT NULL DEFAULT 0)");
            jdbc.execute("CREATE TABLE " + schema + ".visits (id UUID PRIMARY KEY, enquiry_id UUID, "
                    + "property_id UUID NOT NULL, prospect_user_id UUID NOT NULL, status VARCHAR(20) NOT NULL, "
                    + "visit_date DATE NOT NULL, checked_in_at TIMESTAMPTZ)");
            List<UUID> fixtures = new java.util.ArrayList<>();
            Instant actualNow = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
            LocalDate actualToday = actualNow.atZone(IST).toLocalDate();
            Instant originalExpiry = actualNow.plus(Duration.ofDays(10));
            for (int kind = 0; kind < 11; kind++) {
                UUID enquiry = UUID.randomUUID();
                fixtures.add(enquiry);
                jdbc.update("INSERT INTO " + schema + ".enquiries "
                                + "(id, property_id, enquirer_user_id, status, expires_at, ended_at, replaced_at, chat_closed_at) "
                                + "VALUES (?, ?, ?, 'RESPONDED', ?, ?, ?, ?)",
                        enquiry, property, prospects.get(0),
                        Timestamp.from(kind == 1 ? actualNow.minusSeconds(1) : originalExpiry),
                        kind == 2 ? Timestamp.from(actualNow) : null,
                        kind == 3 ? Timestamp.from(actualNow) : null,
                        kind == 8 ? Timestamp.from(actualNow) : null);
                LocalDate date = kind == 7 ? actualToday.minusDays(31)
                        : kind == 9 ? actualToday.plusDays(1) : actualToday.minusDays(5);
                jdbc.update("INSERT INTO " + schema + ".visits "
                                + "(id, enquiry_id, property_id, prospect_user_id, status, visit_date, checked_in_at) "
                                + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                        UUID.randomUUID(), enquiry, kind == 10 ? UUID.randomUUID() : property,
                        kind == 6 ? prospects.get(1) : prospects.get(0),
                        kind == 4 ? "SCHEDULED" : "VISITED", java.sql.Date.valueOf(date),
                        kind == 4 || kind == 5 ? null : Timestamp.from(actualNow.minus(Duration.ofDays(5))));
            }
            // Execute the exact immutable migration against old-shape fixture tables
            // in this test-owned schema. Fresh application boot checks the real schema.
            String migration;
            try (var input = new org.springframework.core.io.ClassPathResource(
                    "db/migration/enquiry/V6206__post_visit_booking_window.sql").getInputStream()) {
                migration = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            }
            jdbc.execute(migration.replace("enquiry.enquiries", schema + ".enquiries")
                    .replace("lead.visits", schema + ".visits"));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
                    + ".enquiries WHERE booking_visit_id IS NOT NULL", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT pre_visit_expires_at FROM " + schema + ".enquiries WHERE id = ?",
                    Timestamp.class, fixtures.get(0)).toInstant()).isEqualTo(Timestamp.from(originalExpiry).toInstant());
            assertThat(jdbc.queryForObject("SELECT expires_at FROM " + schema + ".enquiries WHERE id = ?",
                    Timestamp.class, fixtures.get(0)).toInstant())
                    .isEqualTo(PostVisitBookingWindow.expiresAt(actualToday.minusDays(5)));
            assertThat(jdbc.queryForObject("SELECT version FROM " + schema + ".enquiries WHERE id = ?",
                    Long.class, fixtures.get(0))).isEqualTo(1L);
        } finally {
            // Only the validated UUID-named fixture schema in the throwaway database.
            jdbc.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }

    // ---- Helpers -----------------------------------------------------------

    /** The clock reads this time today, in India. */
    private void itIs(int hour, int minute) {
        clock.set(today.atTime(hour, minute).atZone(IST).toInstant());
    }

    /** An answered enquiry with a visit on that date, booked for tomorrow and then put where the test wants it. */
    private UUID visitOn(UUID prospect, LocalDate date, LocalTime slotStart) {
        consentService.replace(prospect,
                new UpdateEnquiryChannelConsentsRequest(Set.of(EnquiryResponseChannel.CALL_BACK), true));
        UUID enquiry = enquiryService.raise(prospect, property, new RaiseEnquiryRequest("Is a single room free?"))
                .enquiryId();
        enquiryService.respond(manager, enquiry, new RespondToEnquiryRequest(EnquiryResponseChannel.CHAT, null));
        enquiryService.onChatMessage(message(enquiry, manager));
        enquiryService.onChatMessage(message(enquiry, prospect));
        UUID visit = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, slotStart)).visit().id();
        jdbc.update("UPDATE lead.visits SET visit_date = ? WHERE id = ?", java.sql.Date.valueOf(date), visit);
        return visit;
    }

    private ChatMessageSentEvent message(UUID enquiry, UUID sender) {
        return new ChatMessageSentEvent(thread, property, ChatThreadOrigin.ENQUIRY, enquiry, sender, Instant.now());
    }

    private VisitCardResponse cardFor(UUID viewer, UUID visit) {
        return visitDay.propertyVisits(viewer, property).today().stream()
                .filter(card -> card.visitId().equals(visit))
                .findFirst()
                .orElseThrow();
    }

    private UUID enquiryOf(UUID visit) {
        return jdbc.queryForObject("SELECT enquiry_id FROM lead.visits WHERE id = ?", UUID.class, visit);
    }

    private String status(UUID visit) {
        return jdbc.queryForObject("SELECT status FROM lead.visits WHERE id = ?", String.class, visit);
    }

    private String endReasonOf(UUID visit) {
        return jdbc.queryForObject("SELECT end_reason FROM enquiry.enquiries WHERE id = ?", String.class, enquiryOf(visit));
    }

    private String leadCloseReasonOf(UUID visit) {
        return jdbc.queryForObject(
                "SELECT close_reason FROM lead.leads WHERE id = (SELECT lead_id FROM lead.visits WHERE id = ?)",
                String.class, visit);
    }

    private UUID manager(String name) {
        UUID id = UUID.randomUUID();
        String phone = "+9196" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
        jdbc.update("""
                INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified,
                    credential_version, gender, date_of_birth, created_at, updated_at)
                VALUES (?, ?, ?, 'USER', true, true, 0, 'MALE', DATE '1990-01-01', now(), now())
                """, id, phone, name);
        jdbc.update("""
                INSERT INTO property.property_managers (id, property_id, manager_user_id, assigned_by_user_id,
                    is_active, reference_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, true, ?, now(), now())
                """, UUID.randomUUID(), property, id, owner, "MGR-V-" + id.toString().substring(0, 12));
        return id;
    }

    /**
     * Someone with an account who does not stay at the property: no visit is
     * booked for a tenant of the place (user, 2026-10-17), and the seeded
     * users all stay there.
     */
    private UUID visitor(String name) {
        UUID id = UUID.randomUUID();
        String phone = "+9194" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
        jdbc.update("""
                INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified,
                    credential_version, gender, date_of_birth, created_at, updated_at)
                VALUES (?, ?, ?, 'USER', true, true, 0, 'FEMALE', DATE '1999-01-01', now(), now())
                """, id, phone, name);
        return id;
    }
}
