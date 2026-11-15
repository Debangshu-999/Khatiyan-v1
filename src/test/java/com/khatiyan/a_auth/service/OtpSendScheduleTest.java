package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.c_shared.exception.TooManyRequestsException;

/**
 * The resend schedule (user, 2026-11-14), on an in-memory log: 30 seconds between
 * the first 3 codes in a day, then the gap doubles for every further 3, so one
 * number stays well inside 20 codes an hour.
 */
class OtpSendScheduleTest {

    private static final String NUMBER = OtpSendSchedule.phoneKey("+919876543110");
    private static final Instant T0 = Instant.parse("2026-11-14T10:00:00Z");

    /** An in-memory {@link OtpSendLog}. */
    static final class MemoryLog implements OtpSendLog {
        record Row(String identifier, String scope, Instant at) {}

        final List<Row> rows = new ArrayList<>();
        int locks;

        @Override
        public Window window(String identifier, String scope, Instant since) {
            List<Row> hits = rows.stream()
                    .filter(row -> row.identifier().equals(identifier) && row.scope().equals(scope) && row.at().isAfter(since))
                    .toList();
            Instant latest = hits.stream().map(Row::at).max(Instant::compareTo).orElse(null);
            return new Window(hits.size(), latest);
        }

        @Override
        public void lock(String identifier, String scope) {
            locks++;
        }

        @Override
        public void record(String identifier, String scope, Instant at) {
            rows.add(new Row(identifier, scope, at));
        }

        @Override
        public void purgeBefore(Instant cutoff) {
            rows.removeIf(row -> row.at().isBefore(cutoff));
        }
    }

    private final MemoryLog log = new MemoryLog();
    private final OtpSendSchedule schedule = new OtpSendSchedule(log);

    private void sent(int count, Instant last) {
        for (int k = count - 1; k >= 0; k--) {
            log.record(NUMBER, OtpSendSchedule.AUTH_SCOPE, last.minusSeconds(k));
        }
    }

    @Test
    void theGapIsThirtySecondsForTheFirstThreeThenDoublesEveryThree() {
        assertThat(OtpSendSchedule.gapAfter(1)).isEqualTo(Duration.ofSeconds(30));
        assertThat(OtpSendSchedule.gapAfter(2)).isEqualTo(Duration.ofSeconds(30));
        assertThat(OtpSendSchedule.gapAfter(3)).isEqualTo(Duration.ofMinutes(1));
        assertThat(OtpSendSchedule.gapAfter(5)).isEqualTo(Duration.ofMinutes(1));
        assertThat(OtpSendSchedule.gapAfter(6)).isEqualTo(Duration.ofMinutes(2));
        assertThat(OtpSendSchedule.gapAfter(9)).isEqualTo(Duration.ofMinutes(4));
        assertThat(OtpSendSchedule.gapAfter(12)).isEqualTo(Duration.ofMinutes(8));
        assertThat(OtpSendSchedule.gapAfter(400)).isEqualTo(Duration.ofDays(1));
    }

    /** Sent back to back as fast as the schedule allows, one number never gets 20 in an hour. */
    @Test
    void oneNumberStaysUnderTwentyCodesAnHour() {
        Duration elapsed = Duration.ZERO;
        int sent = 1;
        while (true) {
            Duration next = elapsed.plus(OtpSendSchedule.gapAfter(sent));
            if (next.compareTo(Duration.ofHours(1)) >= 0) {
                break;
            }
            elapsed = next;
            sent++;
        }
        assertThat(sent).isLessThan(20);
    }

    @Test
    void nothingSentMeansNoWait() {
        assertThat(schedule.waitSeconds(NUMBER, OtpSendSchedule.AUTH_SCOPE, T0)).isZero();
    }

    @Test
    void aSecondCodeTenSecondsAfterTheFirstWaitsTwentyMore() {
        sent(1, T0.minusSeconds(10));

        assertThat(schedule.waitSeconds(NUMBER, OtpSendSchedule.AUTH_SCOPE, T0)).isEqualTo(20L);
        assertThatThrownBy(() -> schedule.claim(NUMBER, OtpSendSchedule.AUTH_SCOPE, T0))
                .isInstanceOfSatisfying(TooManyRequestsException.class,
                        refused -> assertThat(refused.retryAfterSeconds()).isEqualTo(20L));
    }

    @Test
    void afterThreeCodesTheNextWaitsAMinute() {
        sent(3, T0.minusSeconds(40));

        assertThat(schedule.waitSeconds(NUMBER, OtpSendSchedule.AUTH_SCOPE, T0)).isEqualTo(20L);
        assertThat(schedule.waitSeconds(NUMBER, OtpSendSchedule.AUTH_SCOPE, T0.plusSeconds(20))).isZero();
    }

    @Test
    void aClaimThatPassesIsRecordedUnderTheLock() {
        schedule.claim(NUMBER, OtpSendSchedule.AUTH_SCOPE, T0);

        assertThat(log.locks).isEqualTo(1);
        assertThat(log.rows).hasSize(1);
    }

    /** A refused request is not recorded, so retrying early does not push the wait further. */
    @Test
    void aRefusedClaimIsNotRecorded() {
        sent(1, T0.minusSeconds(5));

        assertThatThrownBy(() -> schedule.claim(NUMBER, OtpSendSchedule.AUTH_SCOPE, T0))
                .isInstanceOf(TooManyRequestsException.class);

        assertThat(log.rows).hasSize(1);
    }

    /** Codes older than a day no longer count. */
    @Test
    void theCountIsADays() {
        sent(12, T0.minus(Duration.ofHours(25)));

        assertThat(schedule.waitSeconds(NUMBER, OtpSendSchedule.AUTH_SCOPE, T0)).isZero();
    }

    /** Sign-in, setup, reset and email sign-in share one schedule; owner-asked codes have their own. */
    @Test
    void theSignInPurposesShareOneScopeAndOwnerCodesKeepTheirs() {
        assertThat(OtpSendSchedule.scopeOf(OtpPurpose.LOGIN)).isEqualTo(OtpSendSchedule.AUTH_SCOPE);
        assertThat(OtpSendSchedule.scopeOf(OtpPurpose.PIN_RESET)).isEqualTo(OtpSendSchedule.AUTH_SCOPE);
        assertThat(OtpSendSchedule.scopeOf(OtpPurpose.EMAIL_LOGIN)).isEqualTo(OtpSendSchedule.AUTH_SCOPE);
        assertThat(OtpSendSchedule.scopeOf(OtpPurpose.CASH_PAYMENT)).isEqualTo("CASH_PAYMENT");
    }

    /** An address in capitals or with spaces is the same address. */
    @Test
    void emailAddressesAreOneIdentifierWhateverTheirCase() {
        assertThat(OtpSendSchedule.emailKey("  Ana@Example.COM ")).isEqualTo(OtpSendSchedule.emailKey("ana@example.com"));
    }
}
