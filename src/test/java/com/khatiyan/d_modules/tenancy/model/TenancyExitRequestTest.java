package com.khatiyan.d_modules.tenancy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

class TenancyExitRequestTest {

    @Test
    void normalNoticeStartsAsRequestedWithCalculatedCheckoutDate() {
        LocalDate checkoutDate = LocalDate.of(2026, 6, 30);

        TenancyExitRequest request = TenancyExitRequest.normalNotice(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                checkoutDate,
                " Moving out ");

        assertThat(request.getType()).isEqualTo(TenancyExitRequestType.NORMAL_NOTICE);
        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.REQUESTED);
        assertThat(request.getRequestedCheckoutDate()).isEqualTo(checkoutDate);
        assertThat(request.getTenantReason()).isEqualTo("Moving out");
        assertThat(request.isNormalNotice()).isTrue();
    }

    @Test
    void approvingNormalUsesRequestedCheckoutDate() {
        UUID actorUserId = UUID.randomUUID();
        TenancyExitRequest request = normalRequest();

        request.approveNormal(actorUserId, 12_000_00L, true, 8_000_00L, " Approved ");

        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.APPROVED);
        assertThat(request.getApprovedCheckoutDate()).isEqualTo(request.getRequestedCheckoutDate());
        assertThat(request.getFinalBillingAmountPaise()).isEqualTo(12_000_00);
        assertThat(request.getDepositPayable()).isTrue();
        assertThat(request.getDepositSettlementAmountPaise()).isEqualTo(8_000_00);
        assertThat(request.getAdminNotes()).isEqualTo("Approved");
        assertThat(request.getDecidedByUserId()).isEqualTo(actorUserId);
        assertThat(request.getDecidedAt()).isNotNull();
    }

    @Test
    void prematureApprovalRequiresApprovedCheckoutDate() {
        TenancyExitRequest request = prematureRequest();

        assertThatThrownBy(() -> request.approvePremature(
                UUID.randomUUID(),
                null,
                12_000_00L,
                false,
                0L,
                "missing date"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Approved checkout date is required");
    }

    @Test
    void rejectingRequestIsTerminalForFurtherApproval() {
        TenancyExitRequest request = normalRequest();
        request.reject(UUID.randomUUID(), "Not allowed");

        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.REJECTED);

        assertThatThrownBy(() -> request.approveNormal(UUID.randomUUID(), 0L, false, 0L, "late approval"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Exit request is not pending review");
    }

    @Test
    void onlyTenantCanCancelRequestedExitRequest() {
        UUID tenantUserId = UUID.randomUUID();
        TenancyExitRequest request = TenancyExitRequest.premature(
                UUID.randomUUID(),
                tenantUserId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                LocalDate.of(2026, 6, 10),
                "Transfer");

        assertThatThrownBy(() -> request.cancel(UUID.randomUUID()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Only the tenant can cancel this exit request");

        request.cancel(tenantUserId);
        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.CANCELLED);
    }

    @Test
    void onlyApprovedRequestCanBeExecuted() {
        TenancyExitRequest request = normalRequest();

        assertThatThrownBy(request::markExecuted)
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Only approved exit requests can be executed");

        request.approveNormal(UUID.randomUUID(), 12_000_00L, true, 8_000_00L, "approved");
        request.markExecuted();

        assertThat(request.getStatus()).isEqualTo(TenancyExitRequestStatus.EXECUTED);
        assertThat(request.getExecutedAt()).isNotNull();
    }

    @Test
    void negativeSettlementAmountsAreRejected() {
        TenancyExitRequest request = normalRequest();

        assertThatThrownBy(() -> request.approveNormal(
                UUID.randomUUID(),
                12_000_00L,
                true,
                -1L,
                "bad settlement"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Deposit settlement amount cannot be negative");
    }

    private static TenancyExitRequest normalRequest() {
        return TenancyExitRequest.normalNotice(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                LocalDate.of(2026, 6, 30),
                "Moving out");
    }

    private static TenancyExitRequest prematureRequest() {
        return TenancyExitRequest.premature(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                LocalDate.of(2026, 6, 10),
                "Transfer");
    }
}
