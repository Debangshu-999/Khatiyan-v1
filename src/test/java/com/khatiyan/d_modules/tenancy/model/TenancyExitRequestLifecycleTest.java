package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * The request lifecycle rules: expiry, the two forms of withdrawal, mandatory
 * rejection reasons, and re-raise eligibility.
 *
 * <p>These assert the *policy*, not the plumbing — that an owner cannot silently
 * refuse a departure, that inaction cannot put someone on notice, and that the
 * windows close when they are supposed to.
 */
class TenancyExitRequestLifecycleTest {

    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    private static final LocalDate CHECKOUT = LocalDate.of(2026, 9, 30);

    private static TenancyExitRequest newRequest() {
        return TenancyExitRequest.normalNotice(
                UUID.randomUUID(), TENANT, UUID.randomUUID(), UUID.randomUUID(), CHECKOUT, "moving out");
    }

    private static TenancyExitRequest approvedRequest() {
        TenancyExitRequest request = newRequest();
        request.approveNormal(OWNER, null, null, null, null);
        return request;
    }

    /** Rewinds a decision so a window can be tested as though time had passed. */
    private static void decidedDaysAgo(TenancyExitRequest request, long days) {
        ReflectionTestUtils.setField(
                request, "decidedAt", Instant.now().minus(days, ChronoUnit.DAYS));
    }

    private static void statusOf(TenancyExitRequest request, TenancyExitRequestStatus status) {
        ReflectionTestUtils.setField(request, "status", status);
    }

    // ---------------------------------------------------------------- expiry

