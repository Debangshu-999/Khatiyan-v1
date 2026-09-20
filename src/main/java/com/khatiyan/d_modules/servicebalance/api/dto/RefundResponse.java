package com.khatiyan.d_modules.servicebalance.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefund;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefundReason;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefundStatus;

/**
 * One refund, as the owner sees it.
 *
 * <p>Several can come back from one request: money returns only to the payments
 * that funded it, so a large refund is several smaller ones at the gateway.
 */
public record RefundResponse(
        UUID id,
        long amountPaise,
        ServiceBalanceRefundStatus status,
        ServiceBalanceRefundReason reason,
        Instant processedAt) {

    public static RefundResponse from(ServiceBalanceRefund refund) {
        return new RefundResponse(
                refund.getId(),
                refund.getAmountPaise(),
                refund.getStatus(),
                refund.getReason(),
                refund.getProcessedAt());
    }
}
