package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.booking.model.BookingAssignmentMode;

/** Who handles a booking request. Pure rules; no database and no property module. */
class BookingHandlerRulesTest {

    // In id order, which is the order turns are taken in.
    private static final UUID OWNER = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID ANITA = UUID.fromString("00000000-0000-0000-0000-00000000000a");
    private static final UUID BILAL = UUID.fromString("00000000-0000-0000-0000-00000000000b");
    private static final UUID CHITRA = UUID.fromString("00000000-0000-0000-0000-00000000000c");
    private static final UUID STRANGER = UUID.fromString("00000000-0000-0000-0000-0000000000ff");
    private static final Set<UUID> GRANTED = Set.of(ANITA, BILAL);

    @Test
    void theOwnerMayAlwaysActAndAManagerOnlyOnTheirOwn() {
        for (UUID handler : new UUID[]{null, ANITA, BILAL, OWNER}) {
            assertThat(BookingHandlerRules.mayAct(OWNER, OWNER, handler, GRANTED)).isTrue();
        }
        assertThat(BookingHandlerRules.mayAct(ANITA, OWNER, ANITA, GRANTED)).isTrue();
        assertThat(BookingHandlerRules.mayAct(BILAL, OWNER, ANITA, GRANTED)).isFalse();
        // Nobody handles it yet, so it is nobody's: whether she may answer it is the mode's to say (mayRespond).
        assertThat(BookingHandlerRules.mayAct(ANITA, OWNER, null, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.mayAct(ANITA, OWNER, OWNER, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.mayAct(null, OWNER, ANITA, GRANTED)).isFalse();
    }

    @Test
    void aManagerWithoutTheGrantAndAStrangerCannotAct() {
        // Chitra manages the property but was never put on the bookings access list.
        assertThat(BookingHandlerRules.mayAct(CHITRA, OWNER, CHITRA, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.mayAct(CHITRA, OWNER, null, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.mayAct(STRANGER, OWNER, STRANGER, GRANTED)).isFalse();
    }

    /** Grants change without telling this module, so the stored name is never trusted alone. */
    @Test
    void aHandlerWhoLostTheGrantIsNoHandler() {
        assertThat(BookingHandlerRules.effectiveHandler(ANITA, OWNER, GRANTED)).isEqualTo(ANITA);
        assertThat(BookingHandlerRules.effectiveHandler(OWNER, OWNER, Set.of())).isEqualTo(OWNER);
        assertThat(BookingHandlerRules.effectiveHandler(null, OWNER, GRANTED)).isNull();
        // Anita is taken off the access list while a request is hers.
        Set<UUID> afterRevoking = Set.of(BILAL);
        assertThat(BookingHandlerRules.effectiveHandler(ANITA, OWNER, afterRevoking)).isNull();
        assertThat(BookingHandlerRules.mayAct(ANITA, OWNER, ANITA, afterRevoking)).isFalse();
        // So the next manager to answer it takes it, and it is not stranded.
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, BILAL, OWNER, ANITA, afterRevoking))
                .isTrue();
    }

    /** The first to respond handles it (user, 2026-10-11). Opening it is no longer what takes it. */
    @Test
    void theFirstToAnswerARequestNobodyHandlesTakesIt() {
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, ANITA, OWNER, null, GRANTED)).isTrue();
        // Already someone's: answering does not take it over, and a manager may not answer it at all.
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, BILAL, OWNER, ANITA, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, ANITA, OWNER, ANITA, GRANTED)).isFalse();
        // Without the grant, or from outside, answering claims nothing.
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, CHITRA, OWNER, null, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, STRANGER, OWNER, null, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, null, OWNER, null, GRANTED)).isFalse();
    }

    /** The owner is one of them: an owner who answers a request nobody has is its handler (user, 2026-10-11). */
    @Test
    void theOwnerAnsweringARequestNobodyHandlesTakesItToo() {
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, OWNER, OWNER, null, GRANTED)).isTrue();
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, OWNER, OWNER, null, Set.of())).isTrue();
        // One a manager already has stays theirs. The owner can act on it without taking it.
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, OWNER, OWNER, ANITA, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.mayRespond(BookingAssignmentMode.FIRST_VIEW, OWNER, OWNER, ANITA, GRANTED)).isTrue();
        // And one that is already the owner's is not taken twice, nor by a manager.
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, OWNER, OWNER, OWNER, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.FIRST_VIEW, ANITA, OWNER, OWNER, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.mayRespond(BookingAssignmentMode.FIRST_VIEW, ANITA, OWNER, OWNER, GRANTED)).isFalse();
    }

    @Test
    void whoMayAnswerIsItsHandlerTheOwnerAndWhereTheFirstToRespondHandlesItAnyoneWhoCouldTakeIt() {
        // Nobody has it, and the first to respond handles it: everyone with booking access may answer.
        for (UUID person : new UUID[]{OWNER, ANITA, BILAL}) {
            assertThat(BookingHandlerRules.mayRespond(BookingAssignmentMode.FIRST_VIEW, person, OWNER, null, GRANTED))
                    .isTrue();
        }
        assertThat(BookingHandlerRules.mayRespond(BookingAssignmentMode.FIRST_VIEW, CHITRA, OWNER, null, GRANTED)).isFalse();
        // Once it is someone's, only they and the owner.
        assertThat(BookingHandlerRules.mayRespond(BookingAssignmentMode.FIRST_VIEW, ANITA, OWNER, ANITA, GRANTED)).isTrue();
        assertThat(BookingHandlerRules.mayRespond(BookingAssignmentMode.FIRST_VIEW, BILAL, OWNER, ANITA, GRANTED)).isFalse();
    }

    @Test
    void whereTheSystemAssignsAnsweringClaimsNothing() {
        for (UUID answering : new UUID[]{OWNER, ANITA, BILAL}) {
            assertThat(BookingHandlerRules.claimsOnResponse(BookingAssignmentMode.SYSTEM_TURNS, answering, OWNER, null, GRANTED))
                    .isFalse();
        }
        // So a manager it was not given to may not answer one nobody has. The owner may, as ever.
        assertThat(BookingHandlerRules.mayRespond(BookingAssignmentMode.SYSTEM_TURNS, ANITA, OWNER, null, GRANTED)).isFalse();
        assertThat(BookingHandlerRules.mayRespond(BookingAssignmentMode.SYSTEM_TURNS, OWNER, OWNER, null, GRANTED)).isTrue();
        assertThat(BookingHandlerRules.mayRespond(BookingAssignmentMode.SYSTEM_TURNS, ANITA, OWNER, ANITA, GRANTED)).isTrue();
    }

    @Test
    void turnsGoToTheManagersWithTheGrantAndToTheOwnerOnlyWhenAskedOrAlone() {
        assertThat(BookingHandlerRules.turnOrder(GRANTED, OWNER, false)).containsExactly(ANITA, BILAL);
        assertThat(BookingHandlerRules.turnOrder(GRANTED, OWNER, true)).containsExactly(OWNER, ANITA, BILAL);
        // Nobody to give it to: the owner takes every turn, asked or not.
        assertThat(BookingHandlerRules.turnOrder(Set.of(), OWNER, false)).containsExactly(OWNER);
        assertThat(BookingHandlerRules.turnOrder(Set.of(), OWNER, true)).containsExactly(OWNER);
    }

    @Test
    void turnsAreEvenAndWrapRound() {
        List<UUID> order = BookingHandlerRules.turnOrder(Set.of(ANITA, BILAL, CHITRA), OWNER, false);
        Map<UUID, Integer> taken = new HashMap<>();
        List<UUID> sequence = new ArrayList<>();
        UUID last = null;
        for (int i = 0; i < 9; i++) {
            last = BookingHandlerRules.nextTurn(order, last);
            sequence.add(last);
            taken.merge(last, 1, Integer::sum);
        }
        assertThat(sequence.subList(0, 4)).containsExactly(ANITA, BILAL, CHITRA, ANITA);
        assertThat(taken).containsOnly(Map.entry(ANITA, 3), Map.entry(BILAL, 3), Map.entry(CHITRA, 3));
        assertThat(BookingHandlerRules.nextTurn(List.of(), ANITA)).isNull();
    }

    /** The pointer names a person, so the turn after them is right whoever has come or gone. */
    @Test
    void turnsStayEvenWhenAManagerLeavesOrJoinsBetweenRequests() {
        // Bilal had the last turn and then left: the next is whoever follows where he stood.
        assertThat(BookingHandlerRules.nextTurn(List.of(ANITA, CHITRA), BILAL)).isEqualTo(CHITRA);
        // Chitra had the last turn and then left: it wraps to the start.
        assertThat(BookingHandlerRules.nextTurn(List.of(ANITA, BILAL), CHITRA)).isEqualTo(ANITA);
        // Bilal joins after Anita's turn: he is next, not skipped.
        assertThat(BookingHandlerRules.nextTurn(List.of(ANITA, BILAL, CHITRA), ANITA)).isEqualTo(BILAL);
        // Only one person left: every turn is theirs.
        assertThat(BookingHandlerRules.nextTurn(List.of(ANITA), ANITA)).isEqualTo(ANITA);
    }
}
