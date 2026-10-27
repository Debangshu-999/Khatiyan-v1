package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.repository.LoginAttemptRepository;
import com.khatiyan.c_shared.exception.ValidationException;

/**
 * The phone lock, worked out from the login ledger (2026-10-18). Same ladder
 * as the Valkey counter it replaced: a lock every fifth failure, 5, 15, 30, 60,
 * then 1440 minutes.
 */
class PhoneLoginLockServiceTest {

    private static final String PHONE = "+919876543110";
    private static final Instant START = Instant.parse("2026-10-18T06:00:00Z");

    private final LoginRateLimitProperties properties = new LoginRateLimitProperties();
    private final LoginAttemptRepository repository = mock(LoginAttemptRepository.class);
    private final PhoneLoginLockService service = new PhoneLoginLockService(repository, properties);

    /** Failures a minute apart from START, returned newest first as the query does. */
    private static List<Instant> failuresAMinuteApart(int count) {
        List<Instant> newestFirst = new ArrayList<>();
        for (int i = count - 1; i >= 0; i--) {
            newestFirst.add(START.plus(Duration.ofMinutes(i)));
        }
        return newestFirst;
    }

    private void ledgerHas(List<Instant> newestFirst) {
        when(repository.findFailureTimesSinceLastSuccess(eq(PHONE), any(), any())).thenReturn(newestFirst);
    }

    private static Instant lastOf(List<Instant> newestFirst) {
        return newestFirst.get(0);
    }

    @Test
    void fourFailuresSetNoLock() {
        assertThat(PhoneLoginLockService.lockedUntil(failuresAMinuteApart(4), properties)).isNull();
    }

    @Test
    void theFifthFailureLocksForFiveMinutes() {
        List<Instant> five = failuresAMinuteApart(5);

        assertThat(PhoneLoginLockService.lockedUntil(five, properties)).isEqualTo(lastOf(five).plus(Duration.ofMinutes(5)));
    }

    @Test
    void theTenthFailureLocksForFifteenMinutesAndTheTwentyFifthForADay() {
        List<Instant> ten = failuresAMinuteApart(10);
        List<Instant> twentyFive = failuresAMinuteApart(25);

        assertThat(PhoneLoginLockService.lockedUntil(ten, properties)).isEqualTo(lastOf(ten).plus(Duration.ofMinutes(15)));
        assertThat(PhoneLoginLockService.lockedUntil(twentyFive, properties))
                .isEqualTo(lastOf(twentyFive).plus(Duration.ofMinutes(1440)));
    }

    @Test
    void failuresBetweenRungsKeepTheLastRungsLock() {
        List<Instant> seven = failuresAMinuteApart(7);
        Instant fifth = seven.get(2);

        assertThat(PhoneLoginLockService.lockedUntil(seven, properties)).isEqualTo(fifth.plus(Duration.ofMinutes(5)));
    }

    /** The Valkey tally expired two days after its last failure, so the run starts again. */
    @Test
    void aTwoDayGapStartsTheTallyAgain() {
        List<Instant> newestFirst = new ArrayList<>();
        Instant later = START.plus(Duration.ofDays(3));
        for (int i = 2; i >= 0; i--) {
            newestFirst.add(later.plus(Duration.ofMinutes(i)));
        }
        newestFirst.addAll(failuresAMinuteApart(4));

        // Seven failures, but only three since the gap: no rung reached.
        assertThat(PhoneLoginLockService.lockedUntil(newestFirst, properties)).isNull();
    }

    @Test
    void aLockedPhoneIsRefusedWithTheSharedWording() {
        List<Instant> five = failuresAMinuteApart(5);
        ledgerHas(five);

        assertThatThrownBy(() -> service.ensureNotLocked(PHONE, lastOf(five).plus(Duration.ofMinutes(4))))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Too many login attempts for this phone. Try again later.");
    }

    @Test
    void theLockEndsOnTime() {
        List<Instant> five = failuresAMinuteApart(5);
        ledgerHas(five);

        assertThatCode(() -> service.ensureNotLocked(PHONE, lastOf(five).plus(Duration.ofMinutes(5))))
                .doesNotThrowAnyException();
    }

    /** A success clears the tally: the query returns only failures after it. */
    @Test
    void noFailuresSinceTheLastSuccessMeansNoLock() {
        ledgerHas(List.of());

        assertThatCode(() -> service.ensureNotLocked(PHONE, START)).doesNotThrowAnyException();
    }
}
