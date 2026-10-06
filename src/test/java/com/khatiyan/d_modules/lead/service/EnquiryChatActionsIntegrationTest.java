package com.khatiyan.d_modules.lead.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.analytics.LargePropertySeeder;
import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.chat.ChatModule;
import com.khatiyan.d_modules.chat.event.ChatMessageSentEvent;
import com.khatiyan.d_modules.chat.model.ChatThreadOrigin;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryDetailResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryEndingKind;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryEndingView;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryParty;
import com.khatiyan.d_modules.enquiry.api.dto.MyEnquiryItemResponse;
import com.khatiyan.d_modules.enquiry.api.dto.MyEnquiryState;
import com.khatiyan.d_modules.enquiry.api.dto.RaiseEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.RespondToEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.SetEnquirySentimentRequest;
import com.khatiyan.d_modules.enquiry.api.dto.UpdateEnquiryChannelConsentsRequest;
import com.khatiyan.d_modules.enquiry.model.EnquiryEndReason;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.model.EnquirySentiment;
import com.khatiyan.d_modules.enquiry.service.EnquiryChannelConsentService;
import com.khatiyan.d_modules.enquiry.service.EnquiryExpirySchedulerService;
import com.khatiyan.d_modules.enquiry.service.EnquiryService;
import com.khatiyan.d_modules.lead.api.dto.CancelVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.EnquiryChatActionsResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadResponse;
import com.khatiyan.d_modules.lead.api.dto.RescheduleVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.ScheduleVisitRequest;
import com.khatiyan.d_modules.lead.api.dto.VisitAvailabilityResponse;
import com.khatiyan.d_modules.lead.api.dto.VisitResponse;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;
import com.khatiyan.d_modules.lead.model.VisitStatus;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.api.dto.SaveVisitSlotsRequest;
import com.khatiyan.d_modules.property.service.PropertyVisitSlotService;
import com.khatiyan.support.IntegrationTest;
import com.khatiyan.support.PublishedEvents;

/**
 * The enquiry chat's action bar, end to end: sentiment, booking a visit from
 * either side, moving it, and ending the conversation.
 *
 * <p>The property offers two slots every day, 10 to 11 and 4 to 5, each taking
 * two visits. Chat and notifications are mocks, as in the other flow tests, so
 * all three share one context.
 */
