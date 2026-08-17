package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * When a request stops being interactive.
 *
 * <p>The active/history split on both sides reads {@code expiresAt}, so these
 * pin the one fact everything else rests on: that a request stays live for the
 * window its outcome opens, and no longer.
 *
 * <p>The load-bearing assertion is {@link #anApprovedExitKeepsItsApprovedStatus}
 * — status and expiry are deliberately separate, because the execution scheduler
 * queries for APPROVED and would strand every approved departure if expiry
 * overwrote it.
 */
class RequestActivityExpiryTest {

    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    private static final LocalDate CHECKOUT = LocalDate.of(2026, 12, 31);

    private static TenancyExitRequest newExit() {
        return TenancyExitRequest.normalNotice(
                UUID.randomUUID(), TENANT, UUID.randomUUID(), UUID.randomUUID(), CHECKOUT, "moving out");
    }

    /** Roughly-equal window check, tolerant of the clock ticking mid-test. */
    private static void expiresInAbout(TenancyExitRequest request, int days) {
        Duration remaining = Duration.between(Instant.now(), request.getExpiresAt());
        assertThat(remaining)
                .as("expires in about %d days", days)
                .isBetween(Duration.ofDays(days).minusMinutes(1), Duration.ofDays(days).plusMinutes(1));
    }

    @Test
    @DisplayName("a new request is live for the review window")
    void newRequestExpiresAfterTheReviewWindow() {
        TenancyExitRequest request = newExit();

        expiresInAbout(request, TenancyExitRequest.REVIEW_WINDOW_DAYS);
        assertThat(request.isActivelyOpen(Instant.now())).isTrue();
    }

    @Test
    @DisplayName("an approved exit stays live for the withdrawal window, not the review window")
    void approvalResetsTheClockToTheWithdrawalWindow() {
        TenancyExitRequest request = newExit();
        request.approveNormal(OWNER, null, null, null, null);

        expiresInAbout(request, TenancyExitRequest.WITHDRAWAL_WINDOW_DAYS);
    }

    @Test
    @DisplayName("an approved exit keeps its APPROVED status once the window shuts")
    void anApprovedExitKeepsItsApprovedStatus() {
        TenancyExitRequest request = newExit();
        request.approveNormal(OWNER, null, null, null, null);

        // Well past the withdrawal window.
        Instant later = Instant.now().plus(Duration.ofDays(TenancyExitRequest.WITHDRAWAL_WINDOW_DAYS + 1));

        assertThat(request.isActivelyOpen(later)).isFalse();
        // The scheduler looks for APPROVED. Expiring the STATUS instead of using
        // a separate field would leave this exit never executing.
        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.APPROVED);
        assertThat(request.getApprovedCheckoutDate()).isEqualTo(CHECKOUT);
    }

    @Test
    @DisplayName("a rejected exit stays live for the re-raise window")
    void rejectionOpensTheReRaiseWindow() {
        TenancyExitRequest request = newExit();
        request.reject(OWNER, "wrong date");

        expiresInAbout(request, TenancyExitRequest.RE_RAISE_WINDOW_DAYS);
        assertThat(request.isActivelyOpen(Instant.now())).isTrue();
    }

    @Test
    @DisplayName("an unreviewed expiry still leaves the re-raise carve-out open")
    void unreviewedExpiryStillAllowsAReRaise() {
        TenancyExitRequest request = newExit();
        request.expire();

        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.EXPIRED);
        // Lapsing was not the tenant's doing, so they keep the window to ask
        // again on the original notice anchor.
        expiresInAbout(request, TenancyExitRequest.RE_RAISE_WINDOW_DAYS);
    }

    @Test
    @DisplayName("a pending withdrawal never expires — it waits on the owner")
    void aPendingWithdrawalWaitsIndefinitely() {
        TenancyExitRequest request = newExit();
        request.approveNormal(OWNER, null, null, null, null);
        request.requestWithdrawal(TENANT, "staying", LocalDate.of(2026, 12, 1));

        assertThat(request.getExpiresAt()).isNull();
        // Null means open-ended: nothing should sweep a question the owner has
        // not answered into history.
        assertThat(request.isActivelyOpen(Instant.now().plus(Duration.ofDays(365)))).isTrue();
    }

    @Test
    @DisplayName("allowing a withdrawal closes the request immediately")
    void allowingAWithdrawalClosesIt() {
        TenancyExitRequest request = newExit();
        request.approveNormal(OWNER, null, null, null, null);
        request.requestWithdrawal(TENANT, "staying", LocalDate.of(2026, 12, 1));
        request.approveWithdrawal(OWNER, null);

        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.CANCELLED);
        assertThat(request.isActivelyOpen(Instant.now().plusSeconds(1))).isFalse();
    }

    @Test
    @DisplayName("refusing a withdrawal reopens the approval's own window")
    void refusingAWithdrawalReopensTheApprovalWindow() {
        TenancyExitRequest request = newExit();
        request.approveNormal(OWNER, null, null, null, null);
        request.requestWithdrawal(TENANT, "staying", LocalDate.of(2026, 12, 1));
        request.rejectWithdrawal(OWNER, null);

        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.APPROVED);
        expiresInAbout(request, TenancyExitRequest.WITHDRAWAL_WINDOW_DAYS);
    }

    @Test
    @DisplayName("an executed exit is closed the moment it executes")
    void executionClosesIt() {
        TenancyExitRequest request = newExit();
        request.approveNormal(OWNER, null, null, null, null);
        request.markExecuted();

        assertThat(request.isActivelyOpen(Instant.now().plusSeconds(1))).isFalse();
    }

    // ------------------------------------------------------------ room change

    private static TenancyRoomChangeRequest newRoomChange() {
        return TenancyRoomChangeRequest.request(
                null,
                UUID.randomUUID(),
                TENANT,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                LocalDate.of(2026, 12, 31),
                "closer to work",
                10_000_00L);
    }

    @Test
    @DisplayName("a room change closes the moment it is decided — there is no withdrawal window")
    void aRoomChangeClosesOnDecision() {
        TenancyRoomChangeRequest approved = newRoomChange();
        approved.approve(OWNER, null);
        assertThat(approved.isActivelyOpen(Instant.now().plusSeconds(1))).isFalse();

        TenancyRoomChangeRequest rejected = newRoomChange();
        rejected.reject(OWNER, "no space");
        assertThat(rejected.isActivelyOpen(Instant.now().plusSeconds(1))).isFalse();
    }

    @Test
    @DisplayName("an unreviewed room change is live for the review window")
    void anUnreviewedRoomChangeUsesTheReviewWindow() {
        TenancyRoomChangeRequest request = newRoomChange();

        Duration remaining = Duration.between(Instant.now(), request.getExpiresAt());
        assertThat(remaining).isBetween(
                Duration.ofDays(TenancyRoomChangeRequest.REVIEW_WINDOW_DAYS).minusMinutes(1),
                Duration.ofDays(TenancyRoomChangeRequest.REVIEW_WINDOW_DAYS).plusMinutes(1));
    }
}
