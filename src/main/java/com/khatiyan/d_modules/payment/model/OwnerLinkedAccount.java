package com.khatiyan.d_modules.payment.model;

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
 * An owner's payout account for Razorpay Route. Only non-sensitive bank fields
 * are persisted; the full account number is sent to the gateway at creation and
 * never stored here. A Route transfer targets {@code razorpayAccountId} once the
 * account is {@link OwnerLinkedAccountStatus#ACTIVE}.
 *
 * <p>An owner may keep a second account on file, but exactly one is
 * {@link #isPrimary() primary} — that is the one rent is transferred to. A
 * partial unique index in the database guards the invariant.
 */
@Entity
@Table(name = "owner_linked_accounts", schema = "payment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OwnerLinkedAccount extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "owner_user_id", nullable = false, updatable = false)
    private UUID ownerUserId;

    @Column(name = "account_holder_name", nullable = false, length = 160)
    private String accountHolderName;

    @Column(name = "account_number_last4", nullable = false, length = 4)
    private String accountNumberLast4;

    @Column(nullable = false, length = 16)
    private String ifsc;

    @Column(name = "razorpay_account_id", length = 120)
    private String razorpayAccountId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private OwnerLinkedAccountStatus status;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    @Column(name = "is_primary", nullable = false)
    private boolean primary;

    /** Resolved from the IFSC at onboarding; null when the directory was unreachable. */
    @Column(name = "bank_name", length = 160)
    private String bankName;

    @Column(name = "branch_name", length = 160)
    private String branchName;

    /**
     * Account holder's PAN. Needed for Razorpay's KYC and for reporting TDS
     * withheld against the owner. Sensitive: never expose beyond the owner it
     * belongs to.
     */
    @Column(length = 10)
    private String pan;

    private OwnerLinkedAccount(
            UUID ownerUserId,
            String accountHolderName,
            String accountNumberLast4,
            String ifsc,
            String razorpayAccountId,
            OwnerLinkedAccountStatus status,
            boolean primary) {
        this.id = UUID.randomUUID();
        this.ownerUserId = ownerUserId;
        this.accountHolderName = accountHolderName;
        this.accountNumberLast4 = accountNumberLast4;
        this.ifsc = ifsc;
        this.razorpayAccountId = razorpayAccountId;
        this.status = status;
        this.primary = primary;
    }

    public static OwnerLinkedAccount create(
            UUID ownerUserId,
            String accountHolderName,
            String accountNumberLast4,
            String ifsc,
            String razorpayAccountId,
            OwnerLinkedAccountStatus status,
            boolean primary) {
        if (accountHolderName == null || accountHolderName.isBlank()) {
            throw new ValidationException("Account holder name is required");
        }
        if (ifsc == null || ifsc.isBlank()) {
            throw new ValidationException("IFSC is required");
        }
        return new OwnerLinkedAccount(
                ownerUserId,
                accountHolderName,
                accountNumberLast4,
                ifsc,
                razorpayAccountId,
                status,
                primary);
    }

    public void updatePan(String pan) {
        this.pan = pan;
    }

    /** Holder type encoded in the 4th PAN character — 'P' means an individual. */
    public boolean isIndividualPan() {
        return pan != null && pan.length() == 10 && Character.toUpperCase(pan.charAt(3)) == 'P';
    }

    /** Re-submit new bank details on an existing (e.g. FAILED) account. */
    public void updateDetails(String accountHolderName, String accountNumberLast4, String ifsc) {
        // A new IFSC means a different branch, so the cached bank/branch names
        // are stale — drop them rather than let them contradict the new code.
        if (this.ifsc != null && !this.ifsc.equalsIgnoreCase(ifsc)) {
            this.bankName = null;
            this.branchName = null;
        }
        this.accountHolderName = accountHolderName;
        this.accountNumberLast4 = accountNumberLast4;
        this.ifsc = ifsc;
    }

    public void markActive(String razorpayAccountId) {
        this.razorpayAccountId = razorpayAccountId;
        this.status = OwnerLinkedAccountStatus.ACTIVE;
        this.failureReason = null;
    }

    public void markPending(String razorpayAccountId) {
        this.razorpayAccountId = razorpayAccountId;
        this.status = OwnerLinkedAccountStatus.PENDING;
        this.failureReason = null;
    }

    public void markFailed(String failureReason) {
        this.status = OwnerLinkedAccountStatus.FAILED;
        this.failureReason = failureReason;
    }

    /**
     * Records the bank/branch the IFSC resolved to. Passing nulls (directory
     * unreachable) leaves whatever was already known intact rather than
     * blanking a good value.
     */
    public void describeBank(String bankName, String branchName) {
        if (bankName != null && !bankName.isBlank()) {
            this.bankName = bankName;
        }
        if (branchName != null && !branchName.isBlank()) {
            this.branchName = branchName;
        }
    }

    /** Makes this the account rent is transferred to. */
    public void markPrimary() {
        this.primary = true;
    }

    /** Keeps the bank on file but stops routing money to it. */
    public void clearPrimary() {
        this.primary = false;
    }

    public boolean isActive() {
        return status == OwnerLinkedAccountStatus.ACTIVE && razorpayAccountId != null && !razorpayAccountId.isBlank();
    }
}
