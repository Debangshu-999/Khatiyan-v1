package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.khatiyan.c_shared.exception.ValidationException;

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
    private static void expiresInAbout(TenancyExitRequest request, Duration window) {
        Duration remaining = Duration.between(Instant.now(), request.getExpiresAt());
        assertThat(remaining)
                .as("expires in about %s", window)
                .isBetween(window.minusMinutes(1), window.plusMinutes(1));
    }

    @Test
    @DisplayName("a new request is live for the review window")
    void newRequestExpiresAfterTheReviewWindow() {
        TenancyExitRequest request = newExit();

        expiresInAbout(request, Duration.ofDays(TenancyExitRequest.REVIEW_WINDOW_DAYS));
        assertThat(request.isActivelyOpen(Instant.now())).isTrue();
    }

    @Test
    @DisplayName("an approved exit stays live for the withdrawal window, not the review window")
    void approvalResetsTheClockToTheWithdrawalWindow() {
        TenancyExitRequest request = newExit();
        request.approveNormal(OWNER, null, null, null, null);

        expiresInAbout(request, Duration.ofDays(TenancyExitRequest.WITHDRAWAL_WINDOW_DAYS));
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

        expiresInAbout(request, Duration.ofHours(TenancyExitRequest.RE_RAISE_WINDOW_HOURS));
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
        expiresInAbout(request, Duration.ofHours(TenancyExitRequest.RE_RAISE_WINDOW_HOURS));
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
        expiresInAbout(request, Duration.ofDays(TenancyExitRequest.WITHDRAWAL_WINDOW_DAYS));
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
    @DisplayName("a room-change decision remains visible for three days")
    void aRoomChangeDecisionRemainsVisibleBriefly() {
        TenancyRoomChangeRequest approved = newRoomChange();
        approved.approve(OWNER, null);
        assertThat(approved.isActivelyOpen(Instant.now().plusSeconds(1))).isTrue();
        assertThat(approved.allowsReRaiseAt(Instant.now())).isFalse();

        TenancyRoomChangeRequest rejected = newRoomChange();
        rejected.reject(OWNER, "no space");
        assertThat(rejected.isActivelyOpen(Instant.now().plusSeconds(1))).isTrue();
        assertThat(rejected.allowsReRaiseAt(Instant.now())).isTrue();
        assertThat(rejected.allowsReRaiseAt(
                Instant.now().plus(Duration.ofHours(TenancyRoomChangeRequest.RE_RAISE_WINDOW_HOURS + 1))))
                .isFalse();
    }

    @Test
    @DisplayName("a room change stops offering re-raise once the chain has run twice")
    void aRoomChangeChainIsCappedAtTwoReRaises() {
        TenancyRoomChangeRequest original = newRoomChange();
        original.reject(OWNER, "that room is spoken for");
        assertThat(original.allowsReRaiseAt(Instant.now())).isTrue();

        TenancyRoomChangeRequest first = reRaiseOf(original);
        assertThat(first.getReRaiseCount()).isEqualTo(1);
        first.reject(OWNER, "so is that one");
        assertThat(first.allowsReRaiseAt(Instant.now())).isTrue();

        TenancyRoomChangeRequest second = reRaiseOf(first);
        assertThat(second.getReRaiseCount()).isEqualTo(2);
        second.reject(OWNER, "and that one");

        // A room change reserves a bed the moment it is approved, so an endless
        // chain lets one tenant keep pointing requests at a room other people
        // are waiting for. Two corrections, then they start again.
        assertThat(second.allowsReRaiseAt(Instant.now())).isFalse();
        assertThat(second.isActivelyOpen(Instant.now())).isTrue();
    }

    private static TenancyRoomChangeRequest reRaiseOf(TenancyRoomChangeRequest superseded) {
        return TenancyRoomChangeRequest.request(
                null,
                superseded.getTenancyId(),
                TENANT,
                superseded.getPropertyId(),
                superseded.getCurrentRoomId(),
                superseded.getTargetRoomId(),
                superseded.getBillingCycleId(),
                LocalDate.of(2026, 12, 31),
                "closer to work",
                10_000_00L,
                superseded);
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

    @Test
    @DisplayName("a corrected room change links to the rejected attempt")
    void correctedRoomChangeKeepsItsHistoryLink() {
        TenancyRoomChangeRequest rejected = newRoomChange();
        rejected.reject(OWNER, "pick another room");

        TenancyRoomChangeRequest corrected = TenancyRoomChangeRequest.request(
                null,
                rejected.getTenancyId(),
                TENANT,
                rejected.getPropertyId(),
                rejected.getCurrentRoomId(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                LocalDate.of(2026, 12, 31),
                "new room selected",
                11_000_00L,
                rejected);

        assertThat(corrected.getSupersededRequestId()).isEqualTo(rejected.getId());
    }

    @Test
    @DisplayName("management can return an approved room change to the decision queue")
    void approvedRoomChangeCanBeRevertedInsideItsWindow() {
        TenancyRoomChangeRequest request = newRoomChange();
        request.approve(OWNER, "approved");

        request.revertApproval(Instant.now());

        assertThat(request.getStatus()).isEqualTo(TenancyRoomChangeRequestStatus.REQUESTED);
        assertThat(request.getDecidedByUserId()).isNull();
        assertThat(request.getDecidedAt()).isNull();
        assertThat(request.getAdminNotes()).isNull();
        assertThat(request.allowsApprovalRevertAt(Instant.now())).isFalse();
    }

    @Test
    @DisplayName("rejection can never be revived as an active room change")
    void rejectedRoomChangeCannotBeReverted() {
        TenancyRoomChangeRequest request = newRoomChange();
        request.reject(OWNER, "no vacancy");

        assertThatThrownBy(() -> request.revertApproval(Instant.now()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("can no longer be reverted");
    }

    @Test
    @DisplayName("manual approval reversion closes when its decision window ends")
    void approvedRoomChangeCannotBeManuallyRevertedAfterItsWindow() {
        TenancyRoomChangeRequest request = newRoomChange();
        request.approve(OWNER, null);
        ReflectionTestUtils.setField(request, "expiresAt", Instant.now().minusSeconds(1));

        assertThatThrownBy(() -> request.revertApproval(Instant.now()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("can no longer be reverted");
    }

    @Test
    @DisplayName("a scheduled move that could not run is cancelled, never reopened for a decision")
    void failedScheduledRunCancelsTheApproval() {
        TenancyRoomChangeRequest request = newRoomChange();
        request.approve(OWNER, null);
        // Past the manual reversal window, which a failed run does not depend on.
        ReflectionTestUtils.setField(request, "expiresAt", Instant.now().minusSeconds(1));
        Instant now = Instant.now();

        request.cancelAfterExecutionFailure(now, "The tenancy is no longer active at this property.");

        assertThat(request.getStatus()).isEqualTo(TenancyRoomChangeRequestStatus.CANCELLED);
        assertThat(request.getAdminNotes()).isEqualTo("The tenancy is no longer active at this property.");
        assertThat(request.isActivelyOpen(now.plusSeconds(1))).isFalse();
    }

    @Test
    @DisplayName("only an approved move that has not run can be cancelled after a failed run")
    void failedRunCancellationNeedsAnApprovedMove() {
        TenancyRoomChangeRequest request = newRoomChange();

        assertThatThrownBy(() -> request.cancelAfterExecutionFailure(Instant.now(), "anything"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Only an unexecuted approved room change can be cancelled");

        assertThat(request.getStatus()).isEqualTo(TenancyRoomChangeRequestStatus.REQUESTED);
    }
}
