package com.khatiyan.d_modules.enquiry.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.analytics.LargePropertySeeder;
import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.chat.ChatModule;
import com.khatiyan.d_modules.chat.event.ChatMessageSentEvent;
import com.khatiyan.d_modules.chat.model.ChatThreadOrigin;
import com.khatiyan.d_modules.enquiry.api.dto.AssignEnquiryHandlerRequest;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryCallToSettleResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryCountsResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryDetailResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryHandlerSettingsRequest;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryListScope;
import com.khatiyan.d_modules.enquiry.api.dto.MyEnquiryState;
import com.khatiyan.d_modules.enquiry.api.dto.RaiseEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.RespondToEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.SettleEnquiryAttemptRequest;
import com.khatiyan.d_modules.enquiry.api.dto.UpdateEnquiryChannelConsentsRequest;
import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome;
import com.khatiyan.d_modules.enquiry.model.EnquiryEndReason;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerAssignment;
import com.khatiyan.d_modules.enquiry.model.EnquirySentiment;
import com.khatiyan.d_modules.enquiry.model.EnquiryCallResult;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerMode;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponse;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;
import com.khatiyan.d_modules.enquiry.repository.EnquiryResponseRepository;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.support.IntegrationTest;
import com.khatiyan.support.PublishedEvents;

/**
 * Handlers and attempts, against the real schema.
 *
 * <p>The rules themselves are unit-tested in {@code EnquiryHandlerRulesTest}.
 * What needs a database is here: the partial unique indexes, the row locks, the
 * queries behind each list, and the whole path from an enquiry arriving to it
 * being answered.
 *
 * <p>Chat and notifications are replaced by mocks. Chat, so a test can say "the
 * enquirer has replied" without a real conversation. Notifications, so a test
 * can check who was told what.
 */
