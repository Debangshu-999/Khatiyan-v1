package com.khatiyan.d_modules.billing.api.dto;

import java.time.Instant;
import java.util.List;
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
    List<String> proofImageUrls,
    String note,
    UUID collectedByUserId,
    Instant collectedAt,
    /** When the tenant confirmed it with their code. Null unless cash was confirmed. */
    Instant tenantConfirmedAt
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
            payment.getProofImageUrls(),
            payment.getNote(),
            payment.getCollectedByUserId(),
            payment.getCollectedAt(),
            payment.getTenantConfirmedAt()
        );
    }
}