    @Test
    @DisplayName("expiry changes the status and nothing else")
    void expiryIsInert() {
        TenancyExitRequest request = newRequest();
        request.expire();

        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.EXPIRED);
        // No decision was made, so nothing may look as though one was — an
        // expired request that carried a decider would read as a silent refusal.
        assertThat(request.getDecidedByUserId()).isNull();
        assertThat(request.getDecidedAt()).isNull();
        assertThat(request.getApprovedCheckoutDate()).isNull();
    }

    @ParameterizedTest(name = "a {0} request cannot be expired")
    @EnumSource(value = TenancyExitRequestStatus.class, names = {"REQUESTED"}, mode = EnumSource.Mode.EXCLUDE)
    void onlyPendingRequestsExpire(TenancyExitRequestStatus status) {
        TenancyExitRequest request = newRequest();
        statusOf(request, status);

        assertThatThrownBy(request::expire).isInstanceOf(ValidationException.class);
    }

    // ------------------------------------------------------------- rejection

    @Test
    @DisplayName("rejecting without a reason is refused")
    void rejectionDemandsAReason() {
        assertThatThrownBy(() -> newRequest().reject(OWNER, null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("reason is required");

        assertThatThrownBy(() -> newRequest().reject(OWNER, "   "))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    @DisplayName("approving needs no reason")
    void approvalDoesNotDemandAReason() {
        TenancyExitRequest request = newRequest();

        assertThatCode(() -> request.approveNormal(OWNER, null, null, null, null))
                .doesNotThrowAnyException();
        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.APPROVED);
    }

    // ------------------------------------------------------------ withdrawal

    @Test
    @DisplayName("a tenant may undo an approval inside the window, and the exit stays live until the owner decides")
    void withdrawalInsideTheWindow() {
        TenancyExitRequest request = approvedRequest();

        request.requestWithdrawal(TENANT, "changed my mind", LocalDate.of(2026, 9, 1));

        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.WITHDRAWAL_REQUESTED);
        assertThat(request.getWithdrawalRequestedAt()).isNotNull();
        // Still carries its checkout date: nothing is undone until the owner agrees.
        assertThat(request.getApprovedCheckoutDate()).isEqualTo(CHECKOUT);
    }

    @Test
    @DisplayName("the withdrawal window closes 3 days after approval")
    void withdrawalWindowClosesAfterThreeDays() {
        TenancyExitRequest request = approvedRequest();
        decidedDaysAgo(request, TenancyExitRequest.WITHDRAWAL_WINDOW_DAYS);

        assertThat(request.withdrawalWindowOpen(LocalDate.of(2026, 9, 1))).isFalse();
        assertThatThrownBy(() -> request.requestWithdrawal(TENANT, null, LocalDate.of(2026, 9, 1)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("window to withdraw");
    }

    @Test
    @DisplayName("the window is still open the day before it closes")
    void withdrawalWindowOpenJustBeforeTheDeadline() {
        TenancyExitRequest request = approvedRequest();
        decidedDaysAgo(request, TenancyExitRequest.WITHDRAWAL_WINDOW_DAYS - 1);

        assertThat(request.withdrawalWindowOpen(LocalDate.of(2026, 9, 1))).isTrue();
    }

    @Test
    @DisplayName("withdrawal is refused once the checkout date has arrived, however recent the approval")
    void noWithdrawalOnceCheckoutArrives() {
        TenancyExitRequest request = approvedRequest();

        assertThat(request.withdrawalWindowOpen(CHECKOUT)).isFalse();
        assertThat(request.withdrawalWindowOpen(CHECKOUT.plusDays(1))).isFalse();
        assertThat(request.withdrawalWindowOpen(CHECKOUT.minusDays(1))).isTrue();
    }

    @Test
    @DisplayName("only the tenant who raised the exit may withdraw it")
    void onlyTheTenantMayWithdraw() {
        TenancyExitRequest request = approvedRequest();

        assertThatThrownBy(() -> request.requestWithdrawal(UUID.randomUUID(), null, LocalDate.of(2026, 9, 1)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Only the tenant");
    }

    @Test
    @DisplayName("an unapproved request is cancelled, not withdrawn")
    void withdrawalRequiresAnApproval() {
        assertThatThrownBy(() -> newRequest().requestWithdrawal(TENANT, null, LocalDate.of(2026, 9, 1)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Only an approved exit request");
    }

    @Test
    @DisplayName("the owner allowing a withdrawal voids the exit")
    void owningApprovingAWithdrawalVoidsTheExit() {
        TenancyExitRequest request = approvedRequest();
        request.requestWithdrawal(TENANT, "staying", LocalDate.of(2026, 9, 1));

        request.approveWithdrawal(OWNER, "fine by us");

        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.CANCELLED);
        assertThat(request.getWithdrawalDecidedByUserId()).isEqualTo(OWNER);
        assertThat(request.getWithdrawalDecidedAt()).isNotNull();
    }

    @Test
    @DisplayName("the owner vetoing a withdrawal leaves the exit approved and the date untouched")
    void ownerVetoLeavesTheExitStanding() {
        TenancyExitRequest request = approvedRequest();
        request.requestWithdrawal(TENANT, "staying", LocalDate.of(2026, 9, 1));

        // No reason given: this veto means only "no".
        request.rejectWithdrawal(OWNER, null);

        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.APPROVED);
        assertThat(request.getApprovedCheckoutDate()).isEqualTo(CHECKOUT);
        assertThat(request.getWithdrawalDecidedAt()).isNotNull();
    }

    @Test
    @DisplayName("a withdrawal decision needs a pending withdrawal")
    void withdrawalDecisionNeedsAPendingWithdrawal() {
        TenancyExitRequest request = approvedRequest();

        assertThatThrownBy(() -> request.approveWithdrawal(OWNER, null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("No withdrawal is pending");
    }

    // --------------------------------------------------------------- re-raise

    @ParameterizedTest(name = "a {0} request may be re-raised on its original anchor")
    @EnumSource(value = TenancyExitRequestStatus.class, names = {"EXPIRED", "REJECTED"})
    void lapsedRequestsMayBeReRaised(TenancyExitRequestStatus status) {
        TenancyExitRequest request = newRequest();
        statusOf(request, status);
        decidedDaysAgo(request, 0);

        assertThat(request.allowsReRaiseOn(LocalDate.now())).isTrue();
    }

    @ParameterizedTest(name = "a {0} request may NOT be re-raised on the original anchor")
    @EnumSource(
            value = TenancyExitRequestStatus.class,
            names = {"EXPIRED", "REJECTED"},
            mode = EnumSource.Mode.EXCLUDE)
    void otherOutcomesDoNotQualify(TenancyExitRequestStatus status) {
        TenancyExitRequest request = newRequest();
        statusOf(request, status);
        decidedDaysAgo(request, 0);

        // Cancelling was the tenant's own doing, and an approved or executed exit
        // has nothing to re-raise. Only outcomes that were not the tenant's fault
        // earn the carve-out.
        assertThat(request.allowsReRaiseOn(LocalDate.now())).isFalse();
    }

    @ParameterizedTest(name = "re-raise still allowed {0} day(s) after the lapse")
    @ValueSource(longs = {0, 1, 2, 3})
    void reRaiseAllowedInsideItsWindow(long daysAgo) {
        TenancyExitRequest request = newRequest();
        statusOf(request, TenancyExitRequestStatus.EXPIRED);
        decidedDaysAgo(request, daysAgo);

        assertThat(request.allowsReRaiseOn(LocalDate.now())).isTrue();
    }

    @Test
    @DisplayName("re-raise on the original anchor is blocked once its window passes")
    void reRaiseBlockedAfterItsWindow() {
        TenancyExitRequest request = newRequest();
        statusOf(request, TenancyExitRequestStatus.EXPIRED);
        decidedDaysAgo(request, TenancyExitRequest.RE_RAISE_WINDOW_DAYS + 1);

        assertThat(request.allowsReRaiseOn(LocalDate.now())).isFalse();
    }

    @Test
    @DisplayName("a re-raise inherits the original request's notice anchor, not today's date")
    void reRaiseInheritsTheAnchor() {
        TenancyExitRequest original = newRequest();
        LocalDate originalAnchor = LocalDate.of(2026, 8, 2);
        ReflectionTestUtils.setField(original, "noticeAnchorDate", originalAnchor);
        statusOf(original, TenancyExitRequestStatus.EXPIRED);

        TenancyExitRequest reRaised = TenancyExitRequest.normalNotice(
                null, original.getTenancyId(), TENANT, original.getPropertyId(), original.getRoomId(),
                CHECKOUT, "asking again", original);

        assertThat(reRaised.getNoticeAnchorDate()).isEqualTo(originalAnchor);
        assertThat(reRaised.getSupersededRequestId()).isEqualTo(original.getId());
    }

    @Test
    @DisplayName("an ordinary request anchors on itself")
    void ordinaryRequestAnchorsOnItself() {
        TenancyExitRequest request = newRequest();

        assertThat(request.getNoticeAnchorDate()).isNotNull();
        assertThat(request.getSupersededRequestId()).isNull();
    }
}
