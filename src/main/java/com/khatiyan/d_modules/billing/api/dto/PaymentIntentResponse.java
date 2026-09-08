package com.khatiyan.d_modules.billing.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.billing.model.PaymentIntent;
import com.khatiyan.d_modules.billing.model.PaymentIntentStatus;

/**
 * One payment attempt, as both sides read it.
 *
 * <p>The same shape for tenant and owner. Nothing here is private to one of
 * them — the tenant knows what they claimed, and the owner needs exactly that
 * claim to check it against their statement.
 */
public record PaymentIntentResponse(
    UUID id,
    UUID billingCycleId,
    PaymentIntentStatus status,

    /**
     * Whether this attempt still blocks a fresh one.
     *
     * <p>Sent rather than derived on the client, so there is one definition of
     * "blocked" and it is the server's.
     */
    boolean live,

    /** Snapshots taken when the link was built, not current values. */
    long amountPaise,
    String referenceCode,

    /** Who the bill is for. Null on the tenant's own view, where it is obvious. */
    String tenantName,

    /** The tenant's UTR, if they gave one. */
    String tenantReferenceText,
    String tenantNote,
    List<String> proofImageUrls,

    Instant createdAt,
    Instant tenantDecidedAt,
    Instant ownerDecidedAt
) {

    public static PaymentIntentResponse from(PaymentIntent intent, String tenantName) {
        return new PaymentIntentResponse(
                intent.getId(),
                intent.getBillingCycleId(),
                intent.getStatus(),
                intent.isLive(),
                intent.getAmountPaise(),
                intent.getReferenceCode(),
                tenantName,
                intent.getTenantReferenceText(),
                intent.getTenantNote(),
                List.copyOf(intent.getProofImageUrls()),
                intent.getCreatedAt(),
                intent.getTenantDecidedAt(),
                intent.getOwnerDecidedAt());
    }
}
