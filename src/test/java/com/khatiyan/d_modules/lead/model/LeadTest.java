package com.khatiyan.d_modules.lead.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/**
 * A lead is brought level with its enquiry again and again, by events that
 * repeat and arrive out of order. Each change therefore has to say whether it
 * changed anything, and a repeat or a late arrival has to change nothing.
 */
class LeadTest {

    private static final Instant ASKED = Instant.parse("2026-10-03T06:00:00Z");
    private static final UUID MANAGER = UUID.randomUUID();
    private static final UUID OTHER_MANAGER = UUID.randomUUID();

    private static Lead lead() {
        return Lead.openedByEnquiry("LEAD-2026-000001", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), ASKED);
    }

    @Test
    void opensAtEnquiredWithNobodyHandlingIt() {
        Lead lead = lead();

        assertThat(lead.getStage()).isEqualTo(LeadStage.ENQUIRED);
        assertThat(lead.getState()).isEqualTo(LeadState.OPEN);
        assertThat(lead.getEnquiredAt()).isEqualTo(ASKED);
        assertThat(lead.getHandlerUserId()).isNull();
        assertThat(lead.awaitsFirstAnswer()).isTrue();
    }

    @Test
    void takesAHandlerOnceForTheSameAssignment() {
        Lead lead = lead();
        Instant assignedAt = ASKED.plusSeconds(60);

        assertThat(lead.takeHandler(MANAGER, LeadHandlerSource.FIRST_RESPONSE, assignedAt)).isTrue();
        assertThat(lead.takeHandler(MANAGER, LeadHandlerSource.FIRST_RESPONSE, assignedAt)).isFalse();

        assertThat(lead.getHandlerUserId()).isEqualTo(MANAGER);
    }

    /** A reassignment heard before the assignment it replaced must still win. */
    @Test
    void keepsTheNewerAssignmentWhenAnOlderOneIsHeardLate() {
        Lead lead = lead();

        assertThat(lead.takeHandler(OTHER_MANAGER, LeadHandlerSource.OWNER, ASKED.plusSeconds(120))).isTrue();
        assertThat(lead.takeHandler(MANAGER, LeadHandlerSource.FIRST_RESPONSE, ASKED.plusSeconds(60))).isFalse();

        assertThat(lead.getHandlerUserId()).isEqualTo(OTHER_MANAGER);
        assertThat(lead.getHandlerAssignedBy()).isEqualTo(LeadHandlerSource.OWNER);
    }

    @Test
    void anEnquiryWithNoHandlerChangesNothing() {
        Lead lead = lead();

        assertThat(lead.takeHandler(null, null, null)).isFalse();
        assertThat(lead.getHandlerUserId()).isNull();
    }

    @Test
    void recordsTheFirstAnswerOnce() {
        Lead lead = lead();
        Instant answered = ASKED.plusSeconds(3600);

        assertThat(lead.markResponded(null)).isFalse();
        assertThat(lead.markResponded(answered)).isTrue();
        assertThat(lead.markResponded(answered.plusSeconds(60))).isFalse();

        assertThat(lead.getRespondedAt()).isEqualTo(answered);
        assertThat(lead.awaitsFirstAnswer()).isFalse();
    }

    /** A closed record keeps the stage it reached, and closes once. */
    @Test
    void closesOnceAndKeepsItsStage() {
        Lead lead = lead();
        Instant expired = ASKED.plusSeconds(30L * 24 * 3600);

        assertThat(lead.close(LeadCloseReason.NO_REPLY, expired)).isTrue();
        assertThat(lead.close(LeadCloseReason.SPAM, expired.plusSeconds(60))).isFalse();

        assertThat(lead.getState()).isEqualTo(LeadState.CLOSED);
        assertThat(lead.getStage()).isEqualTo(LeadStage.ENQUIRED);
        assertThat(lead.getCloseReason()).isEqualTo(LeadCloseReason.NO_REPLY);
        assertThat(lead.getClosedAt()).isEqualTo(expired);
        assertThat(lead.awaitsFirstAnswer()).isFalse();
    }
}
