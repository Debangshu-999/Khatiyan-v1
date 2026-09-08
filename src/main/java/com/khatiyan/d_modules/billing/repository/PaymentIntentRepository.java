package com.khatiyan.d_modules.billing.repository;

import java.util.Collection;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.billing.model.PaymentIntent;
import com.khatiyan.d_modules.billing.model.PaymentIntentStatus;

@Repository
public interface PaymentIntentRepository extends JpaRepository<PaymentIntent, UUID> {

    /**
     * The open attempt on a bill, if there is one.
     *
     * <p>
     * At most one can exist — a partial unique index enforces it — so this
     * returns an Optional rather than a list. That index IS the "Pay Now stays
     * blocked" rule, and this is how every reader asks about it.
     */
    Optional<PaymentIntent> findFirstByBillingCycleIdAndStatusIn(
            UUID billingCycleId, Collection<PaymentIntentStatus> statuses);

    /**
     * Every attempt on one bill by one person, newest first — the ledger.
     *
     * <p>
     * Scoped by tenant as part of the query rather than filtered afterwards, so
     * a mistaken cycle id cannot return somebody else's attempts. Matches
     * {@code idx_payment_intents_tenant_cycle}.
     */
    List<PaymentIntent> findByTenantUserIdAndBillingCycleIdOrderByCreatedAtDesc(
            UUID tenantUserId, UUID billingCycleId);

    /**
     * Live attempts across a whole stay, for a bill list.
     *
     * <p>
     * One query for the screen rather than one per card, so every bill can lock
     * its own Pay button without a round trip each.
     */
    List<PaymentIntent> findByTenancyIdAndTenantUserIdAndStatusIn(
            UUID tenancyId, UUID tenantUserId, Collection<PaymentIntentStatus> statuses);

    /**
     * Live attempts across a page of bills, in one query.
     *
     * <p>
     * The tenant's bill list renders a Pay Now button per row, and asking per
     * row would be a round trip per bill on a screen whose whole job is showing
     * many.
     */
    List<PaymentIntent> findByBillingCycleIdInAndStatusIn(
            Collection<UUID> billingCycleIds, Collection<PaymentIntentStatus> statuses);

    /** The owner's review queue: oldest claim first, so nobody waits longest. */
    /**
     * The claims on a property inside a window that its owner may see, newest
     * first.
     *
     * <p>
     * <b>Status-bounded, and that is a privacy rule rather than a filter.</b> A
     * tenant who opens a payment and never answers, or answers "it failed", has
     * told the owner nothing — those attempts are the tenant's own record of
     * trying to pay, and are theirs alone. Only an attempt the tenant actually
     * submitted has ever been addressed to the owner.
     *
     * <p>
     * Decided ones stay, though: an owner is as often checking what they already
     * approved — "did I confirm that one?" — as working the queue, and a list
     * that forgets a claim the moment it is settled cannot answer that.
     */
    List<PaymentIntent> findByPropertyIdAndStatusInAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
            UUID propertyId, Collection<PaymentIntentStatus> statuses, Instant from, Instant until);

    /** Claims this owner has finished with, for the digest's resolved count. */
    long countByPropertyIdAndStatusInAndOwnerDecidedAtGreaterThanEqualAndOwnerDecidedAtLessThan(
            UUID propertyId, Collection<PaymentIntentStatus> statuses, Instant from, Instant until);

    List<PaymentIntent> findByPropertyIdAndStatusOrderByCreatedAtAsc(
            UUID propertyId, PaymentIntentStatus status);

    long countByPropertyIdAndStatus(UUID propertyId, PaymentIntentStatus status);
}
