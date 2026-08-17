package com.khatiyan.d_modules.nudge.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.nudge.model.Nudge;

/**
 * The cooldown is the only thing protecting a tenant from a sender they cannot
 * reply to, mute, or block.
 *
 * <p>Everything here runs against a fixed instant. The first version of the
 * recurring-notice guard was written against the wall clock and only failed
 * once the build ran late enough at night to cross its own boundary.
 */
class NudgeCooldownTest {

    private static final Instant SENT_AT = Instant.parse("2026-08-17T09:00:00Z");
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID TENANCY = UUID.randomUUID();
    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID SENDER = UUID.randomUUID();

    private static Nudge nudgeSentAt(Instant sentAt) {
        return Nudge.send(PROPERTY, TENANCY, TENANT, SENDER, "Rent is pending.", sentAt);
    }

    @Test
    void blocksASecondNudgeWithinTheWindow() {
        Nudge nudge = nudgeSentAt(SENT_AT);

        assertThat(nudge.isInCooldownAt(SENT_AT.plus(Duration.ofHours(2)))).isTrue();
    }

    /**
     * The boundary belongs to the sender: three hours later is allowed, not
     * blocked. An off-by-one here would leave the button dead for ever at
     * exactly the moment it should wake up.
     */
    @Test
    void allowsANudgeExactlyOnTheBoundary() {
        Nudge nudge = nudgeSentAt(SENT_AT);

        assertThat(nudge.cooldownEndsAt()).isEqualTo(SENT_AT.plus(Duration.ofHours(3)));
        assertThat(nudge.isInCooldownAt(SENT_AT.plus(Duration.ofHours(3)))).isFalse();
    }

    @Test
    void allowsANudgeAfterTheWindow() {
        Nudge nudge = nudgeSentAt(SENT_AT);

        assertThat(nudge.isInCooldownAt(SENT_AT.plus(Duration.ofHours(3).plusMinutes(1)))).isFalse();
    }

    /**
     * The cooldown is a property of the tenant being nudged, not of who nudged
     * them. Two managers sending one each is still two messages arriving at the
     * same person — which is why the entity has no sender in the check at all.
     */
    @Test
    void theCooldownIgnoresWhoSentTheLastOne() {
        Nudge fromManager = Nudge.send(PROPERTY, TENANCY, TENANT, UUID.randomUUID(), "Bins tonight.", SENT_AT);

        assertThat(fromManager.isInCooldownAt(SENT_AT.plus(Duration.ofMinutes(5)))).isTrue();
    }

    @Test
    void refusesAnEmptyMessage() {
        assertThatThrownBy(() -> Nudge.send(PROPERTY, TENANCY, TENANT, SENDER, "   ", SENT_AT))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("needs a message");
    }

    @Test
    void refusesAMessageOverTheLimit() {
        String tooLong = "x".repeat(Nudge.MAX_MESSAGE_LENGTH + 1);

        assertThatThrownBy(() -> Nudge.send(PROPERTY, TENANCY, TENANT, SENDER, tooLong, SENT_AT))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("at most");
    }

    @Test
    void trimsTheMessage() {
        assertThat(nudgeSentAt(SENT_AT).getMessage()).isEqualTo("Rent is pending.");
        assertThat(Nudge.send(PROPERTY, TENANCY, TENANT, SENDER, "  padded  ", SENT_AT).getMessage())
                .isEqualTo("padded");
    }

    /** Reading is idempotent — the screen marks the page read on every open. */
    @Test
    void keepsTheFirstReadTime() {
        Nudge nudge = nudgeSentAt(SENT_AT);
        Instant firstOpen = SENT_AT.plus(Duration.ofMinutes(10));

        nudge.markRead(firstOpen);
        nudge.markRead(SENT_AT.plus(Duration.ofHours(4)));

        assertThat(nudge.getReadAt()).isEqualTo(firstOpen);
    }

    // The remaining time goes into the error message a sender reads, so it has
    // to be a sentence rather than a duration dump.

    @Test
    void describesTheRemainingTime() {
        assertThat(NudgeService.describeRemaining(Duration.ofMinutes(45))).isEqualTo("45 minutes");
        assertThat(NudgeService.describeRemaining(Duration.ofHours(2))).isEqualTo("2 hours");
        assertThat(NudgeService.describeRemaining(Duration.ofHours(1))).isEqualTo("1 hour");
        assertThat(NudgeService.describeRemaining(Duration.ofMinutes(124))).isEqualTo("2h 4m");
        assertThat(NudgeService.describeRemaining(Duration.ofMinutes(1))).isEqualTo("1 minute");
    }

    /**
     * Seconds round up. "0 minutes" would read as though the wait were over
     * while the send still fails.
     */
    @Test
    void neverDescribesTheRemainingTimeAsZero() {
        assertThatCode(() -> NudgeService.describeRemaining(Duration.ofSeconds(3))).doesNotThrowAnyException();
        assertThat(NudgeService.describeRemaining(Duration.ofSeconds(3))).isEqualTo("1 minute");
        assertThat(NudgeService.describeRemaining(Duration.ofSeconds(90))).isEqualTo("2 minutes");
    }
}