@IntegrationTest
class EnquiryAttemptsIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private EnquiryService enquiryService;
    @Autowired private EnquiryHandlerService handlerService;
    @Autowired private EnquiryChannelConsentService consentService;
    @Autowired private EnquiryExpirySchedulerService expirySweep;
    @Autowired private EnquiryUnassignedReminderService unassignedReminder;
    @Autowired private EnquiryRepository enquiries;
    @Autowired private EnquiryResponseRepository attempts;

    @MockitoBean private NotificationModule notifications;
    @MockitoBean private ChatModule chat;

    private Seeded seeded;
    private UUID property;
    private UUID owner;
    private UUID managerA;
    private UUID managerB;
    private List<UUID> enquirers;
    private final UUID thread = UUID.randomUUID();

    @BeforeEach
    void seed() {
        seeded = LargePropertySeeder.seed(jdbc, LocalDate.now(IST), 8, 1, 41L);
        property = seeded.propertyId();
        owner = seeded.ownerId();
        enquirers = seeded.userIds().stream().filter(id -> !id.equals(owner)).limit(4).toList();
        assertThat(enquirers).hasSize(4);

        managerA = manager("Manager A");
        managerB = manager("Manager B");

        when(chat.openEnquiryThread(any(), any(), any(), any(), any())).thenReturn(thread);
    }

    @AfterEach
    void remove() {
        // The leads pipeline follows every enquiry raised here, on its own
        // threads. Its rows are removed only once it has finished with them.
        PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);
        jdbc.update("DELETE FROM lead.leads WHERE property_id = ?", property);
        jdbc.update("DELETE FROM enquiry.enquiries WHERE property_id = ?", property);
        jdbc.update("DELETE FROM enquiry.enquiry_handler_settings WHERE property_id = ?", property);
        for (UUID enquirer : enquirers) {
            jdbc.update("DELETE FROM enquiry.enquiry_channel_consents WHERE user_id = ?", enquirer);
        }
        jdbc.update("DELETE FROM property.property_managers WHERE property_id = ?", property);
        LargePropertySeeder.remove(jdbc, seeded);
        jdbc.update("DELETE FROM auth.users WHERE id IN (?, ?)", managerA, managerB);
    }

    // ---- A call ----------------------------------------------------------

    @Test
    void aCallLeavesTheEnquiryUnansweredUntilItIsSettledAsASuccess() {
        UUID enquiry = raise(enquirers.get(0));

        EnquiryDetailResponse called = enquiryService.respond(managerA, enquiry, call("Ask about the AC room"));

        // Tapping Call answered nothing. It made the caller the handler and left a call to settle.
        assertThat(called.status()).isEqualTo(EnquiryStatus.NEW);
        assertThat(called.handlerUserId()).isEqualTo(managerA);
        assertThat(called.handlerAssignedBy()).isEqualTo(EnquiryHandlerAssignment.FIRST_RESPONSE);
        assertThat(called.callToSettleId()).isNotNull();
        assertThat(called.viewerSettlesCall()).isTrue();

        // That enquiry takes no further call until this one is settled.
        assertThatThrownBy(() -> enquiryService.respond(managerA, enquiry, call(null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Say whether they responded");

        EnquiryDetailResponse failed = enquiryService.settleAttempt(
                managerA, enquiry, called.callToSettleId(),
                new SettleEnquiryAttemptRequest(EnquiryAttemptOutcome.FAILED, "Call did not connect"));

        assertThat(failed.status()).isEqualTo(EnquiryStatus.NEW);
        assertThat(failed.respondedAt()).isNull();
        assertThat(failed.callToSettleId()).isNull();
        assertThat(failed.responses()).singleElement().satisfies(attempt -> {
            assertThat(attempt.outcome()).isEqualTo(EnquiryAttemptOutcome.FAILED);
            assertThat(attempt.note()).isEqualTo("Call did not connect");
        });

        // Settled, so the handler can try again. This one connects.
        EnquiryDetailResponse again = enquiryService.respond(managerA, enquiry, call(null));
        EnquiryDetailResponse answered = enquiryService.settleAttempt(
                managerA, enquiry, again.callToSettleId(),
                new SettleEnquiryAttemptRequest(EnquiryAttemptOutcome.SUCCEEDED, "Wants to visit on Sunday"));

        assertThat(answered.status()).isEqualTo(EnquiryStatus.RESPONDED);
        assertThat(answered.respondedAt()).isNotNull();
        assertThat(answered.responses()).hasSize(2);
    }

    @Test
    void theCallToSettleIsListedForTheHandlerAndNobodyElse() {
        UUID enquiry = raise(enquirers.get(0));
        enquiryService.respond(managerA, enquiry, call(null));

        List<EnquiryCallToSettleResponse> mine = enquiryService.callsToSettle(managerA, property);

        assertThat(mine).singleElement().satisfies(toSettle -> {
            assertThat(toSettle.enquiryId()).isEqualTo(enquiry);
            assertThat(toSettle.calledByUserId()).isEqualTo(managerA);
            assertThat(toSettle.enquirerName()).isNotBlank();
        });
        assertThat(enquiryService.callsToSettle(managerB, property)).isEmpty();
        // The owner may settle it, but did not make it and does not handle it, so is not asked.
        assertThat(enquiryService.callsToSettle(owner, property)).isEmpty();
    }

    @Test
    void onceSomeoneHandlesItTheOtherManagersCannotActAndTheOwnerStillCan() {
        UUID enquiry = raise(enquirers.get(0));
        EnquiryDetailResponse called = enquiryService.respond(managerA, enquiry, call(null));

        assertThatThrownBy(() -> enquiryService.respond(managerB, enquiry, chat()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Someone else is handling");
        assertThatThrownBy(() -> enquiryService.settleAttempt(
                managerB, enquiry, called.callToSettleId(),
                new SettleEnquiryAttemptRequest(EnquiryAttemptOutcome.SUCCEEDED, null)))
                .isInstanceOf(ValidationException.class);

        // The owner opening the chat does not take the enquiry away from its handler.
        EnquiryDetailResponse byOwner = enquiryService.respond(owner, enquiry, chat());
        assertThat(byOwner.handlerUserId()).isEqualTo(managerA);
        assertThat(byOwner.viewerMayAct()).isTrue();
    }

    @Test
    void emailIsRefusedAsAWayToRespond() {
        UUID enquiry = raise(enquirers.get(0));

        assertThatThrownBy(() -> enquiryService.respond(
                managerA, enquiry, new RespondToEnquiryRequest(EnquiryResponseChannel.EMAIL, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Email is no longer");
        assertThat(attempts.findByEnquiryIdInOrderByCreatedAtDesc(List.of(enquiry))).isEmpty();
    }

    /**
     * "Record response": the four answers. The first two fail the call, the
     * accepted two succeed and set the handler's reading of the enquirer, and
     * the result and duration are kept for the action log (2026-10-03).
     */
    @Test
    void recordingACallsResponseKeepsHowItWentAndSetsTheSentiment() {
        UUID enquiry = raise(enquirers.get(0));

        EnquiryDetailResponse first = enquiryService.respond(managerA, enquiry, call(null));
        EnquiryDetailResponse rejected = enquiryService.settleAttempt(managerA, enquiry, first.callToSettleId(),
                new SettleEnquiryAttemptRequest(null, null, EnquiryCallResult.REJECTED, null));
        assertThat(rejected.status()).isEqualTo(EnquiryStatus.NEW);
        assertThat(rejected.sentiment()).isNull();
        assertThat(rejected.callToSettleId()).isNull();
        assertThat(rejected.responses()).singleElement().satisfies(attempt -> {
            assertThat(attempt.outcome()).isEqualTo(EnquiryAttemptOutcome.FAILED);
            assertThat(attempt.callResult()).isEqualTo(EnquiryCallResult.REJECTED);
        });

        // Settled, so they can call again. This time they pick up and are interested.
        EnquiryDetailResponse second = enquiryService.respond(managerA, enquiry, call(null));
        EnquiryDetailResponse accepted = enquiryService.settleAttempt(managerA, enquiry, second.callToSettleId(),
                new SettleEnquiryAttemptRequest(null, "Wants a double AC room", EnquiryCallResult.ACCEPTED_INTERESTED, 750));

        assertThat(accepted.status()).isEqualTo(EnquiryStatus.RESPONDED);
        assertThat(accepted.respondedAt()).isNotNull();
        assertThat(accepted.sentiment()).isEqualTo(EnquirySentiment.INTERESTED);
        assertThat(accepted.responses().get(0)).satisfies(attempt -> {
            assertThat(attempt.outcome()).isEqualTo(EnquiryAttemptOutcome.SUCCEEDED);
            assertThat(attempt.callResult()).isEqualTo(EnquiryCallResult.ACCEPTED_INTERESTED);
            assertThat(attempt.durationSeconds()).isEqualTo(750);
            assertThat(attempt.note()).isEqualTo("Wants a double AC room");
        });

        // Accepted but not interested: a success, and the sentiment says so.
        UUID other = raise(enquirers.get(1));
        EnquiryDetailResponse third = enquiryService.respond(managerA, other, call(null));
        EnquiryDetailResponse notInterested = enquiryService.settleAttempt(managerA, other, third.callToSettleId(),
                new SettleEnquiryAttemptRequest(null, "Budget is lower", EnquiryCallResult.ACCEPTED_NOT_INTERESTED, null));
        assertThat(notInterested.status()).isEqualTo(EnquiryStatus.RESPONDED);
        assertThat(notInterested.sentiment()).isEqualTo(EnquirySentiment.NOT_INTERESTED);

        // An answer that contradicts itself, or a call longer than a day, is refused.
        UUID third2 = raise(enquirers.get(2));
        EnquiryDetailResponse fourth = enquiryService.respond(managerA, third2, call(null));
        assertThatThrownBy(() -> enquiryService.settleAttempt(managerA, third2, fourth.callToSettleId(),
                new SettleEnquiryAttemptRequest(EnquiryAttemptOutcome.FAILED, null, EnquiryCallResult.ACCEPTED_INTERESTED, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("disagree");
        assertThatThrownBy(() -> enquiryService.settleAttempt(managerA, third2, fourth.callToSettleId(),
                new SettleEnquiryAttemptRequest(null, null, EnquiryCallResult.ACCEPTED_INTERESTED, 90_000)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("at most 23 hours");
    }

    // ---- A chat ----------------------------------------------------------

    @Test
    void aChatIsPendingUntilTheEnquirerRepliesAndTheHandlerIsToldWhenTheyDo() {
        UUID enquirer = enquirers.get(0);
        UUID enquiry = raise(enquirer);

        // Opening the conversation says nothing yet, so it is not an attempt.
        EnquiryDetailResponse opened = enquiryService.respond(managerA, enquiry, chat());
        assertThat(opened.chatThreadId()).isEqualTo(thread);
        assertThat(opened.responses()).isEmpty();
        assertThat(opened.handlerUserId()).isNull();

        // The first message is the attempt, and makes its author the handler.
        enquiryService.onChatMessage(message(enquiry, managerA));
        EnquiryResponse pending = openChat(enquiry);
        assertThat(pending.getRespondedByUserId()).isEqualTo(managerA);
        assertThat(enquiries.findById(enquiry).orElseThrow().getHandlerUserId()).isEqualTo(managerA);

        // More messages are the same attempt, not new ones.
        enquiryService.onChatMessage(message(enquiry, managerA));
        assertThat(attempts.findByEnquiryIdInOrderByCreatedAtDesc(List.of(enquiry))).hasSize(1);

        // A pending chat never blocks a call. The two channels are independent.
        EnquiryDetailResponse called = enquiryService.respond(managerA, enquiry, call(null));
        assertThat(called.callToSettleId()).isNotNull();
        assertThat(called.status()).isEqualTo(EnquiryStatus.NEW);

        reset(notifications);
        enquiryService.onChatMessage(message(enquiry, enquirer));

        Enquiry answered = enquiries.findById(enquiry).orElseThrow();
        assertThat(answered.getStatus()).isEqualTo(EnquiryStatus.RESPONDED);
        assertThat(answered.getRespondedAt()).isNotNull();
        assertThat(attempts.findById(pending.getId()).orElseThrow().getOutcome())
                .isEqualTo(EnquiryAttemptOutcome.SUCCEEDED);
        verifyToldOnce(managerA, NotificationSubtype.ENQUIRY_CHAT_REPLIED, "has responded over enquiry chat");

        // The same reply delivered again, and a later reply, change nothing and tell nobody.
        reset(notifications);
        enquiryService.onChatMessage(message(enquiry, enquirer));
        enquiryService.onChatMessage(message(enquiry, managerA));
        verifyToldNobody();
        assertThat(attempts.findByEnquiryIdInOrderByCreatedAtDesc(List.of(enquiry))).hasSize(2);
    }

    /** Events can arrive out of order. A reply already handled must not leave the chat pending for ever. */
    @Test
    void aReplyHeardBeforeTheMessageItAnswersStillCounts() {
        UUID enquirer = enquirers.get(0);
        UUID enquiry = raise(enquirer);
        enquiryService.respond(managerA, enquiry, chat());

        // The reply is told about first. Nothing is open, so nothing happens.
        enquiryService.onChatMessage(message(enquiry, enquirer));
        assertThat(enquiries.findById(enquiry).orElseThrow().getStatus()).isEqualTo(EnquiryStatus.NEW);

        // Then the message it answered. The chat module confirms the reply exists.
        when(chat.hasWrittenSince(eq(thread), eq(enquirer), any())).thenReturn(true);
        enquiryService.onChatMessage(message(enquiry, managerA));

        assertThat(enquiries.findById(enquiry).orElseThrow().getStatus()).isEqualTo(EnquiryStatus.RESPONDED);
        assertThat(attempts.findByEnquiryIdInOrderByCreatedAtDesc(List.of(enquiry)))
                .singleElement()
                .satisfies(attempt -> assertThat(attempt.getOutcome()).isEqualTo(EnquiryAttemptOutcome.SUCCEEDED));
        verifyToldOnce(managerA, NotificationSubtype.ENQUIRY_CHAT_REPLIED, "has responded over enquiry chat");
    }

    @Test
    void aMessageFromAManagerWhoDoesNotHandleItIsNotAnAttempt() {
        UUID enquiry = raise(enquirers.get(0));
        enquiryService.respond(managerA, enquiry, call(null));

        enquiryService.onChatMessage(message(enquiry, managerB));

        assertThat(attempts.findByEnquiryIdAndChannelAndOutcome(
                enquiry, EnquiryResponseChannel.CHAT, EnquiryAttemptOutcome.OPEN)).isEmpty();
        assertThat(enquiries.findById(enquiry).orElseThrow().getHandlerUserId()).isEqualTo(managerA);
    }

    // ---- How the handler is chosen ---------------------------------------

    @Test
    void firstToRespondTellsEveryoneAndGivesItToNobodyOnArrival() {
        UUID enquiry = raise(enquirers.get(0));

        assertThat(enquiries.findById(enquiry).orElseThrow().hasHandler()).isFalse();
        verify(notifications).notifyUsers(
                eq(Set.of(owner, managerA, managerB)), anyString(), anyString(), any(), any(),
                eq(NotificationSubtype.ENQUIRY_RECEIVED), eq(enquiry), any(), any());
    }

    @Test
    void systemTurnsGiveEachManagerAnEvenShareAndTellOnlyTheOneChosen() {
        handlerService.choose(owner, property, new EnquiryHandlerSettingsRequest(EnquiryHandlerMode.SYSTEM_TURNS, false));

        Map<UUID, Integer> share = new HashMap<>();
        for (UUID enquirer : enquirers) {
            Enquiry raised = enquiries.findById(raise(enquirer)).orElseThrow();
            assertThat(raised.getHandlerAssignedBy()).isEqualTo(EnquiryHandlerAssignment.SYSTEM);
            share.merge(raised.getHandlerUserId(), 1, Integer::sum);
        }

        // Four enquiries, two managers, the owner not taking turns: two each.
        assertThat(share).containsOnlyKeys(managerA, managerB);
        assertThat(share.values()).containsOnly(2);
        verify(notifications, times(2)).notifyUser(
                eq(managerA), anyString(), contains("The system gave this enquiry to you"), any(), any(),
                eq(NotificationSubtype.ENQUIRY_ASSIGNED), any(), any(), any());
        verify(notifications, never()).notifyUsers(any(), anyString(), anyString(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void systemTurnsIncludeTheOwnerOnlyWhenTheOwnerOptsIn() {
        handlerService.choose(owner, property, new EnquiryHandlerSettingsRequest(EnquiryHandlerMode.SYSTEM_TURNS, true));

        Map<UUID, Integer> share = new HashMap<>();
        for (UUID enquirer : enquirers.subList(0, 3)) {
            share.merge(enquiries.findById(raise(enquirer)).orElseThrow().getHandlerUserId(), 1, Integer::sum);
        }

        assertThat(share).containsOnlyKeys(owner, managerA, managerB);
    }

    @Test
    void whereTheOwnerAssignsManagersWaitUntilItIsGivenToThem() {
        handlerService.choose(owner, property, new EnquiryHandlerSettingsRequest(EnquiryHandlerMode.OWNER_ASSIGNS, false));
        UUID enquiry = raise(enquirers.get(0));

        // Only the owner hears of it, and only the owner may act on it.
        verify(notifications).notifyUsers(
                eq(Set.of(owner)), anyString(), anyString(), any(), any(),
                eq(NotificationSubtype.ENQUIRY_RECEIVED), eq(enquiry), any(), any());
        assertThatThrownBy(() -> enquiryService.respond(managerA, enquiry, call(null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("The owner assigns enquiries");
        assertThat(enquiryService.countsForProperty(owner, property))
                .isEqualTo(new EnquiryCountsResponse(1, 0, 1));

        // The daily reminder names how many are waiting.
        reset(notifications);
        assertThat(unassignedReminder.remindOwners(Instant.now())).isGreaterThanOrEqualTo(1);
        verifyToldOnce(owner, NotificationSubtype.ENQUIRY_UNASSIGNED, "1 enquiry for");

        reset(notifications);
        EnquiryDetailResponse assigned =
                enquiryService.assign(owner, enquiry, new AssignEnquiryHandlerRequest(managerA));

        assertThat(assigned.handlerUserId()).isEqualTo(managerA);
        assertThat(assigned.handlerAssignedBy()).isEqualTo(EnquiryHandlerAssignment.OWNER);
        verifyToldOnce(managerA, NotificationSubtype.ENQUIRY_ASSIGNED, "You now handle");
        assertThat(enquiryService.respond(managerA, enquiry, call(null)).callToSettleId()).isNotNull();

        // It is on the handler's own list and on nobody else's. Nothing is left to remind about.
        assertThat(mine(managerA).items()).extracting(EnquiryDetailResponse::id).containsExactly(enquiry);
        assertThat(mine(managerB).items()).isEmpty();
        assertThat(enquiryService.countsForProperty(managerA, property))
                .isEqualTo(new EnquiryCountsResponse(1, 1, 0));
        reset(notifications);
        unassignedReminder.remindOwners(Instant.now());
        verify(notifications, never()).notifyUser(
                eq(owner), anyString(), anyString(), any(), any(), any(), any(), any(), any());
    }

    /**
     * Every assignment tells the new handler in-app, however it came about
     * (owner's rule, 2026-10-03). Taking it by responding first, or the owner
     * giving it to themselves, is in-app only. Given by someone else, pushed too.
     */
    @Test
    void everyWayAnEnquiryGetsItsHandlerTellsTheHandler() {
        // First to respond, by a call. A later call is not a new assignment.
        UUID byCall = raise(enquirers.get(0));
        reset(notifications);
        EnquiryDetailResponse called = enquiryService.respond(managerA, byCall, call(null));
        verifyAssignedNotice(managerA, "since you responded to it first", NotificationDeliveryMode.IN_APP_ONLY);
        enquiryService.settleAttempt(managerA, byCall, called.callToSettleId(),
                new SettleEnquiryAttemptRequest(EnquiryAttemptOutcome.FAILED, null));
        reset(notifications);
        enquiryService.respond(managerA, byCall, call(null));
        verifyToldNobody();

        // First to respond, by the first chat message. A repeat delivery tells nobody again.
        UUID byChat = raise(enquirers.get(1));
        enquiryService.respond(managerB, byChat, chat());
        reset(notifications);
        enquiryService.onChatMessage(message(byChat, managerB));
        verifyAssignedNotice(managerB, "since you responded to it first", NotificationDeliveryMode.IN_APP_ONLY);
        reset(notifications);
        enquiryService.onChatMessage(message(byChat, managerB));
        verifyToldNobody();

        // The owner giving it to someone else, and then taking it themselves.
        UUID byOwner = raise(enquirers.get(2));
        reset(notifications);
        enquiryService.assign(owner, byOwner, new AssignEnquiryHandlerRequest(managerA));
        verifyAssignedNotice(managerA, "You now handle", NotificationDeliveryMode.IN_APP_AND_PUSH);
        reset(notifications);
        enquiryService.assign(owner, byOwner, new AssignEnquiryHandlerRequest(owner));
        verifyAssignedNotice(owner, "You now handle", NotificationDeliveryMode.IN_APP_ONLY);
    }

    /**
     * Switching Auto assigned on hands out what is already waiting, in turn,
     * and tells each handler (user, 2026-10-03). Before, only new arrivals got
     * one, and the waiting ones sat in All enquiries.
     */
    @Test
    void switchingAutoAssignOnHandsOutTheEnquiriesAlreadyWaiting() {
        enquiryService.chooseHandlerSettings(
                owner, property, new EnquiryHandlerSettingsRequest(EnquiryHandlerMode.OWNER_ASSIGNS, false));
        UUID first = raise(enquirers.get(0));
        UUID second = raise(enquirers.get(1));
        assertThat(enquiries.findById(first).orElseThrow().hasHandler()).isFalse();

        reset(notifications);
        enquiryService.changeHandlerSettings(
                owner, property, new EnquiryHandlerSettingsRequest(EnquiryHandlerMode.SYSTEM_TURNS, false));

        Enquiry firstNow = enquiries.findById(first).orElseThrow();
        Enquiry secondNow = enquiries.findById(second).orElseThrow();
        assertThat(List.of(firstNow.getHandlerUserId(), secondNow.getHandlerUserId()))
                .containsExactlyInAnyOrder(managerA, managerB);
        assertThat(firstNow.getHandlerAssignedBy()).isEqualTo(EnquiryHandlerAssignment.SYSTEM);
        verify(notifications, times(2)).notifyUser(
                any(), eq("Enquiry assigned to you"), contains("The system gave this enquiry to you"), any(), any(),
                eq(NotificationSubtype.ENQUIRY_ASSIGNED), any(), any(), eq(NotificationDeliveryMode.IN_APP_AND_PUSH));
    }

    /** With no managers, the owner takes everything waiting, told in-app only: they made the switch. */
    @Test
    void withNoManagersTheOwnerTakesWhatIsWaiting() {
        UUID waiting = raise(enquirers.get(0));
        jdbc.update("UPDATE property.property_managers SET is_active = false WHERE property_id = ?", property);

        reset(notifications);
        enquiryService.chooseHandlerSettings(
                owner, property, new EnquiryHandlerSettingsRequest(EnquiryHandlerMode.SYSTEM_TURNS, false));

        assertThat(enquiries.findById(waiting).orElseThrow().getHandlerUserId()).isEqualTo(owner);
        verify(notifications).notifyUser(
                eq(owner), eq("Enquiry assigned to you"), contains("The system gave this enquiry to you"), any(), any(),
                eq(NotificationSubtype.ENQUIRY_ASSIGNED), eq(waiting), any(), eq(NotificationDeliveryMode.IN_APP_ONLY));
    }

    @Test
    void onlyTheOwnerAssignsAndOnlyToSomeoneInManagement() {
        UUID enquiry = raise(enquirers.get(0));

        assertThatThrownBy(() -> enquiryService.assign(managerA, enquiry, new AssignEnquiryHandlerRequest(managerA)))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> enquiryService.assign(
                owner, enquiry, new AssignEnquiryHandlerRequest(enquirers.get(1))))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("a manager of this property");
        assertThat(enquiries.findById(enquiry).orElseThrow().hasHandler()).isFalse();
    }

    @Test
    void theModeIsChosenOnceAndChangedAfterThat() {
        assertThat(handlerService.settings(managerA, property).configured()).isFalse();
        assertThat(handlerService.settings(managerA, property).mode()).isEqualTo(EnquiryHandlerMode.FIRST_RESPONSE);

        handlerService.choose(owner, property, new EnquiryHandlerSettingsRequest(EnquiryHandlerMode.OWNER_ASSIGNS, false));

        // A second first-choice is a screen that loaded "never chosen" and is now out of date.
        assertThatThrownBy(() -> handlerService.choose(
                owner, property, new EnquiryHandlerSettingsRequest(EnquiryHandlerMode.SYSTEM_TURNS, false)))
                .isInstanceOf(StaleVersionException.class);

        handlerService.change(owner, property, new EnquiryHandlerSettingsRequest(EnquiryHandlerMode.SYSTEM_TURNS, true));

        assertThat(handlerService.settings(owner, property)).satisfies(settings -> {
            assertThat(settings.mode()).isEqualTo(EnquiryHandlerMode.SYSTEM_TURNS);
            assertThat(settings.includeOwner()).isTrue();
            assertThat(settings.configured()).isTrue();
        });
        // A manager can read the mode and cannot set it.
        assertThatThrownBy(() -> handlerService.change(
                managerA, property, new EnquiryHandlerSettingsRequest(EnquiryHandlerMode.FIRST_RESPONSE, false)))
                .isInstanceOf(RuntimeException.class);
    }

    // ---- Lists -----------------------------------------------------------

    @Test
    void thePropertyListShowsEverythingAndMyListOnlyWhatIHandle() {
        UUID first = raise(enquirers.get(0));
        UUID second = raise(enquirers.get(1));
        UUID third = raise(enquirers.get(2));
        enquiryService.respond(managerA, first, call(null));
        enquiryService.respond(managerB, second, call(null));

        PageResponse<EnquiryDetailResponse> all =
                enquiryService.pageForProperty(managerA, property, EnquiryListScope.ALL, 0, 2);

        assertThat(all.totalElements()).isEqualTo(3);
        assertThat(all.items()).hasSize(2);
        assertThat(all.hasNext()).isTrue();
        // Newest first.
        assertThat(all.items().get(0).id()).isEqualTo(third);

        assertThat(mine(managerA).items()).extracting(EnquiryDetailResponse::id).containsExactly(first);
        assertThat(mine(managerB).items()).extracting(EnquiryDetailResponse::id).containsExactly(second);
        assertThat(mine(owner).items()).isEmpty();

        // On the shared list a manager sees what they may and may not act on.
        Map<UUID, Boolean> mayAct = new HashMap<>();
        enquiryService.pageForProperty(managerA, property, EnquiryListScope.ALL, 0, 20).items()
                .forEach(item -> mayAct.put(item.id(), item.viewerMayAct()));
        assertThat(mayAct).containsEntry(first, true).containsEntry(second, false).containsEntry(third, true);
    }

    // ---- Endings ---------------------------------------------------------

    @Test
    void expiryFailsWhateverWasLeftOpen() {
        UUID enquirer = enquirers.get(0);
        UUID enquiry = raise(enquirer);
        enquiryService.respond(managerA, enquiry, call(null));
        enquiryService.respond(managerA, enquiry, chat());
        enquiryService.onChatMessage(message(enquiry, managerA));
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), enquiry);

        sweep();

        assertThat(enquiries.findById(enquiry).orElseThrow().getStatus()).isEqualTo(EnquiryStatus.EXPIRED);
        // Tried, never reached: the tenant did not respond.
        assertThat(enquiries.findById(enquiry).orElseThrow().getEndReason())
                .isEqualTo(EnquiryEndReason.TENANT_DID_NOT_RESPOND);
        assertThat(attempts.findByEnquiryIdInOrderByCreatedAtDesc(List.of(enquiry)))
                .hasSize(2)
                .allSatisfy(attempt -> {
                    assertThat(attempt.getOutcome()).isEqualTo(EnquiryAttemptOutcome.FAILED);
                    assertThat(attempt.getSettledAt()).isNotNull();
                });
        // The enquirer is free to ask again.
        assertThat(raise(enquirer)).isNotEqualTo(enquiry);
    }

    /**
     * Nobody tried: the handler did not respond. Every enquiry stays listed for
     * the year it was raised in, on the property's list and the enquirer's own
     * (user, 2026-10-03).
     */
    @Test
    void anUntriedEnquirySaysWhyItRanOutAndStaysListedForTheYear() {
        UUID enquirer = enquirers.get(1);
        UUID untried = raise(enquirer);
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), untried);

        sweep();

        assertThat(enquiries.findById(untried).orElseThrow().getEndReason())
                .isEqualTo(EnquiryEndReason.HANDLER_DID_NOT_RESPOND);

        // Listed for the rest of the year it was raised in, however long past
        // its date (user, 2026-10-03), on the property's list and their own.
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minus(Duration.ofDays(31))), untried);
        assertThat(enquiryService.listForProperty(owner, property))
                .extracting(EnquiryDetailResponse::id).contains(untried);
        assertThat(enquiryService.myEnquiries(enquirer))
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.id()).isEqualTo(untried);
                    assertThat(item.state()).isEqualTo(MyEnquiryState.EXPIRED);
                });

        // Raised last year: gone from both.
        jdbc.update("UPDATE enquiry.enquiries SET created_at = ? WHERE id = ?",
                Timestamp.from(java.time.Year.now(java.time.ZoneId.of("Asia/Kolkata")).atDay(1)
                        .atStartOfDay(java.time.ZoneId.of("Asia/Kolkata")).toInstant().minus(Duration.ofDays(1))),
                untried);
        assertThat(enquiryService.listForProperty(owner, property))
                .extracting(EnquiryDetailResponse::id).doesNotContain(untried);
        assertThat(enquiryService.myEnquiries(enquirer)).isEmpty();
    }

    @Test
    void aManagerWhoLeavesHandsTheirEnquiriesToTheOwner() {
        UUID withCall = raise(enquirers.get(0));
        UUID withChat = raise(enquirers.get(1));
        UUID someoneElses = raise(enquirers.get(2));
        enquiryService.respond(managerA, withCall, call(null));
        enquiryService.respond(managerA, withChat, chat());
        enquiryService.onChatMessage(message(withChat, managerA));
        enquiryService.respond(managerB, someoneElses, call(null));
        jdbc.update("UPDATE property.property_managers SET is_active = false WHERE property_id = ? AND manager_user_id = ?",
                property, managerA);

        reset(notifications);
        enquiryService.onManagerRemoved(property, managerA);

        for (UUID theirs : List.of(withCall, withChat)) {
            Enquiry returned = enquiries.findById(theirs).orElseThrow();
            assertThat(returned.getHandlerUserId()).isEqualTo(owner);
            assertThat(returned.getHandlerAssignedBy()).isEqualTo(EnquiryHandlerAssignment.SYSTEM);
        }
        assertThat(enquiries.findById(someoneElses).orElseThrow().getHandlerUserId()).isEqualTo(managerB);
        // Nobody left can say how the call went, so it is closed. The chat can still be answered.
        assertThat(attempts.findByEnquiryIdInOrderByCreatedAtDesc(List.of(withCall)))
                .singleElement()
                .satisfies(call -> assertThat(call.getOutcome()).isEqualTo(EnquiryAttemptOutcome.FAILED));
        assertThat(openChat(withChat)).isNotNull();
        verifyToldOnce(owner, NotificationSubtype.ENQUIRY_ASSIGNED, "Their 2 enquiries are now yours");

        // The event can arrive twice. The second time there is nothing left to return.
        reset(notifications);
        enquiryService.onManagerRemoved(property, managerA);
        verifyToldNobody();
    }

    // ---- Helpers ---------------------------------------------------------

    /** Raises an enquiry from someone who agreed to be called. */
    private UUID raise(UUID enquirer) {
        consentService.replace(enquirer,
                new UpdateEnquiryChannelConsentsRequest(Set.of(EnquiryResponseChannel.CALL_BACK), true));
        return enquiryService.raise(enquirer, property, new RaiseEnquiryRequest("Is a single room free?")).enquiryId();
    }

    private PageResponse<EnquiryDetailResponse> mine(UUID viewer) {
        return enquiryService.pageForProperty(viewer, property, EnquiryListScope.MINE, 0, 20);
    }

    private EnquiryResponse openChat(UUID enquiry) {
        return attempts.findByEnquiryIdAndChannelAndOutcome(
                enquiry, EnquiryResponseChannel.CHAT, EnquiryAttemptOutcome.OPEN).orElseThrow();
    }

    private ChatMessageSentEvent message(UUID enquiry, UUID sender) {
        return new ChatMessageSentEvent(thread, property, ChatThreadOrigin.ENQUIRY, enquiry, sender, Instant.now());
    }

    private static RespondToEnquiryRequest call(String note) {
        return new RespondToEnquiryRequest(EnquiryResponseChannel.CALL_BACK, note);
    }

    private static RespondToEnquiryRequest chat() {
        return new RespondToEnquiryRequest(EnquiryResponseChannel.CHAT, null);
    }

    private void verifyToldOnce(UUID user, NotificationSubtype subtype, String bodyPart) {
        verify(notifications, times(1)).notifyUser(
                eq(user), anyString(), contains(bodyPart), any(), any(), eq(subtype), any(), any(), any());
    }

    private void verifyAssignedNotice(UUID user, String bodyPart, NotificationDeliveryMode delivery) {
        verify(notifications, times(1)).notifyUser(
                eq(user), eq("Enquiry assigned to you"), contains(bodyPart), any(), any(),
                eq(NotificationSubtype.ENQUIRY_ASSIGNED), any(), any(), eq(delivery));
    }

    /**
     * Runs the expiry sweep now. Its ShedLock is held at least 15 seconds, so a
     * second test calling it inside that would be skipped without a word: the
     * lock is released first. Released, not deleted: ShedLock remembers the row
     * exists and only ever updates it.
     */
    private void sweep() {
        jdbc.update("UPDATE public.shedlock SET lock_until = TIMESTAMP '2000-01-01' WHERE name = 'enquiry-expireStale'");
        expirySweep.expireStaleEnquiries();
    }

    private void verifyToldNobody() {
        verify(notifications, never()).notifyUser(
                any(), anyString(), anyString(), any(), any(), any(), any(), any(), any());
    }

    private UUID manager(String name) {
        UUID id = UUID.randomUUID();
        String phone = "+9197" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
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
