package com.khatiyan.d_modules.servicebalance.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One owner's prepaid balance.
 *
 * <p>Per owner rather than per property: an owner pays for work across every
 * building they run, and a per-property balance would strand money in whichever
 * one happened to be topped up.
 *
 * <p><b>Every rule about this money lives in this class.</b> The two counters
 * are only ever moved by the methods below, each of which refuses rather than
 * goes negative, so no caller can invent money by forgetting a check. The
 * database repeats the same guards as CHECK constraints, because this is the one
 * place in the app where a lost update is a real rupee.
 */
@Entity
@Table(name = "service_balance_accounts", schema = "servicebalance")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ServiceBalanceAccount extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "owner_user_id", nullable = false, updatable = false)
    private UUID ownerUserId;

    /** Spendable right now. */
    @Column(name = "available_paise", nullable = false)
    private long availablePaise;

    /**
     * Held against work that has been asked for but not yet billed by the
     * provider. Not spendable, and not yet spent.
     */
    @Column(name = "reserved_paise", nullable = false)
    private long reservedPaise;

    /**
     * What the owner owes us.
     *
     * <p>A service can run with nothing behind it — a manager should not be
     * stopped mid-onboarding because the balance hit zero — and the cost lands
     * here rather than dragging available below zero. The next top-up settles
     * it before anything becomes spendable.
     */
    @Column(name = "outstanding_paise", nullable = false)
    private long outstandingPaise;

    /** Set when the bank claws a payment back, or by hand. */
    @Column(name = "locked_at")
    private java.time.Instant lockedAt;

    @Column(name = "locked_reason", length = 200)
    private String lockedReason;

    /**
     * Optimistic lock.
     *
     * <p>Two verification requests racing for the last Rs 30 must not both
     * succeed. Without this the second read sees a stale balance and both
     * writes land.
     */
    @Version
    @Column(nullable = false)
    private long version;

    private ServiceBalanceAccount(UUID ownerUserId) {
        this.id = UUID.randomUUID();
        this.ownerUserId = ownerUserId;
        this.availablePaise = 0L;
        this.reservedPaise = 0L;
    }

    public static ServiceBalanceAccount open(UUID ownerUserId) {
        if (ownerUserId == null) {
            throw new ValidationException("An account needs an owner");
        }
        return new ServiceBalanceAccount(ownerUserId);
    }

    /** Available plus held. What the owner has paid in and not yet spent. */
    public long totalPaise() {
        return availablePaise + reservedPaise;
    }

    public boolean isLocked() {
        return lockedAt != null;
    }

    /**
     * Records a charge the balance could not cover.
     *
     * <p>Called only when there is nothing to take it from. The service has
     * already run and the provider has already billed us, so refusing to record
     * it would lose the debt, not prevent it.
     */
    public void chargeToOutstanding(long amountPaise) {
        requirePositive(amountPaise);
        this.outstandingPaise += amountPaise;
    }

    /**
     * Takes dues out of spendable money, and reports how much it could take.
     *
     * <p>Run on every credit, before the owner can spend any of it. A top-up
     * that left dues standing would let somebody top up, spend, and walk away
     * from the debt.
     */
    public long settleOutstanding() {
        long settled = Math.min(outstandingPaise, availablePaise);
        if (settled <= 0) {
            return 0L;
        }
        this.outstandingPaise -= settled;
        this.availablePaise -= settled;
        return settled;
    }

    /**
     * What could actually go back to the owner's card.
     *
     * <p>Zero while anything is owed. Refunding money out of an account that
     * owes us is how we would end up paying the provider on somebody else's
     * behalf and having nothing left to collect against.
     */
    public long refundablePaise() {
        return outstandingPaise > 0 ? 0L : availablePaise;
    }

    public void lock(String reason, java.time.Instant at) {
        this.lockedAt = at;
        this.lockedReason = reason;
    }

    public void unlock() {
        this.lockedAt = null;
        this.lockedReason = null;
    }

    /** Money in, from a captured payment or a correction in the owner's favour. */
    public void credit(long amountPaise) {
        requirePositive(amountPaise);
        this.availablePaise += amountPaise;
    }

    /**
     * Money out of the closed loop: a refund to the original payment method, or
     * a chargeback the bank took without asking.
     *
     * <p>Only ever from available. Reserved money is promised to work already in
     * flight, and spent money is gone.
     */
    public void debit(long amountPaise) {
        requirePositive(amountPaise);
        if (availablePaise < amountPaise) {
            throw new ValidationException("This balance does not cover that amount");
        }
        this.availablePaise -= amountPaise;
    }

    /** Hold money against work that has been requested. */
    public void reserve(long amountPaise) {
        requirePositive(amountPaise);
        if (availablePaise < amountPaise) {
            throw new ValidationException("Add money to your Service balance to continue");
        }
        this.availablePaise -= amountPaise;
        this.reservedPaise += amountPaise;
    }

    /** The held work never happened, so the hold goes back to spendable. */
    public void release(long amountPaise) {
        requirePositive(amountPaise);
        requireHeld(amountPaise);
        this.reservedPaise -= amountPaise;
        this.availablePaise += amountPaise;
    }

    /**
     * The provider billed us for work that was never held.
     *
     * <p><b>This is how a paid service is actually paid for.</b> Khatiyan
     * prepays the provider, so the work runs whatever this balance says and
     * cannot be refused here — by the time this is called the provider has
     * already done it and already billed us. What this balance does is record
     * the consumption: what was used, and what is left.
     *
     * <p>Takes what it can from spendable money and puts only the remainder on
     * the tab. Sending the whole charge to dues because it did not fit would
     * leave an owner looking at money they had already spent, with a debt
     * standing beside it.
     *
     * <p>Never touches held money. Holds belong to work already in flight
     * elsewhere, and this spend is not that work.
     */
    public ServiceSpendSplit spend(long amountPaise) {
        requirePositive(amountPaise);
        long fromAvailable = Math.min(availablePaise, amountPaise);
        long remainder = amountPaise - fromAvailable;
        this.availablePaise -= fromAvailable;
        this.outstandingPaise += remainder;
        return new ServiceSpendSplit(fromAvailable, remainder);
    }

    /**
     * The provider billed us for work we asked them to do.
     *
     * <p>Takes from reserved, never from available: charging money that was
     * never held would mean billing for work nobody reserved for.
     */
    public void charge(long amountPaise) {
        requirePositive(amountPaise);
        requireHeld(amountPaise);
        this.reservedPaise -= amountPaise;
    }

    private void requireHeld(long amountPaise) {
        if (reservedPaise < amountPaise) {
            throw new ValidationException("That amount is not being held on this balance");
        }
    }

    private static void requirePositive(long amountPaise) {
        if (amountPaise <= 0) {
            throw new ValidationException("Amount must be more than zero");
        }
    }
}
