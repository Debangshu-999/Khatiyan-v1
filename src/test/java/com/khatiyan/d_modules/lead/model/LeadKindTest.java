package com.khatiyan.d_modules.lead.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/**
 * What a record is to the owner, read off where it is and how it ended (user,
 * 2026-10-11). The line that matters most: a record that closed is a dead lead
 * only if a visit was ever scheduled on it, and a lost enquiry otherwise.
 */
class LeadKindTest {

    private static final Instant ASKED = Instant.parse("2026-10-03T06:00:00Z");

    private static Lead lead() {
        return Lead.openedByEnquiry("LEAD-2026-000001", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), ASKED);
    }

    @Test
    void anOpenRecordIsNamedForItsStage() {
        Lead lead = lead();
        assertThat(LeadKind.of(lead)).isEqualTo(LeadKind.ENQUIRY);
        assertThat(LeadKind.of(lead).isInPlay()).isFalse();

        lead.reachEarlyLead(ASKED.plusSeconds(60));
        assertThat(LeadKind.of(lead)).isEqualTo(LeadKind.EARLY_LEAD);

        lead.reachAdvancedLead(ASKED.plusSeconds(120));
        assertThat(LeadKind.of(lead)).isEqualTo(LeadKind.ADVANCED_LEAD);

        lead.reachBooked(ASKED.plusSeconds(180));
        assertThat(LeadKind.of(lead)).isEqualTo(LeadKind.BOOKED);
        assertThat(LeadKind.of(lead).isInPlay()).isTrue();

        lead.moveIn(UUID.randomUUID(), ASKED.plusSeconds(240));
        assertThat(LeadKind.of(lead)).isEqualTo(LeadKind.CONVERTED);
    }

    @Test
    void aRecordThatClosedWithoutEverHavingAVisitScheduledIsALostEnquiry() {
        Lead lead = lead();
        lead.close(LeadCloseReason.NO_REPLY, ASKED.plusSeconds(60));

        assertThat(lead.wasEverALead()).isFalse();
        assertThat(LeadKind.of(lead)).isEqualTo(LeadKind.LOST_ENQUIRY);
    }

    @Test
    void aRecordWhoseVisitWasCancelledStillDiedAsALead() {
        Lead lead = lead();
        lead.reachEarlyLead(ASKED.plusSeconds(60));
        // The visit is cancelled: back to Enquired, and it then runs out there.
        lead.returnToEnquired();
        assertThat(LeadKind.of(lead)).isEqualTo(LeadKind.ENQUIRY);
        lead.close(LeadCloseReason.VISIT_CANCELLED, ASKED.plusSeconds(120));

        assertThat(lead.getStage()).isEqualTo(LeadStage.ENQUIRED);
        assertThat(lead.wasEverALead()).isTrue();
        assertThat(LeadKind.of(lead)).isEqualTo(LeadKind.DEAD);
    }

    @Test
    void aRecordThatEndedForThePersonsOwnReasonSaysSoUntilItOpensAgain() {
        Lead lead = lead();
        lead.reachAdvancedLead(ASKED.plusSeconds(60));
        assertThat(lead.isEndedByProspect()).isFalse();

        // Read off the reason: letting the days to book run out is theirs.
        assertThat(lead.close(LeadCloseReason.BOOKING_WINDOW_EXPIRED, ASKED.plusSeconds(120))).isTrue();
        assertThat(lead.isEndedByProspect()).isTrue();
        assertThat(LeadKind.of(lead)).isEqualTo(LeadKind.DEAD);

        // "Changed your mind?" opens it again, and it no longer counts against them.
        lead.reopen(ASKED.plusSeconds(180));
        assertThat(lead.isEndedByProspect()).isFalse();

        // Said by the caller, where the reason alone cannot tell.
        assertThat(lead.close(LeadCloseReason.NO_REPLY, ASKED.plusSeconds(240), false)).isTrue();
        assertThat(lead.isEndedByProspect()).isFalse();

        // Moving in never counts against anyone.
        Lead tenant = lead();
        tenant.reachBooked(ASKED.plusSeconds(60));
        tenant.moveIn(UUID.randomUUID(), ASKED.plusSeconds(120));
        assertThat(tenant.isEndedByProspect()).isFalse();
    }

    @Test
    void onlyTheEndingsThatAreThePersonsCountAgainstThem() {
        assertThat(java.util.Arrays.stream(LeadCloseReason.values()).filter(LeadCloseReason::isAlwaysTheProspects))
                .containsExactlyInAnyOrder(
                        LeadCloseReason.NO_VISIT_BOOKED, LeadCloseReason.NOT_INTERESTED,
                        LeadCloseReason.NO_ANSWER_AFTER_MISSED_VISIT, LeadCloseReason.NOT_SURE_EXPIRED,
                        LeadCloseReason.BOOKING_WINDOW_EXPIRED, LeadCloseReason.NO_LONGER_LOOKING,
                        LeadCloseReason.BOOKING_CANCELLED_BY_TENANT, LeadCloseReason.DID_NOT_ARRIVE,
                        LeadCloseReason.DID_NOT_SIGN, LeadCloseReason.BOOKED_ELSEWHERE);
    }

    @Test
    void aRepeatIsADuplicateUntilItsFourthTimeAndThenPotentialSpam() {
        assertThat(lead().repeatFlag()).isNull();
        UUID earlier = UUID.randomUUID();
        assertThat(repeat(earlier, 1).repeatFlag()).isEqualTo(LeadRepeatFlag.DUPLICATE);
        assertThat(repeat(earlier, 2).repeatFlag()).isEqualTo(LeadRepeatFlag.DUPLICATE);
        assertThat(repeat(earlier, 3).repeatFlag()).isEqualTo(LeadRepeatFlag.POTENTIAL_SPAM);
        assertThat(repeat(earlier, 7).repeatFlag()).isEqualTo(LeadRepeatFlag.POTENTIAL_SPAM);
        // A repeat is not a resumed lead, and it is worked like any record.
        Lead fourth = repeat(earlier, 3);
        assertThat(fourth.isResumed()).isFalse();
        assertThat(fourth.isOpen()).isTrue();
        assertThat(fourth.getDuplicateOfLeadId()).isEqualTo(earlier);
        assertThat(LeadKind.of(fourth)).isEqualTo(LeadKind.ENQUIRY);
        assertThatThrownBy(() -> repeat(earlier, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> repeat(null, 1)).isInstanceOf(IllegalArgumentException.class);

        // The words the owner reads (user, 2026-10-17).
        assertThat(LeadRepeatFlag.reasonFor(3))
                .isEqualTo("Has 3 expired leads from this user before, expired due to the user's non interest.");
        assertThat(LeadRepeatFlag.reasonFor(1))
                .isEqualTo("Has 1 expired lead from this user before, expired due to the user's non interest.");
    }

    private static Lead repeat(UUID earlier, int walkaways) {
        return Lead.repeatByEnquiry("LEAD-T-2", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), ASKED,
                earlier, walkaways);
    }
}
