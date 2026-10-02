package com.khatiyan.d_modules.enquiry.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerAssignment;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerMode;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerSettings;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponse;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;

/**
 * Who may act on an enquiry, whose turn it is, and what an attempt is.
 *
 * <p>The rules the owner set on 2026-10-02, each stated as a test. They are
 * pure: no database, no Spring. The flows that need both are in
 * {@code EnquiryAttemptsIntegrationTest}.
 */
class EnquiryHandlerRulesTest {

    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID MANAGER = UUID.randomUUID();
    private static final UUID OTHER_MANAGER = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-03T06:00:00Z");

    private static Enquiry enquiry() {
        return Enquiry.raise(
                UUID.randomUUID(), UUID.randomUUID(), "Is a single room free?",
                EnumSet.of(EnquiryResponseChannel.CALL_BACK));
    }

    private static Enquiry handledBy(UUID handler) {
        Enquiry enquiry = enquiry();
        enquiry.assignHandler(handler, EnquiryHandlerAssignment.FIRST_RESPONSE, null, NOW);
        return enquiry;
    }

    // ---- Who may act -----------------------------------------------------

    @Test
    void anyManagerMayActOnAnEnquiryNobodyHandlesInFirstToRespond() {
        assertThat(EnquiryHandlerService.mayAct(MANAGER, enquiry(), OWNER, EnquiryHandlerMode.FIRST_RESPONSE)).isTrue();
    }

    @Test
    void onlyTheHandlerAndTheOwnerMayActOnceSomeoneHandlesIt() {
        Enquiry enquiry = handledBy(MANAGER);

        for (EnquiryHandlerMode mode : EnquiryHandlerMode.values()) {
            assertThat(EnquiryHandlerService.mayAct(MANAGER, enquiry, OWNER, mode)).as("handler, %s", mode).isTrue();
            assertThat(EnquiryHandlerService.mayAct(OWNER, enquiry, OWNER, mode)).as("owner, %s", mode).isTrue();
            assertThat(EnquiryHandlerService.mayAct(OTHER_MANAGER, enquiry, OWNER, mode))
                    .as("another manager, %s", mode).isFalse();
        }
    }

    /** Until the owner gives it to someone, nobody but the owner may touch it. */
    @Test
    void aManagerMayNotActOnAnUnassignedEnquiryWhereTheOwnerAssigns() {
        assertThat(EnquiryHandlerService.mayAct(MANAGER, enquiry(), OWNER, EnquiryHandlerMode.OWNER_ASSIGNS)).isFalse();
        assertThat(EnquiryHandlerService.mayAct(OWNER, enquiry(), OWNER, EnquiryHandlerMode.OWNER_ASSIGNS)).isTrue();
    }

    /**
     * An enquiry raised before the property switched to system turns has no
     * handler. It must not be stuck: anyone may still take it.
     */
    @Test
    void anUnassignedEnquiryLeftFromBeforeSystemTurnsIsOpenToAll() {
        assertThat(EnquiryHandlerService.mayAct(MANAGER, enquiry(), OWNER, EnquiryHandlerMode.SYSTEM_TURNS)).isTrue();
    }

    // ---- Whose turn ------------------------------------------------------

    /** Ten enquiries between three people: nobody is ever more than one ahead. */
    @Test
    void systemTurnsGiveEveryoneAnEvenShare() {
        EnquiryHandlerSettings settings =
                EnquiryHandlerSettings.choose(UUID.randomUUID(), EnquiryHandlerMode.SYSTEM_TURNS, false);
        List<UUID> people = inOrder(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());

        Map<UUID, Integer> share = new HashMap<>();
        for (int i = 0; i < 10; i++) {
            share.merge(settings.takeNextTurn(people), 1, Integer::sum);
        }

        assertThat(share).hasSize(3);
        assertThat(share.values()).allMatch(count -> count == 3 || count == 4);
    }

    /**
     * The pointer names a person, not a position. When they leave, the next
     * turn goes to whoever follows them in the order, and nobody is skipped or
     * served twice in a row.
     */
    @Test
    void turnsStayEvenWhenTheLastPersonServedLeaves() {
        EnquiryHandlerSettings settings =
                EnquiryHandlerSettings.choose(UUID.randomUUID(), EnquiryHandlerMode.SYSTEM_TURNS, false);
        List<UUID> three = inOrder(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());

        assertThat(settings.takeNextTurn(three)).isEqualTo(three.get(0));
        assertThat(settings.takeNextTurn(three)).isEqualTo(three.get(1));

        // The second person, who was served last, leaves.
        List<UUID> two = List.of(three.get(0), three.get(2));

        assertThat(settings.takeNextTurn(two)).isEqualTo(three.get(2));
        assertThat(settings.takeNextTurn(two)).isEqualTo(three.get(0));
    }