@IntegrationTest
class EnquiryChatActionsIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final LocalTime TEN = LocalTime.of(10, 0);
    private static final LocalTime FOUR = LocalTime.of(16, 0);

    @Autowired private JdbcTemplate jdbc;
    @Autowired private EnquiryService enquiryService;
    @Autowired private EnquiryChannelConsentService consentService;
    @Autowired private PropertyVisitSlotService visitSlots;
    @Autowired private LeadVisitService visits;
    @Autowired private LeadQueryService leads;
    @Autowired private EnquiryExpirySchedulerService expirySweep;

    @MockitoBean private NotificationModule notifications;
    @MockitoBean private ChatModule chat;

    private Seeded seeded;
    private UUID property;
    private UUID owner;
    private UUID manager;
    private UUID otherManager;
    private List<UUID> prospects;
    /** A cancel that keeps them Interested, with a reason. */
    private static final CancelVisitRequest STILL_INTERESTED = new CancelVisitRequest(true, "Plans changed");

    private final UUID thread = UUID.randomUUID();
    private final LocalDate tomorrow = LocalDate.now(IST).plusDays(1);

    @BeforeEach
    void seed() {
        seeded = LargePropertySeeder.seed(jdbc, LocalDate.now(IST), 8, 1, 61L);
        property = seeded.propertyId();
        owner = seeded.ownerId();
        prospects = seeded.userIds().stream().filter(id -> !id.equals(owner)).limit(3).toList();
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
    }

    // ---- The bar ---------------------------------------------------------

    @Test
    void theBarOffersNothingUntilTheEnquirerHasReplied() {
        UUID prospect = prospects.get(0);
        UUID enquiry = raise(prospect);
        enquiryService.respond(manager, enquiry, new RespondToEnquiryRequest(EnquiryResponseChannel.CHAT, null));
        // The conversation opens with what they asked, in their name.
        verify(chat).openEnquiryThread(property, enquiry, prospect, manager, "Is a single room free?");
        enquiryService.onChatMessage(message(enquiry, manager));

        EnquiryChatActionsResponse forManager = visits.chatActions(manager, enquiry);
        assertThat(forManager.viewer()).isEqualTo(EnquiryParty.ACTING_MANAGEMENT);
        assertThat(forManager.answered()).isFalse();
        assertThat(forManager.canSetSentiment()).isFalse();
        assertThat(forManager.canScheduleVisit()).isFalse();
        assertThat(visits.chatActions(prospect, enquiry).canScheduleVisit()).isFalse();
        assertThatThrownBy(() -> enquiryService.setSentiment(
                manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.INTERESTED)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("not replied yet");

        enquiryService.onChatMessage(message(enquiry, prospect));

        // The handler is asked for a sentiment. The prospect can already book.
        EnquiryChatActionsResponse afterReply = visits.chatActions(manager, enquiry);
        assertThat(afterReply.answered()).isTrue();
        assertThat(afterReply.canSetSentiment()).isTrue();
        assertThat(afterReply.sentiment()).isNull();
        assertThat(afterReply.canScheduleVisit()).isFalse();
        assertThat(afterReply.canEndConversation()).isFalse();
        EnquiryChatActionsResponse forProspect = visits.chatActions(prospect, enquiry);
        assertThat(forProspect.viewer()).isEqualTo(EnquiryParty.ENQUIRER);
        assertThat(forProspect.canScheduleVisit()).isTrue();
        assertThat(forProspect.canSetSentiment()).isFalse();
    }

    @Test
    void onlyWhoeverHandlesItSetsTheSentimentAndTheEnquirerNeverSeesIt() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);

        assertThatThrownBy(() -> enquiryService.setSentiment(
                otherManager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.INTERESTED)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Someone else is handling");

        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));

        assertThat(visits.chatActions(manager, enquiry).sentiment()).isEqualTo(EnquirySentiment.NOT_INTERESTED);
        // Another manager reads it and may do nothing with it.
        EnquiryChatActionsResponse forOther = visits.chatActions(otherManager, enquiry);
        assertThat(forOther.viewer()).isEqualTo(EnquiryParty.OTHER_MANAGEMENT);
        assertThat(forOther.sentiment()).isEqualTo(EnquirySentiment.NOT_INTERESTED);
        assertThat(forOther.canSetSentiment()).isFalse();
        assertThat(forOther.canEndConversation()).isFalse();
        // The enquirer is not told what the handler made of them.
        assertThat(visits.chatActions(prospect, enquiry).sentiment()).isNull();
        // An outsider gets nothing at all.
        assertThatThrownBy(() -> visits.chatActions(prospects.get(1), enquiry)).isInstanceOf(RuntimeException.class);

        // It can be changed.
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.INTERESTED));
        assertThat(visits.chatActions(manager, enquiry).sentiment()).isEqualTo(EnquirySentiment.INTERESTED);
    }

    /** "Not decided" takes the reading back, and with it whatever it had offered. */
    @Test
    void notDecidedClearsTheSentimentAndWhatItOffered() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);

        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.INTERESTED));
        assertThat(visits.chatActions(manager, enquiry).canScheduleVisit()).isTrue();
        enquiryService.clearSentiment(manager, enquiry);

        EnquiryChatActionsResponse cleared = visits.chatActions(manager, enquiry);
        assertThat(cleared.sentiment()).isNull();
        assertThat(cleared.canSetSentiment()).isTrue();
        assertThat(cleared.canScheduleVisit()).isFalse();
        assertThat(cleared.canEndConversation()).isFalse();

        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));
        assertThat(visits.chatActions(manager, enquiry).canEndConversation()).isTrue();
        enquiryService.clearSentiment(manager, enquiry);
        assertThat(visits.chatActions(manager, enquiry).canEndConversation()).isFalse();
        // Clearing what is already clear changes nothing.
        enquiryService.clearSentiment(manager, enquiry);
        assertThat(visits.chatActions(manager, enquiry).sentiment()).isNull();

        // The same gate as setting one: not somebody else's enquiry, and not once it is over.
        assertThatThrownBy(() -> enquiryService.clearSentiment(otherManager, enquiry))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Someone else is handling");
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));
        enquiryService.endConversation(manager, enquiry);
        assertThatThrownBy(() -> enquiryService.clearSentiment(manager, enquiry))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("conversation has ended");
    }

    // ---- Booking ---------------------------------------------------------

    @Test
    void theHandlerBooksOnceInterestedAndTheLeadBecomesAnEarlyLead() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.INTERESTED));
        assertThat(visits.chatActions(manager, enquiry).canScheduleVisit()).isTrue();
        assertThat(spotsLeft(tomorrow, FOUR)).isEqualTo(2);

        reset(notifications);
        EnquiryChatActionsResponse booked = visits.schedule(manager, enquiry, new ScheduleVisitRequest(tomorrow, FOUR));

        assertThat(booked.visit()).isNotNull();
        assertThat(booked.visit().referenceCode()).startsWith("VIS-");
        assertThat(booked.visit().date()).isEqualTo(tomorrow);
        assertThat(booked.visit().slotStart()).isEqualTo(FOUR);
        assertThat(booked.visit().slotEnd()).isEqualTo(LocalTime.of(17, 0));
        assertThat(booked.visit().canReschedule()).isTrue();
        assertThat(booked.canScheduleVisit()).isFalse();

        // One place taken in that slot, none in the other.
        assertThat(spotsLeft(tomorrow, FOUR)).isEqualTo(1);
        assertThat(spotsLeft(tomorrow, TEN)).isEqualTo(2);

        LeadResponse lead = onlyLead();
        assertThat(lead.stage()).isEqualTo(LeadStage.EARLY_LEAD);
        assertThat(lead.earlyLeadAt()).isNotNull();
        assertThat(lead.state()).isEqualTo(LeadState.OPEN);

        // The prospect is told, in their own workspace, and sees the visit on their bar.
        verify(notifications, times(1)).notifyUser(
                eq(prospect), eq("Visit scheduled"), contains("scheduled your visit for"), any(), any(),
                eq(NotificationSubtype.VISIT_SCHEDULED), any(), any(), any(), eq(NotificationAudience.TENANT));
        assertThat(visits.chatActions(prospect, enquiry).visit().id()).isEqualTo(booked.visit().id());

        // One visit still to happen per lead: a second is refused, from either side.
        assertThatThrownBy(() -> visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, TEN)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already scheduled");
    }

    /** Neither side books before someone has actually reached the enquirer. */
    @Test
    void noVisitIsBookedBeforeTheEnquiryHasBeenAnswered() {
        UUID prospect = prospects.get(0);
        UUID enquiry = raise(prospect);
        enquiryService.respond(manager, enquiry, new RespondToEnquiryRequest(EnquiryResponseChannel.CHAT, null));
        // Written to, not yet answered: the chat is still pending.
        enquiryService.onChatMessage(message(enquiry, manager));

        for (UUID side : List.of(prospect, manager)) {
            assertThatThrownBy(() -> visits.schedule(side, enquiry, new ScheduleVisitRequest(tomorrow, FOUR)))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("once this enquiry has been answered");
        }
        assertThat(spotsLeft(tomorrow, FOUR)).isEqualTo(2);

        // The reply answers it, and either side can book from then.
        enquiryService.onChatMessage(message(enquiry, prospect));
        visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR));
        assertThat(spotsLeft(tomorrow, FOUR)).isEqualTo(1);
    }

    /** "Just in case someone changes their mind": not interested does not take the prospect's button away. */
    @Test
    void theProspectCanStillBookAfterBeingMarkedNotInterested() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));

        EnquiryChatActionsResponse forManager = visits.chatActions(manager, enquiry);
        assertThat(forManager.canEndConversation()).isTrue();
        assertThat(forManager.canScheduleVisit()).isFalse();
        assertThat(visits.chatActions(prospect, enquiry).canScheduleVisit()).isTrue();

        reset(notifications);
        visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, TEN));

        assertThat(onlyLead().stage()).isEqualTo(LeadStage.EARLY_LEAD);
        // The handler is told, and is no longer offered to end a conversation with a visit pending.
        verify(notifications, times(1)).notifyUser(
                eq(manager), eq("Visit scheduled"), contains("booked a visit to"), any(), any(),
                eq(NotificationSubtype.VISIT_SCHEDULED), any(), any(), any(), eq(NotificationAudience.MANAGEMENT));
        assertThat(visits.chatActions(manager, enquiry).canEndConversation()).isFalse();
    }

    @Test
    void aSlotStopsTakingBookingsWhenItsPlacesRunOut() {
        // Two places in the 4 pm slot. Three people want it.
        UUID first = answered(prospects.get(0));
        UUID second = answered(prospects.get(1));
        UUID third = answered(prospects.get(2));

        visits.schedule(prospects.get(0), first, new ScheduleVisitRequest(tomorrow, FOUR));
        assertThat(spotsLeft(tomorrow, FOUR)).isEqualTo(1);
        visits.schedule(prospects.get(1), second, new ScheduleVisitRequest(tomorrow, FOUR));
        assertThat(spotsLeft(tomorrow, FOUR)).isZero();

        assertThatThrownBy(() -> visits.schedule(prospects.get(2), third, new ScheduleVisitRequest(tomorrow, FOUR)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("slot is full");

        // The same slot on another day, and the other slot the same day, are still open.
        assertThat(spotsLeft(tomorrow.plusDays(1), FOUR)).isEqualTo(2);
        visits.schedule(prospects.get(2), third, new ScheduleVisitRequest(tomorrow, TEN));
        assertThat(spotsLeft(tomorrow, TEN)).isEqualTo(1);
    }

    @Test
    void aVisitIsBookedFromTomorrowToThirtyDaysAheadIntoASlotThePropertyOffers() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        LocalDate today = LocalDate.now(IST);
        // Its own window well past 30 days, so this is the 30-day limit alone:
        // the enquiry's end is the next test's.
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().plus(Duration.ofDays(60))), enquiry);

        assertThatThrownBy(() -> visits.schedule(prospect, enquiry, new ScheduleVisitRequest(today, FOUR)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("from tomorrow");
        assertThatThrownBy(() -> visits.schedule(prospect, enquiry, new ScheduleVisitRequest(today.plusDays(31), FOUR)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("30 days ahead");
        assertThatThrownBy(() -> visits.schedule(
                prospect, enquiry, new ScheduleVisitRequest(tomorrow, LocalTime.of(13, 0))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("does not offer that slot");

        VisitAvailabilityResponse open = visits.availability(property);
        assertThat(open.configured()).isTrue();
        assertThat(open.days()).hasSize(30);
        assertThat(open.days().get(0).date()).isEqualTo(tomorrow);
        assertThat(open.days().get(29).date()).isEqualTo(today.plusDays(30));
        assertThat(open.days().get(0).slots()).extracting(VisitAvailabilityResponse.Slot::startTime)
                .containsExactly(TEN, FOUR);

        visits.schedule(prospect, enquiry, new ScheduleVisitRequest(today.plusDays(30), TEN));
        assertThat(spotsLeft(today.plusDays(30), TEN)).isEqualTo(1);
    }

    @Test
    void aVisitIsBookedAndMovedOnlyWhileItsEnquiryIsLive() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        LocalDate dayAfter = tomorrow.plusDays(1);
        // The enquiry ends the day after tomorrow, at noon.
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(dayAfter.atTime(12, 0).atZone(IST).toInstant()), enquiry);

        // The day strip stops there, and that day keeps only the slot before noon.
        VisitAvailabilityResponse open = visits.availabilityForEnquiry(prospect, property, enquiry);
        assertThat(open.days()).extracting(VisitAvailabilityResponse.Day::date).containsExactly(tomorrow, dayAfter);
        assertThat(open.days().get(1).slots()).extracting(VisitAvailabilityResponse.Slot::startTime)
                .containsExactly(TEN);

        assertThatThrownBy(() -> visits.schedule(prospect, enquiry, new ScheduleVisitRequest(dayAfter, FOUR)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("before this enquiry ends");
        assertThatThrownBy(() -> visits.schedule(
                prospect, enquiry, new ScheduleVisitRequest(dayAfter.plusDays(1), TEN)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("before this enquiry ends");
        VisitResponse visit = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR)).visit();

        // Neither side can move it past the enquiry's end, and neither is offered a slot there.
        assertThatThrownBy(() -> visits.reschedule(
                prospect, visit.id(), new RescheduleVisitRequest(dayAfter, FOUR, null)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("before this enquiry ends");
        assertThatThrownBy(() -> visits.reschedule(
                manager, visit.id(), new RescheduleVisitRequest(dayAfter.plusDays(2), TEN, null)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("before this enquiry ends");
        assertThat(visits.moveOptions(manager, visit.id()).days())
                .allSatisfy(day -> assertThat(day.date()).isBeforeOrEqualTo(dayAfter));

        VisitResponse moved = visits.reschedule(prospect, visit.id(), new RescheduleVisitRequest(dayAfter, TEN, null));
        assertThat(moved.date()).isEqualTo(dayAfter);

        // Someone outside the enquiry is told nothing about it.
        assertThatThrownBy(() -> visits.availabilityForEnquiry(prospects.get(1), property, enquiry))
                .isInstanceOf(ForbiddenException.class);
    }

    // ---- Moving ----------------------------------------------------------

    @Test
    void theProspectMovesTheirVisitTwiceThenThePropertyHasTo() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        VisitResponse visit = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR)).visit();
        assertThat(visit.tenantReschedulesLeft()).isEqualTo(2);

        reset(notifications);
        VisitResponse once = visits.reschedule(
                prospect, visit.id(), new RescheduleVisitRequest(tomorrow.plusDays(2), TEN, null));

        assertThat(once.date()).isEqualTo(tomorrow.plusDays(2));
        assertThat(once.slotStart()).isEqualTo(TEN);
        assertThat(once.tenantReschedulesLeft()).isEqualTo(1);
        // Its old place is free again, its new one is taken.
        assertThat(spotsLeft(tomorrow, FOUR)).isEqualTo(2);
        assertThat(spotsLeft(tomorrow.plusDays(2), TEN)).isEqualTo(1);
        verify(notifications, times(1)).notifyUser(
                eq(manager), eq("Visit moved"), contains("moved their visit"), any(), any(),
                eq(NotificationSubtype.VISIT_RESCHEDULED), any(), any(), any(), eq(NotificationAudience.MANAGEMENT));

        VisitResponse twice = visits.reschedule(
                prospect, visit.id(), new RescheduleVisitRequest(tomorrow.plusDays(3), TEN, null));
        assertThat(twice.tenantReschedulesLeft()).isZero();
        assertThat(twice.canReschedule()).isFalse();
        assertThat(twice.rescheduleRefusal()).contains("rescheduled this visit twice");
        assertThat(visits.chatActions(prospect, enquiry).visit().canReschedule()).isFalse();

        assertThatThrownBy(() -> visits.reschedule(
                prospect, visit.id(), new RescheduleVisitRequest(tomorrow.plusDays(4), TEN, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("rescheduled this visit twice");

        // The handler still can, and it is not counted against the prospect.
        assertThat(visits.chatActions(manager, enquiry).visit().canReschedule()).isTrue();
        reset(notifications);
        VisitResponse byHandler = visits.reschedule(
                manager, visit.id(), new RescheduleVisitRequest(tomorrow.plusDays(4), FOUR, "Owner is away that day"));
        assertThat(byHandler.date()).isEqualTo(tomorrow.plusDays(4));
        verify(notifications, times(1)).notifyUser(
                eq(prospect), eq("Visit moved"), contains("moved your visit to"), any(), any(),
                eq(NotificationSubtype.VISIT_RESCHEDULED), any(), any(), any(), eq(NotificationAudience.TENANT));

        // Moving it to where it already is, or into a full slot, is refused.
        assertThatThrownBy(() -> visits.reschedule(
                manager, visit.id(), new RescheduleVisitRequest(tomorrow.plusDays(4), FOUR, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already in");
        // Somebody who is neither side cannot move it.
        assertThatThrownBy(() -> visits.reschedule(
                prospects.get(1), visit.id(), new RescheduleVisitRequest(tomorrow.plusDays(5), FOUR, null)))
                .isInstanceOf(RuntimeException.class);
    }

    /**
     * A missed visit gets a new date by being moved. It is never booked again,
     * by either side, while its enquiry still runs.
     */
    @Test
    void aMissedVisitIsMovedToANewDateAndNotBookedAgain() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        VisitResponse visit = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR)).visit();
        assertThat(visit.upcoming()).isTrue();
        assertThat(visit.missed()).isFalse();

        // The day comes and goes without them.
        setVisitDate(visit.id(), LocalDate.now(IST).minusDays(1));

        EnquiryChatActionsResponse forProspect = visits.chatActions(prospect, enquiry);
        assertThat(forProspect.visit().upcoming()).isFalse();
        assertThat(forProspect.visit().missed()).isTrue();
        assertThat(forProspect.visit().canReschedule()).isTrue();
        // The after-miss count of its own: two.
        assertThat(forProspect.visit().tenantReschedulesLeft()).isEqualTo(2);
        assertThat(forProspect.canScheduleVisit()).isFalse();
        assertThatThrownBy(() -> visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, TEN)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("after this enquiry expires");
        // The handler cannot book them a second one either.
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.INTERESTED));
        assertThat(visits.chatActions(manager, enquiry).canScheduleVisit()).isFalse();
        assertThatThrownBy(() -> visits.schedule(manager, enquiry, new ScheduleVisitRequest(tomorrow, TEN)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("after it expires");

        // Moving it is the second chance, and it counts as one of their two.
        VisitResponse moved = visits.reschedule(
                prospect, visit.id(), new RescheduleVisitRequest(tomorrow.plusDays(1), TEN, null));

        assertThat(moved.id()).isEqualTo(visit.id());
        assertThat(moved.upcoming()).isTrue();
        assertThat(moved.missed()).isFalse();
        // Upcoming again, so the before-date count shows, none of it used.
        assertThat(moved.tenantReschedulesLeft()).isEqualTo(2);
        assertThat(spotsLeft(tomorrow.plusDays(1), TEN)).isEqualTo(1);
        // Missed again: one left on the after-miss count.
        setVisitDate(visit.id(), LocalDate.now(IST).minusDays(1));
        assertThat(visits.chatActions(prospect, enquiry).visit().tenantReschedulesLeft()).isEqualTo(1);
    }

    // What may be done on the visit's own day turns on the hour since
    // 2026-10-04 (the property until two hours before the slot, the visitor by
    // their window). It is checked in VisitDayIntegrationTest, whose clock is
    // set, not here on the real one.

    /** One visit per enquiry: a new one is booked only on the person's next enquiry. */
    @Test
    void afterTheEnquiryExpiresTheyAskAgainAndCanBookAgain() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        VisitResponse visit = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR)).visit();
        setVisitDate(visit.id(), LocalDate.now(IST).minusDays(1));

        // A visit that is over does not hold the conversation open.
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));
        assertThat(visits.chatActions(manager, enquiry).canEndConversation()).isTrue();

        // The enquiry runs out. They ask again, are answered again, and can book again.
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), enquiry);
        UUID next = answered(prospect);

        assertThat(visits.chatActions(prospect, next).canScheduleVisit()).isTrue();
        EnquiryChatActionsResponse again = visits.schedule(prospect, next, new ScheduleVisitRequest(tomorrow, TEN));
        assertThat(again.visit().upcoming()).isTrue();
        assertThat(again.visit().id()).isNotEqualTo(visit.id());
        // Still the one record for this person at this property.
        assertThat(onlyLead().stage()).isEqualTo(LeadStage.EARLY_LEAD);
    }

    // ---- Cancelling ------------------------------------------------------

    /** Either side cancels. They are back at Enquired, the place is freed, and they may book again. */
    @Test
    void eitherSideCancelsAndTheyAreBackAtEnquiredFreeToBookAgain() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        VisitResponse visit = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR)).visit();
        assertThat(visit.canCancel()).isTrue();
        assertThat(onlyLead().stage()).isEqualTo(LeadStage.EARLY_LEAD);
        // The Enquiries card sees it, and says Manage visit.
        assertThat(visits.bookedVisits(manager, property)).singleElement().satisfies(booked -> {
            assertThat(booked.enquiryId()).isEqualTo(enquiry);
            assertThat(booked.visitId()).isEqualTo(visit.id());
            assertThat(booked.upcoming()).isTrue();
        });
        assertThat(spotsLeft(tomorrow, FOUR)).isEqualTo(1);

        reset(notifications);
        VisitResponse cancelled = visits.cancel(prospect, visit.id(), STILL_INTERESTED);

        assertThat(cancelled.status()).isEqualTo(VisitStatus.CANCELLED);
        assertThat(cancelled.canCancel()).isFalse();
        // Back to Schedule visit on the card.
        assertThat(visits.bookedVisits(manager, property)).isEmpty();
        // Only the property's management reads the list.
        assertThatThrownBy(() -> visits.bookedVisits(prospect, property)).isInstanceOf(RuntimeException.class);
        assertThat(spotsLeft(tomorrow, FOUR)).isEqualTo(2);
        LeadResponse back = onlyLead();
        assertThat(back.stage()).isEqualTo(LeadStage.ENQUIRED);
        assertThat(back.earlyLeadAt()).isNull();
        assertThat(back.state()).isEqualTo(LeadState.OPEN);
        verify(notifications, times(1)).notifyUser(
                eq(manager), eq("Visit cancelled"), contains("cancelled their visit"), any(), any(),
                eq(NotificationSubtype.VISIT_CANCELLED), any(), any(), any(), eq(NotificationAudience.MANAGEMENT));

        // The bar offers booking again, and does not show the cancelled visit.
        EnquiryChatActionsResponse after = visits.chatActions(prospect, enquiry);
        assertThat(after.visit()).isNull();
        assertThat(after.canScheduleVisit()).isTrue();
        // A cancelled visit is not cancelled again, or moved.
        assertThatThrownBy(() -> visits.cancel(prospect, visit.id(), STILL_INTERESTED))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("can no longer be cancelled");
        assertThatThrownBy(() -> visits.reschedule(
                prospect, visit.id(), new RescheduleVisitRequest(tomorrow.plusDays(2), TEN, null)))
                .isInstanceOf(ValidationException.class);

        // They book again on the same enquiry: an early lead again.
        VisitResponse again = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow.plusDays(1), TEN)).visit();
        assertThat(again.id()).isNotEqualTo(visit.id());
        assertThat(onlyLead().stage()).isEqualTo(LeadStage.EARLY_LEAD);
        assertThat(again.tenantReschedulesLeft()).isEqualTo(2);

        // Nobody else cancels it: not another manager, not an outsider.
        assertThatThrownBy(() -> visits.cancel(otherManager, again.id(), STILL_INTERESTED))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Someone else is handling");
        assertThatThrownBy(() -> visits.cancel(prospects.get(1), again.id(), STILL_INTERESTED)).isInstanceOf(RuntimeException.class);

        // The handler cancels too, until two hours before the slot. This one is
        // tomorrow's, so it is well inside that whatever hour the build runs at.
        assertThat(visits.chatActions(manager, enquiry).visit().canCancel()).isTrue();
        reset(notifications);
        visits.cancel(manager, again.id(), STILL_INTERESTED);
        verify(notifications, times(1)).notifyUser(
                eq(prospect), eq("Visit cancelled"), contains("cancelled your visit"), any(), any(),
                eq(NotificationSubtype.VISIT_CANCELLED), any(), any(), any(), eq(NotificationAudience.TENANT));
        assertThat(onlyLead().stage()).isEqualTo(LeadStage.ENQUIRED);
    }

    /**
     * Cancelling and booking again does not hand the tenant fresh reschedules:
     * after their own cancel, the rebooked visit starts with what was left.
     * After the property cancels, it starts fresh (user, 2026-10-03).
     */
    @Test
    void aRebookingAfterTheTenantCancelsKeepsTheirRescheduleCount() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        VisitResponse first = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR)).visit();
        visits.reschedule(prospect, first.id(), new RescheduleVisitRequest(tomorrow.plusDays(1), FOUR, null));
        visits.reschedule(prospect, first.id(), new RescheduleVisitRequest(tomorrow.plusDays(2), FOUR, null));
        visits.cancel(prospect, first.id(), STILL_INTERESTED);

        VisitResponse second = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, TEN)).visit();
        assertThat(second.tenantReschedulesLeft()).isZero();
        assertThat(second.canReschedule()).isFalse();
        assertThat(second.rescheduleRefusal()).contains("rescheduled this visit twice");

        // The property cancels this one: the next booking starts fresh.
        visits.cancel(manager, second.id(), STILL_INTERESTED);
        VisitResponse third = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, TEN)).visit();
        assertThat(third.tenantReschedulesLeft()).isEqualTo(2);
    }

    /** Booked near the end of the enquiry, cancelled after it ran out: the record ends with the booking. */
    @Test
    void cancellingAfterTheEnquiryRanOutEndsTheRecord() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        VisitResponse visit = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR)).visit();
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), enquiry);
        // A visit still to happen keeps the record going past the enquiry's date.
        assertThat(onlyLead().state()).isEqualTo(LeadState.OPEN);

        visits.cancel(prospect, visit.id(), STILL_INTERESTED);

        LeadResponse ended = onlyLead();
        assertThat(ended.state()).isEqualTo(LeadState.CLOSED);
        assertThat(ended.closeReason()).isEqualTo(LeadCloseReason.VISIT_CANCELLED);
        assertThat(ended.stage()).isEqualTo(LeadStage.ENQUIRED);
    }

    /**
     * Back at (or still at) Enquired after being answered, the record lasts as
     * long as the enquiry and ends with it, named for why.
     */
    @Test
    void anAnsweredRecordAtEnquiredEndsWhenItsEnquiryRunsOut() {
        // Answered, never booked.
        UUID neverBooked = answered(prospects.get(0));
        // Answered, booked, cancelled.
        UUID cancelledOne = answered(prospects.get(1));
        VisitResponse visit = visits.schedule(
                prospects.get(1), cancelledOne, new ScheduleVisitRequest(tomorrow, FOUR)).visit();
        visits.cancel(prospects.get(1), visit.id(), STILL_INTERESTED);

        for (UUID enquiry : List.of(neverBooked, cancelledOne)) {
            // Inside its window the sweep has nothing to say.
            assertThat(enquiryService.closeWindowOfAnswered(enquiry)).isFalse();
            jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                    Timestamp.from(Instant.now().minusSeconds(60)), enquiry);
            assertThat(enquiryService.closeWindowOfAnswered(enquiry)).isTrue();
            // Once.
            assertThat(enquiryService.closeWindowOfAnswered(enquiry)).isFalse();
        }
        PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);

        assertThat(leadOf(prospects.get(0)).closeReason()).isEqualTo(LeadCloseReason.NO_VISIT_BOOKED);
        assertThat(leadOf(prospects.get(1)).closeReason()).isEqualTo(LeadCloseReason.VISIT_CANCELLED);
    }

    // ---- Ending ----------------------------------------------------------

    @Test
    void endingTheConversationClosesTheChatEndsTheEnquiryAndClosesTheLead() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));

        enquiryService.endConversation(manager, enquiry);
        PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);

        verify(chat, times(1)).closeEnquiryThread(enquiry);
        for (UUID viewer : List.of(manager, prospect)) {
            EnquiryChatActionsResponse after = visits.chatActions(viewer, enquiry);
            assertThat(after.ended()).isTrue();
            assertThat(after.canScheduleVisit()).isFalse();
            assertThat(after.canSetSentiment()).isFalse();
            assertThat(after.canEndConversation()).isFalse();
        }
        LeadResponse lead = onlyLead();
        assertThat(lead.state()).isEqualTo(LeadState.CLOSED);
        assertThat(lead.closeReason()).isEqualTo(LeadCloseReason.NOT_INTERESTED);

        // Nothing more can be done with it, and ending twice changes nothing.
        assertThatThrownBy(() -> visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("conversation has ended");
        assertThatThrownBy(() -> enquiryService.setSentiment(
                manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.INTERESTED)))
                .isInstanceOf(ValidationException.class);
        enquiryService.endConversation(manager, enquiry);
        verify(chat, times(1)).closeEnquiryThread(enquiry);

        // The person may ask again, and that starts a new record.
        UUID again = raise(prospect);
        PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);
        assertThat(again).isNotEqualTo(enquiry);
        assertThat(leads.pageForProperty(owner, property, LeadState.OPEN, null, 0, 20).items()).hasSize(1);
    }

    @Test
    void anEnquiryChatClosesByItselfWhenTheEnquirysDatePasses() {
        UUID enquiry = answered(prospects.get(0));

        // Inside its window the sweep leaves the chat alone.
        assertThat(enquiryService.closeChatOfExpired(enquiry)).isFalse();
        verify(chat, never()).closeEnquiryThread(any());

        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), enquiry);

        assertThat(enquiryService.closeChatOfExpired(enquiry)).isTrue();
        verify(chat, times(1)).closeEnquiryThread(enquiry);
        assertThat(visits.chatActions(manager, enquiry).ended()).isTrue();
        // Once closed it is not closed again.
        assertThat(enquiryService.closeChatOfExpired(enquiry)).isFalse();
        verify(chat, times(1)).closeEnquiryThread(enquiry);
    }

    // ---- Closing, and why an enquiry ended (2026-10-03) -------------------

    /**
     * Close enquiry: only once marked not interested. It reads Closed until its
     * usual date, then Expired. The enquirer is told in neutral words, nothing
     * more can be done with it, and they may enquire again.
     */
    @Test
    void closingNeedsNotInterestedKeepsTheThirtyDaysAndTellsTheEnquirer() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        assertThatThrownBy(() -> enquiryService.endConversation(manager, enquiry))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("not interested");

        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));
        Instant dueAt = expiresAt(enquiry);
        EnquiryDetailResponse closed = enquiryService.endConversation(manager, enquiry);

        assertThat(closed.endedAt()).isNotNull();
        assertThat(closed.expiresAt()).isEqualTo(dueAt);
        assertThat(closed.endReason()).isEqualTo(EnquiryEndReason.NOT_INTERESTED);
        // The action log says who closed it.
        assertThat(closed.endings())
                .extracting(EnquiryEndingView::kind, EnquiryEndingView::byUserId, EnquiryEndingView::automatic)
                .containsExactly(tuple(EnquiryEndingKind.CLOSED, manager, false));
        verify(notifications).notifyUser(
                eq(prospect), eq("Enquiry closed"), contains("has been closed"), any(), any(),
                eq(NotificationSubtype.ENQUIRY_CLOSED), eq(enquiry), any(), eq(NotificationDeliveryMode.IN_APP_ONLY));
        assertThatThrownBy(() -> enquiryService.respond(
                manager, enquiry, new RespondToEnquiryRequest(EnquiryResponseChannel.CALL_BACK, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("has been closed");

        // Closed, it reads so on their list until something else happens to it.
        assertThat(enquiryService.myEnquiries(prospect))
                .extracting(MyEnquiryItemResponse::id, MyEnquiryItemResponse::state)
                .containsExactly(tuple(enquiry, MyEnquiryState.CLOSED));

        // A new enquiry first expires the closed one: one current enquiry per
        // tenant per property (user's fix, 2026-10-03).
        UUID again = raise(prospect);
        assertThat(enquiryService.myEnquiries(prospect))
                .extracting(MyEnquiryItemResponse::id, MyEnquiryItemResponse::state)
                .containsExactly(tuple(again, MyEnquiryState.AWAITING_REPLY), tuple(enquiry, MyEnquiryState.EXPIRED));
        // Its log says so: expired by a duplicate request, after it was closed.
        assertThat(ownerCard(enquiry).endings())
                .extracting(EnquiryEndingView::kind)
                .containsExactly(EnquiryEndingKind.EXPIRED_BY_DUPLICATE, EnquiryEndingKind.CLOSED);
        assertThat(ownerCard(again).endings()).isEmpty();
    }

    /**
     * A booked visit settles a call still waiting for its answer as Accepted:
     * Interested, and the enquiry reads Interested, whoever booked.
     */
    @Test
    void bookingAVisitSettlesAWaitingCallAsInterested() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));
        UUID call = enquiryService.respond(
                manager, enquiry, new RespondToEnquiryRequest(EnquiryResponseChannel.CALL_BACK, null)).callToSettleId();
        assertThat(call).isNotNull();

        EnquiryChatActionsResponse booked = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR));

        assertThat(jdbc.queryForMap("SELECT outcome, call_result, note FROM enquiry.enquiry_responses WHERE id = ?", call))
                .containsEntry("outcome", "SUCCEEDED")
                .containsEntry("call_result", "ACCEPTED_INTERESTED")
                .containsEntry("note", "Settled when a visit was booked.");
        assertThat(visits.chatActions(manager, enquiry).sentiment()).isEqualTo(EnquirySentiment.INTERESTED);
        // The version handed back is the row's own, so the next action is not refused as stale.
        assertThat(booked.enquiryVersion())
                .isEqualTo(jdbc.queryForObject("SELECT version FROM enquiry.enquiries WHERE id = ?", Long.class, enquiry));
    }

    /** An answered enquiry that runs out says why: its reading first, then its visit. */
    @Test
    void anAnsweredEnquiryThatRunsOutSaysWhy() {
        UUID notInterested = answered(prospects.get(0));
        enquiryService.setSentiment(manager, notInterested, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));
        UUID booked = answered(prospects.get(1));
        visits.schedule(prospects.get(1), booked, new ScheduleVisitRequest(tomorrow, FOUR));
        UUID cancelled = answered(prospects.get(2));
        VisitResponse visit = visits.schedule(prospects.get(2), cancelled, new ScheduleVisitRequest(tomorrow, TEN)).visit();
        visits.cancel(prospects.get(2), visit.id(), STILL_INTERESTED);

        for (UUID enquiry : List.of(notInterested, booked, cancelled)) {
            jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                    Timestamp.from(Instant.now().minusSeconds(60)), enquiry);
            assertThat(enquiryService.closeWindowOfAnswered(enquiry)).isTrue();
        }

        assertThat(endReason(notInterested)).isEqualTo("NOT_INTERESTED");
        assertThat(endReason(booked)).isEqualTo("VISIT_BOOKED");
        assertThat(endReason(cancelled)).isEqualTo("VISIT_CANCELLED");

        // Answered, nothing booked, no reading: no visit was booked.
        UUID quiet = answered(prospects.get(0));
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), quiet);
        enquiryService.closeWindowOfAnswered(quiet);
        assertThat(endReason(quiet)).isEqualTo("NO_VISIT_BOOKED");
        // The action log carries the expiry, with the same reason.
        assertThat(ownerCard(quiet).endings())
                .extracting(EnquiryEndingView::kind, EnquiryEndingView::reason)
                .containsExactly(tuple(EnquiryEndingKind.EXPIRED, EnquiryEndReason.NO_VISIT_BOOKED));
    }

    /**
     * Not interested waits 7 days. In them the enquirer may change their mind,
     * once: Interested again, and the handler is told. Marked Not interested a
     * second time, it closes at once (owner's design, 2026-10-03).
     */
    @Test
    void theEnquirerMayChangeTheirMindOnceAndASecondNotInterestedCloses() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));

        MyEnquiryItemResponse marked = enquiryService.myEnquiries(prospect).get(0);
        assertThat(marked.canChangeMind()).isTrue();
        assertThat(marked.notInterestedClosesAt()).isAfter(Instant.now().plus(Duration.ofDays(6)));

        reset(notifications);
        MyEnquiryItemResponse changed = enquiryService.changeMind(prospect, enquiry);
        assertThat(changed.canChangeMind()).isFalse();
        assertThat(changed.notInterestedClosesAt()).isNull();
        EnquiryChatActionsResponse forManager = visits.chatActions(manager, enquiry);
        assertThat(forManager.sentiment()).isEqualTo(EnquirySentiment.INTERESTED);
        assertThat(forManager.notInterestedCloses()).isTrue();
        assertThat(visits.chatActions(prospect, enquiry).notInterestedCloses()).isTrue();
        verify(notifications).notifyUser(
                eq(manager), eq("Interested again"), contains("changed their mind"), any(), any(),
                eq(NotificationSubtype.ENQUIRY_MIND_CHANGED), eq(enquiry), any(), any());

        // Once only, and only their own.
        assertThatThrownBy(() -> enquiryService.changeMind(prospect, enquiry))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> enquiryService.changeMind(prospects.get(1), enquiry))
                .isInstanceOf(NotFoundException.class);

        EnquiryDetailResponse again = enquiryService.setSentiment(
                manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));
        assertThat(again.endedAt()).isNotNull();
        assertThat(again.endReason()).isEqualTo(EnquiryEndReason.NOT_INTERESTED);
        verify(chat).closeEnquiryThread(enquiry);
        assertThat(enquiryService.myEnquiries(prospect).get(0).state()).isEqualTo(MyEnquiryState.CLOSED);
    }

    /** Left Not interested for 7 days, the hourly sweep closes it, named for whoever marked it. */
    @Test
    void aNotInterestedEnquiryNobodyActsOnClosesAfterSevenDays() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));
        assertThat(enquiryService.closeNotInterestedAfterGrace(enquiry)).isFalse();

        jdbc.update("UPDATE enquiry.enquiries SET sentiment_set_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minus(Duration.ofDays(7)).minusSeconds(60)), enquiry);
        jdbc.update("UPDATE public.shedlock SET lock_until = TIMESTAMP '2000-01-01' WHERE name = 'enquiry-expireStale'");
        expirySweep.expireStaleEnquiries();

        assertThat(enquiryService.myEnquiries(prospect).get(0).state()).isEqualTo(MyEnquiryState.CLOSED);
        assertThat(endReason(enquiry)).isEqualTo("NOT_INTERESTED");
        assertThat(jdbc.queryForObject(
                "SELECT ended_by_user_id FROM enquiry.enquiries WHERE id = ?", UUID.class, enquiry)).isEqualTo(manager);
        verify(chat).closeEnquiryThread(enquiry);
        assertThat(enquiryService.closeNotInterestedAfterGrace(enquiry)).isFalse();
        // Nobody pressed anything, and the action log says so.
        assertThat(ownerCard(enquiry).endings())
                .extracting(EnquiryEndingView::kind, EnquiryEndingView::automatic)
                .containsExactly(tuple(EnquiryEndingKind.CLOSED, true));
    }

    /**
     * A closing the enquirer's change of mind undid stays in the action log
     * (user, 2026-10-03), under the closing that followed it.
     */
    @Test
    void aClosingUndoneByAChangeOfMindStaysInTheActionLog() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        enquiryService.setSentiment(manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));
        enquiryService.endConversation(manager, enquiry);
        // Read back, so it carries the precision the database keeps.
        Instant firstClosing = ownerCard(enquiry).endedAt();

        enquiryService.changeMind(prospect, enquiry);
        EnquiryDetailResponse reopened = ownerCard(enquiry);
        assertThat(reopened.endedAt()).isNull();
        assertThat(reopened.endings())
                .extracting(EnquiryEndingView::kind, EnquiryEndingView::at, EnquiryEndingView::byUserId)
                .containsExactly(tuple(EnquiryEndingKind.CLOSED, firstClosing, manager));

        // Not interested again closes it at once: both closings, newest first.
        EnquiryDetailResponse again = enquiryService.setSentiment(
                manager, enquiry, new SetEnquirySentimentRequest(EnquirySentiment.NOT_INTERESTED));
        assertThat(again.endings())
                .extracting(EnquiryEndingView::kind, EnquiryEndingView::at)
                .containsExactly(
                        tuple(EnquiryEndingKind.CLOSED, again.endedAt()),
                        tuple(EnquiryEndingKind.CLOSED, firstClosing));
    }

    /**
     * Cancelling asks whether they are still interested, and why (owner's
     * design, 2026-10-03). Still interested keeps the intent. Not interested
     * marks it so and starts the 7 days. The owner's card carries the reason.
     */
    @Test
    void cancellingAsksWhetherTheyAreStillInterestedAndWhy() {
        UUID prospect = prospects.get(0);
        UUID enquiry = answered(prospect);
        VisitResponse visit = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, FOUR)).visit();

        assertThatThrownBy(() -> visits.cancel(prospect, visit.id(), new CancelVisitRequest(true, "  ")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("reason");

        // Still interested: Interested stays, and both cards hear of the cancel.
        visits.cancel(prospect, visit.id(), new CancelVisitRequest(true, "Exams that week"));
        assertThat(visits.chatActions(manager, enquiry).sentiment()).isEqualTo(EnquirySentiment.INTERESTED);
        assertThat(ownerCard(enquiry).cancelledVisit()).satisfies(cancelled -> {
            assertThat(cancelled.reason()).isEqualTo("Exams that week");
            assertThat(cancelled.byTenant()).isTrue();
        });
        assertThat(enquiryService.myEnquiries(prospect).get(0).visitCancelledAt()).isNotNull();

        // Booked again: no longer "Visit cancelled" for them. Then the property
        // cancels it as not interested: Not interested, with its 7 days.
        VisitResponse again = visits.schedule(prospect, enquiry, new ScheduleVisitRequest(tomorrow, TEN)).visit();
        assertThat(enquiryService.myEnquiries(prospect).get(0).visitCancelledAt()).isNull();
        visits.cancel(manager, again.id(), new CancelVisitRequest(false, "Found another place"));

        assertThat(visits.chatActions(manager, enquiry).sentiment()).isEqualTo(EnquirySentiment.NOT_INTERESTED);
        MyEnquiryItemResponse mine = enquiryService.myEnquiries(prospect).get(0);
        assertThat(mine.notInterestedClosesAt()).isNotNull();
        assertThat(mine.canChangeMind()).isTrue();
        assertThat(ownerCard(enquiry).cancelledVisit()).satisfies(cancelled -> {
            assertThat(cancelled.reason()).isEqualTo("Found another place");
            assertThat(cancelled.byTenant()).isFalse();
        });
    }

    private EnquiryDetailResponse ownerCard(UUID enquiry) {
        return enquiryService.listForProperty(owner, property).stream()
                .filter(card -> card.id().equals(enquiry))
                .findFirst()
                .orElseThrow();
    }

    private Instant expiresAt(UUID enquiry) {
        return jdbc.queryForObject("SELECT expires_at FROM enquiry.enquiries WHERE id = ?", Timestamp.class, enquiry)
                .toInstant();
    }

    private String endReason(UUID enquiry) {
        return jdbc.queryForObject("SELECT end_reason FROM enquiry.enquiries WHERE id = ?", String.class, enquiry);
    }

    // ---- Helpers ---------------------------------------------------------

    private UUID raise(UUID prospect) {
        consentService.replace(prospect,
                new UpdateEnquiryChannelConsentsRequest(Set.of(EnquiryResponseChannel.CALL_BACK), true));
        return enquiryService.raise(prospect, property, new RaiseEnquiryRequest("Is a single room free?")).enquiryId();
    }

    /** An enquiry the manager wrote to over chat and the prospect replied on. */
    private UUID answered(UUID prospect) {
        UUID enquiry = raise(prospect);
        enquiryService.respond(manager, enquiry, new RespondToEnquiryRequest(EnquiryResponseChannel.CHAT, null));
        enquiryService.onChatMessage(message(enquiry, manager));
        enquiryService.onChatMessage(message(enquiry, prospect));
        return enquiry;
    }

    private ChatMessageSentEvent message(UUID enquiry, UUID sender) {
        return new ChatMessageSentEvent(thread, property, ChatThreadOrigin.ENQUIRY, enquiry, sender, Instant.now());
    }

    private void setVisitDate(UUID visit, LocalDate date) {
        jdbc.update("UPDATE lead.visits SET visit_date = ? WHERE id = ?", java.sql.Date.valueOf(date), visit);
    }

    private int spotsLeft(LocalDate date, LocalTime slotStart) {
        return visits.availability(property).days().stream()
                .filter(day -> day.date().equals(date))
                .flatMap(day -> day.slots().stream())
                .filter(slot -> slot.startTime().equals(slotStart))
                .findFirst()
                .orElseThrow()
                .spotsLeft();
    }

    private LeadResponse leadOf(UUID prospect) {
        PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);
        return leads.pageForProperty(owner, property, null, null, 0, 20).items().stream()
                .filter(lead -> lead.prospectUserId().equals(prospect))
                .findFirst()
                .orElseThrow();
    }

    private LeadResponse onlyLead() {
        PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);
        List<LeadResponse> all = leads.pageForProperty(owner, property, null, null, 0, 20).items();
        assertThat(all).hasSize(1);
        return all.get(0);
    }

    private UUID manager(String name) {
        UUID id = UUID.randomUUID();
        String phone = "+9195" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
        jdbc.update("""
                INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified,
                    credential_version, gender, date_of_birth, created_at, updated_at)
                VALUES (?, ?, ?, 'USER', true, true, 0, 'MALE', DATE '1990-01-01', now(), now())
                """, id, phone, name);
        jdbc.update("""
                INSERT INTO property.property_managers (id, property_id, manager_user_id, assigned_by_user_id,
                    is_active, reference_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, true, ?, now(), now())
                """, UUID.randomUUID(), property, id, owner, "MGR-T-" + id.toString().substring(0, 12));
        return id;
    }
}
