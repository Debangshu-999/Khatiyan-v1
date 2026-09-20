package com.khatiyan.d_modules.servicebalance.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One movement of one balance. Append-only: rows here are never updated and
 * never deleted, and the counters on the account are a cache of their sums.
 *
 * <p><b>Both deltas, not one signed amount.</b> A reserve moves money between
 * available and reserved without changing the total, which a single figure
 * cannot express. With both, reconciliation is a plain sum that needs to know
 * nothing about what each type means.
 *
 * <p>The resulting balances are stamped on the row as well, so a statement line
 * reads on its own and a replayed or out-of-order write is obvious instead of
 * silent.
 */
@Entity
@Table(name = "service_balance_entries", schema = "servicebalance")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ServiceBalanceEntry extends BaseEntity {

    public static final int MAX_MEMO_LENGTH = 160;
    public static final int MAX_IDEMPOTENCY_KEY_LENGTH = 120;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "account_id", nullable = false, updatable = false)
    private UUID accountId;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type", nullable = false, updatable = false, length = 20)
    private ServiceBalanceEntryType entryType;

    @Column(name = "available_delta_paise", nullable = false, updatable = false)
    private long availableDeltaPaise;

    @Column(name = "reserved_delta_paise", nullable = false, updatable = false)
    private long reservedDeltaPaise;

    /** What this movement did to money owed. */
    @Column(name = "outstanding_delta_paise", nullable = false, updatable = false)
    private long outstandingDeltaPaise;

    @Column(name = "available_after_paise", nullable = false, updatable = false)
    private long availableAfterPaise;

    @Column(name = "reserved_after_paise", nullable = false, updatable = false)
    private long reservedAfterPaise;

    @Column(name = "outstanding_after_paise", nullable = false, updatable = false)
    private long outstandingAfterPaise;

    @Enumerated(EnumType.STRING)
    @Column(name = "reference_type", nullable = false, updatable = false, length = 20)
    private ServiceBalanceReferenceType referenceType;

    @Column(name = "reference_id", updatable = false)
    private UUID referenceId;

    /**
     * The one thing standing between a retried webhook and a double credit.
     *
     * <p>Unique in the database. Callers do not check whether they have already
     * written a row — they write, and a duplicate key means someone else already
     * did the work.
     */
    @Column(name = "idempotency_key", nullable = false, updatable = false, length = MAX_IDEMPOTENCY_KEY_LENGTH)
    private String idempotencyKey;

    /** Shown on the owner's statement. Plain words. */
    @Column(length = MAX_MEMO_LENGTH, updatable = false)
    private String memo;

    /** Null when the system moved the money — a webhook, a sweep. */
    @Column(name = "actor_user_id", updatable = false)
    private UUID actorUserId;

    private ServiceBalanceEntry(
            ServiceBalanceAccount account,
            ServiceBalanceEntryType entryType,
            long availableDeltaPaise,
            long reservedDeltaPaise,
            long outstandingDeltaPaise,
            ServiceBalanceReferenceType referenceType,
            UUID referenceId,
            String idempotencyKey,
            String memo,
            UUID actorUserId) {
        this.id = UUID.randomUUID();
        this.accountId = account.getId();
        this.entryType = entryType;
        this.availableDeltaPaise = availableDeltaPaise;
        this.reservedDeltaPaise = reservedDeltaPaise;
        this.outstandingDeltaPaise = outstandingDeltaPaise;
        this.availableAfterPaise = account.getAvailablePaise();
        this.reservedAfterPaise = account.getReservedPaise();
        this.outstandingAfterPaise = account.getOutstandingPaise();
        this.referenceType = referenceType;
        this.referenceId = referenceId;
        this.idempotencyKey = idempotencyKey;
        this.memo = memo;
        this.actorUserId = actorUserId;
    }

    /**
     * Records a movement that has ALREADY been applied to the account.
     *
     * <p>Called after the account's own method has run and refused or succeeded,
     * so the after-balances stamped here are the real ones rather than a
     * prediction that could drift from what was saved.
     */
    public static ServiceBalanceEntry record(
            ServiceBalanceAccount account,
            ServiceBalanceEntryType entryType,
            long availableDeltaPaise,
            long reservedDeltaPaise,
            long outstandingDeltaPaise,
            ServiceBalanceReferenceType referenceType,
            UUID referenceId,
            String idempotencyKey,
            String memo,
            UUID actorUserId) {
        if (account == null || entryType == null || referenceType == null) {
            throw new ValidationException("A ledger entry needs an account, a type and a reference");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new ValidationException("A ledger entry needs an idempotency key");
        }
        if (idempotencyKey.length() > MAX_IDEMPOTENCY_KEY_LENGTH) {
            throw new ValidationException("Idempotency key is too long");
        }
        if (availableDeltaPaise == 0 && reservedDeltaPaise == 0 && outstandingDeltaPaise == 0) {
            throw new ValidationException("A ledger entry that moves nothing is not an entry");
        }
        return new ServiceBalanceEntry(
                account,
                entryType,
                availableDeltaPaise,
                reservedDeltaPaise,
                outstandingDeltaPaise,
                referenceType,
                referenceId,
                idempotencyKey,
                memo == null || memo.isBlank() ? null : memo.trim(),
                actorUserId);
    }
}