    @Test
    void aTurnWithNobodyEligibleGoesToNobody() {
        EnquiryHandlerSettings settings =
                EnquiryHandlerSettings.choose(UUID.randomUUID(), EnquiryHandlerMode.SYSTEM_TURNS, false);

        assertThat(settings.takeNextTurn(List.of())).isNull();
    }

    // ---- What an attempt is ----------------------------------------------

    /** Tapping Call is not an answer. The enquiry stays unanswered until the call is settled as a success. */
    @Test
    void anAttemptStartsOpenAndAnswersNothing() {
        Enquiry enquiry = enquiry();
        EnquiryResponse call = EnquiryResponse.attempt(enquiry.getId(), EnquiryResponseChannel.CALL_BACK, MANAGER);

        assertThat(call.isOpen()).isTrue();
        assertThat(call.getSettledAt()).isNull();
        assertThat(enquiry.getStatus()).isEqualTo(EnquiryStatus.NEW);
    }

    @Test
    void aFailedAttemptKeepsItsReason() {
        EnquiryResponse call = EnquiryResponse.attempt(UUID.randomUUID(), EnquiryResponseChannel.CALL_BACK, MANAGER);

        call.settle(EnquiryAttemptOutcome.FAILED, "  Call did not connect  ", NOW);

        assertThat(call.getOutcome()).isEqualTo(EnquiryAttemptOutcome.FAILED);
        assertThat(call.getNote()).isEqualTo("Call did not connect");
        assertThat(call.getSettledAt()).isEqualTo(NOW);
    }

    /** The note is optional both ways, and settling without one keeps what was written at the start. */
    @Test
    void settlingWithoutANoteKeepsTheOneWrittenAtTheStart() {
        EnquiryResponse call = EnquiryResponse.attempt(UUID.randomUUID(), EnquiryResponseChannel.CALL_BACK, MANAGER)
                .withNote("Ask about the AC room");

        call.settle(EnquiryAttemptOutcome.SUCCEEDED, null, NOW);

        assertThat(call.succeeded()).isTrue();
        assertThat(call.getNote()).isEqualTo("Ask about the AC room");
    }

    @Test
    void anAttemptIsSettledOnce() {
        EnquiryResponse call = EnquiryResponse.attempt(UUID.randomUUID(), EnquiryResponseChannel.CALL_BACK, MANAGER);
        call.settle(EnquiryAttemptOutcome.FAILED, null, NOW);

        assertThatThrownBy(() -> call.settle(EnquiryAttemptOutcome.SUCCEEDED, null, NOW))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already settled");
    }

    @Test
    void anAttemptCannotBeSettledAsStillOpen() {
        EnquiryResponse call = EnquiryResponse.attempt(UUID.randomUUID(), EnquiryResponseChannel.CALL_BACK, MANAGER);

        assertThatThrownBy(() -> call.settle(EnquiryAttemptOutcome.OPEN, null, NOW))
                .isInstanceOf(ValidationException.class);
    }

    /** Email cannot be tracked, so it cannot be an attempt. */
    @Test
    void emailIsNotAnAttempt() {
        assertThatThrownBy(() -> EnquiryResponse.attempt(UUID.randomUUID(), EnquiryResponseChannel.EMAIL, MANAGER))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Email is no longer");
    }

    /** The first success answers the enquiry and fixes the moment. A later one changes nothing. */
    @Test
    void theEnquiryIsAnsweredOnceAtTheFirstSuccess() {
        Enquiry enquiry = enquiry();

        assertThat(enquiry.markResponded(NOW)).isTrue();
        assertThat(enquiry.markResponded(NOW.plusSeconds(3600))).isFalse();

        assertThat(enquiry.getStatus()).isEqualTo(EnquiryStatus.RESPONDED);
        assertThat(enquiry.getRespondedAt()).isEqualTo(NOW);
    }

    // ---- Who says how a call went ----------------------------------------

    @Test
    void theCallerTheHandlerAndTheOwnerMaySettleACall() {
        // The owner moved the enquiry on after MANAGER called.
        Enquiry enquiry = handledBy(OTHER_MANAGER);
        EnquiryResponse call = EnquiryResponse.attempt(enquiry.getId(), EnquiryResponseChannel.CALL_BACK, MANAGER);

        assertThat(EnquiryService.maySettle(MANAGER, call, enquiry, OWNER)).as("the caller").isTrue();
        assertThat(EnquiryService.maySettle(OTHER_MANAGER, call, enquiry, OWNER)).as("the handler").isTrue();
        assertThat(EnquiryService.maySettle(OWNER, call, enquiry, OWNER)).as("the owner").isTrue();
        assertThat(EnquiryService.maySettle(UUID.randomUUID(), call, enquiry, OWNER)).as("anyone else").isFalse();
    }

    private static List<UUID> inOrder(UUID... ids) {
        return new ArrayList<>(new TreeSet<>(List.of(ids)));
    }
}
