package com.khatiyan.d_modules.billing.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.billing.model.BillingManualPayment;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;

public record ManualPaymentResponse(
    UUID id,
    UUID billingCycleId,
    UUID tenancyId,
    UUID tenantUserId,
    UUID propertyId,
    long amountPaise,
    ManualPaymentMethod method,
    String referenceText,
    String proofImageUrl,
    String note,
    UUID collectedByUserId,
    Instant collectedAt
) {

    public static ManualPaymentResponse from(BillingManualPayment payment) {
        return new ManualPaymentResponse(
            payment.getId(),
            payment.getBillingCycleId(),
            payment.getTenancyId(),
            payment.getTenantUserId(),
            payment.getPropertyId(),
            payment.getAmountPaise(),
            payment.getMethod(),
            payment.getReferenceText(),
            payment.getProofImageUrl(),
            payment.getNote(),
            payment.getCollectedByUserId(),
            payment.getCollectedAt()
        );
    }
}
