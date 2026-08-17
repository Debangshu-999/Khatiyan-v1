package com.khatiyan.d_modules.tenancy.model;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
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
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Tenant-initiated request to end an active tenancy.
 *
 * <p>
 * Normal notice exits are rule-checked by the system. Premature exits are
 * manually reviewed by owner/manager with billing and deposit decisions.
 */
@Entity
@Table(name = "tenancy_exit_requests", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TenancyExitRequest extends BaseEntity {

    /**
     * Every date in this entity is a calendar date in the property's timezone.
     * Deriving "today" from the server default instead would move the notice
     * anchor a day whenever the JVM runs in UTC.
     */
    private static final ZoneId REQUEST_ZONE = ZoneId.of("Asia/Kolkata");

    /**
     * How long a request may sit unreviewed, and how long a tenant has to undo
     * an approval or to re-raise a lapsed request on the original terms.
     *
     * <p>The review window and the withdrawal window are deliberately different
     * lengths: five days is how long an owner gets to respond, three is how long
     * a tenant may keep an approved departure reversible before the owner is
     * entitled to treat the bed as free.
     */
    public static final int REVIEW_WINDOW_DAYS = 5;
    public static final int WITHDRAWAL_WINDOW_DAYS = 3;
    public static final int RE_RAISE_WINDOW_DAYS = 3;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    /** Short user-facing code. The UUID stays internal and is never displayed. */
    @Column(name = "reference_code", nullable = false, length = 40, unique = true)
    private String referenceCode;

    @Column(name = "tenancy_id", nullable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id", nullable = false)
    private UUID tenantUserId;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TenancyExitRequestType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TenancyExitRequestStatus status;

    @Column(name = "requested_checkout_date", nullable = false)
    private LocalDate requestedCheckoutDate;

    @Column(name = "approved_checkout_date")
    private LocalDate approvedCheckoutDate;

    @Column(name = "tenant_reason", length = 500)
    private String tenantReason;

    @Column(name = "admin_notes", length = 500)
    private String adminNotes;

    @Column(name = "final_billing_amount_paise")
    private Long finalBillingAmountPaise;

    @Column(name = "deposit_payable")
    private Boolean depositPayable;

    @Column(name = "deposit_settlement_amount_paise")
    private Long depositSettlementAmountPaise;

    @Column(name = "decided_by_user_id")
    private UUID decidedByUserId;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "executed_at")
    private Instant executedAt;

    @Column(name = "withdrawal_requested_at")
    private Instant withdrawalRequestedAt;

    @Column(name = "withdrawal_reason", length = 500)
    private String withdrawalReason;

    @Column(name = "withdrawal_decided_at")
    private Instant withdrawalDecidedAt;

    @Column(name = "withdrawal_decided_by_user_id")
    private UUID withdrawalDecidedByUserId;

    @Column(name = "withdrawal_admin_notes", length = 500)
    private String withdrawalAdminNotes;

    /**
     * The date the notice period counts from.
     *
     * <p>Normally this request's own creation date. On a re-raise after expiry
     * or rejection it is inherited from the superseded request, so an owner who
     * lets a request lapse cannot shorten the tenant's notice by doing nothing.
     */
    @Column(name = "notice_anchor_date", nullable = false)
    private LocalDate noticeAnchorDate;

    /** The expired or rejected request this one re-raises, if any. */
    @Column(name = "superseded_request_id")
    private UUID supersededRequestId;

    /**
     * When this request stops being interactive and drops into history.
     *
     * <p>Separate from {@link #status} on purpose: an approved exit stays
     * APPROVED after its withdrawal window shuts — that is the status the
     * execution scheduler looks for — but it is no longer something either party
     * can act on. Status says what was decided; this says whether anything is
     * left to do about it.
     *
     * <p>Null while a decision is pending on a withdrawal, where the window is
     * open-ended until the owner answers.
     */
    @Column(name = "expires_at")
    private Instant expiresAt;

    @Builder
    private TenancyExitRequest(
            String referenceCode,
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            UUID roomId,
            TenancyExitRequestType type,
            LocalDate requestedCheckoutDate,
            String tenantReason,
            LocalDate noticeAnchorDate,
            UUID supersededRequestId) {
        if (tenancyId == null || tenantUserId == null || propertyId == null || roomId == null) {
            throw new ValidationException("Exit request tenancy details are required");
        }
        if (type == null) {
            throw new ValidationException("Exit request type is required");
        }
        if (requestedCheckoutDate == null) {
            throw new ValidationException("Requested checkout date is required");
        }

        this.id = UUID.randomUUID();
        // A local fallback keeps the entity constructible in tests; the service
        // supplies the real sequenced code on the path that persists.
        this.referenceCode = referenceCode != null
                ? referenceCode
                : "TEX-LOCAL-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.propertyId = propertyId;
        this.roomId = roomId;
        this.type = type;
        this.status = TenancyExitRequestStatus.REQUESTED;
        this.requestedCheckoutDate = requestedCheckoutDate;
        this.tenantReason = clean(tenantReason);
        // Defaults to today so the column is never null and Phase 3 can read it
        // unconditionally; only a re-raise passes an inherited value.
        this.noticeAnchorDate = noticeAnchorDate != null ? noticeAnchorDate : LocalDate.now(REQUEST_ZONE);
        this.supersededRequestId = supersededRequestId;
        this.expiresAt = Instant.now().plus(Duration.ofDays(REVIEW_WINDOW_DAYS));
    }

    public static TenancyExitRequest normalNotice(
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            UUID roomId,
            LocalDate calculatedCheckoutDate,
            String reason) {
        return normalNotice(
                null, tenancyId, tenantUserId, propertyId, roomId, calculatedCheckoutDate, reason, null);
    }

    /**
     * A normal notice exit, optionally re-raising an earlier lapsed request.
     *
     * @param superseded the expired or rejected request being re-raised, whose
     *                   notice anchor this request inherits so the tenant is not
     *                   charged notice time for the owner's inaction
     */
    public static TenancyExitRequest normalNotice(
            String referenceCode,
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            UUID roomId,
            LocalDate calculatedCheckoutDate,
            String reason,
            TenancyExitRequest superseded) {
        return TenancyExitRequest.builder()
                .referenceCode(referenceCode)
                .tenancyId(tenancyId)
                .tenantUserId(tenantUserId)
                .propertyId(propertyId)
                .roomId(roomId)
                .type(TenancyExitRequestType.NORMAL_NOTICE)
                .requestedCheckoutDate(calculatedCheckoutDate)
                .tenantReason(reason)
                .noticeAnchorDate(superseded == null ? null : superseded.getNoticeAnchorDate())
                .supersededRequestId(superseded == null ? null : superseded.getId())
                .build();
    }

    public static TenancyExitRequest premature(
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            UUID roomId,
            LocalDate requestedCheckoutDate,
            String reason) {
        return premature(
                null, tenancyId, tenantUserId, propertyId, roomId, requestedCheckoutDate, reason, null);
    }

    public static TenancyExitRequest premature(
            String referenceCode,
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            UUID roomId,
            LocalDate requestedCheckoutDate,
            String reason,
            TenancyExitRequest superseded) {
        return TenancyExitRequest.builder()
                .referenceCode(referenceCode)
                .tenancyId(tenancyId)
                .tenantUserId(tenantUserId)
                .propertyId(propertyId)
                .roomId(roomId)
                .type(TenancyExitRequestType.PREMATURE)
                .requestedCheckoutDate(requestedCheckoutDate)
                .tenantReason(reason)
                .noticeAnchorDate(superseded == null ? null : superseded.getNoticeAnchorDate())
                .supersededRequestId(superseded == null ? null : superseded.getId())
                .build();
    }

    public void approveNormal(
            UUID actorUserId,
            Long finalBillingAmountPaise,
            Boolean depositPayable,
            Long depositSettlementAmountPaise,
            String adminNotes) {
        ensureRequested();
        validateNonNegative(finalBillingAmountPaise, "Final billing amount cannot be negative");
        validateNonNegative(depositSettlementAmountPaise, "Deposit settlement amount cannot be negative");

        this.status = TenancyExitRequestStatus.APPROVED;
        // Stays interactive for the withdrawal window, then drops to history.
        this.expiresAt = Instant.now().plus(Duration.ofDays(WITHDRAWAL_WINDOW_DAYS));
        this.approvedCheckoutDate = requestedCheckoutDate;
        this.finalBillingAmountPaise = finalBillingAmountPaise;
        this.depositPayable = depositPayable;
        this.depositSettlementAmountPaise = depositSettlementAmountPaise;
        this.adminNotes = clean(adminNotes);
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    public void approvePremature(
            UUID actorUserId,
            LocalDate approvedCheckoutDate,
            Long finalBillingAmountPaise,
            Boolean depositPayable,
            Long depositSettlementAmountPaise,
            String adminNotes) {
        ensureRequested();
        if (approvedCheckoutDate == null) {
            throw new ValidationException("Approved checkout date is required");
        }
        validateNonNegative(finalBillingAmountPaise, "Final billing amount cannot be negative");
        validateNonNegative(depositSettlementAmountPaise, "Deposit settlement amount cannot be negative");

        this.status = TenancyExitRequestStatus.APPROVED;
        this.expiresAt = Instant.now().plus(Duration.ofDays(WITHDRAWAL_WINDOW_DAYS));
        this.approvedCheckoutDate = approvedCheckoutDate;
        this.finalBillingAmountPaise = finalBillingAmountPaise;
        this.depositPayable = depositPayable;
        this.depositSettlementAmountPaise = depositSettlementAmountPaise;
        this.adminNotes = clean(adminNotes);
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    /**
     * Owner declines the request. <b>A reason is mandatory.</b>
     *
     * <p>Rejection cannot mean "you may not leave" — a tenant serving notice is
     * exercising a right, not asking permission. What survives is "this request
     * is not right": wrong date, duplicate, raised in error. Requiring the
     * reason is what keeps the two apart, and the tenant needs it to re-raise
     * with the necessary change. Approval needs no reason, because a granted
     * departure raises no question to answer.
     */

    public void reject(UUID actorUserId, String adminNotes) {
        ensureRequested();
        String reason = clean(adminNotes);
        if (reason == null) {
            throw new ValidationException("A reason is required when rejecting an exit request");
        }

        this.status = TenancyExitRequestStatus.REJECTED;
        // Stays interactive for the re-raise window.
        this.expiresAt = Instant.now().plus(Duration.ofDays(RE_RAISE_WINDOW_DAYS));
        this.adminNotes = reason;
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    public void cancel(UUID tenantUserId) {
        ensureRequested();
        if (!this.tenantUserId.equals(tenantUserId)) {
            throw new ValidationException("Only the tenant can cancel this exit request");
        }

        this.status = TenancyExitRequestStatus.CANCELLED;
        this.expiresAt = Instant.now();
    }

    /**
     * Nobody reviewed this request within {@link #REVIEW_WINDOW_DAYS}.
     *
     * <p>Changes nothing but the status — that is the whole point of the state.
     */
    public void expire() {
        ensureRequested();
        this.status = TenancyExitRequestStatus.EXPIRED;
        // Unreviewed expiry still leaves the re-raise carve-out open.
        this.expiresAt = Instant.now().plus(Duration.ofDays(RE_RAISE_WINDOW_DAYS));
    }

    /**
     * Tenant asks to undo an approved exit.
     *
     * <p>Unlike cancelling before approval this is a request, not an act: the
     * tenancy stays on notice until the owner decides. Bounded to
     * {@link #WITHDRAWAL_WINDOW_DAYS} after approval and never once the checkout
     * date has arrived, so an owner gets a definite point past which the bed is
     * theirs to re-let.
     */
    public void requestWithdrawal(UUID tenantUserId, String reason, LocalDate today) {
        if (status != TenancyExitRequestStatus.APPROVED) {
            throw new ValidationException("Only an approved exit request can be withdrawn");
        }
        if (!this.tenantUserId.equals(tenantUserId)) {
            throw new ValidationException("Only the tenant can withdraw this exit request");
        }
        if (!withdrawalWindowOpen(today)) {
            throw new ValidationException(
                    "The window to withdraw this approved exit has closed. Please raise a concern with your"
                            + " property manager.");
        }

        this.status = TenancyExitRequestStatus.WITHDRAWAL_REQUESTED;
        // Open-ended: it stays live until the owner answers.
        this.expiresAt = null;
        this.withdrawalReason = clean(reason);
        this.withdrawalRequestedAt = Instant.now();
    }

    /**
     * Whether a withdrawal may still be raised: inside the window measured from
     * approval, and strictly before the tenant is due to leave.
     */
    public boolean withdrawalWindowOpen(LocalDate today) {
        if (status != TenancyExitRequestStatus.APPROVED || decidedAt == null) {
            return false;
        }
        if (approvedCheckoutDate != null && !today.isBefore(approvedCheckoutDate)) {
            return false;
        }

        Duration sinceApproval = Duration.between(decidedAt, Instant.now());
        return sinceApproval.toDays() < WITHDRAWAL_WINDOW_DAYS;
    }

    /** Owner agrees to undo the exit. The request is void and the stay continues. */
    public void approveWithdrawal(UUID actorUserId, String adminNotes) {
        ensureWithdrawalPending();

        this.status = TenancyExitRequestStatus.CANCELLED;
        this.expiresAt = Instant.now();
        this.withdrawalAdminNotes = clean(adminNotes);
        this.withdrawalDecidedByUserId = actorUserId;
        this.withdrawalDecidedAt = Instant.now();
    }

    /**
     * Owner refuses to undo the exit, which stands as approved.
     *
     * <p>No reason is required here, unlike rejecting the exit itself. This veto
     * genuinely means only "no" — the owner may already have promised the bed,
     * and they are not obliged to justify holding the tenant to a departure the
     * tenant themselves asked for.
     */
    public void rejectWithdrawal(UUID actorUserId, String adminNotes) {
        ensureWithdrawalPending();

        this.status = TenancyExitRequestStatus.APPROVED;
        // Refusing a withdrawal reopens the approval's own window, briefly.
        this.expiresAt = Instant.now().plus(Duration.ofDays(WITHDRAWAL_WINDOW_DAYS));
        this.withdrawalAdminNotes = clean(adminNotes);
        this.withdrawalDecidedByUserId = actorUserId;
        this.withdrawalDecidedAt = Instant.now();
    }

    /**
     * Whether this request may be re-raised on its original notice anchor.
     *
     * <p>Only expiry and rejection qualify — neither was the tenant's doing. The
     * window is short because the carve-out exists to cover the rest of the
     * current cycle, where the payment window has already shut; once the next
     * cycle opens the ordinary route works again and needs no exception.
     */
    /** Whether either party still has something they can do about this. */
    public boolean isActivelyOpen(Instant now) {
        return expiresAt == null || expiresAt.isAfter(now);
    }

    public boolean allowsReRaiseOn(LocalDate today) {
        if (status != TenancyExitRequestStatus.EXPIRED && status != TenancyExitRequestStatus.REJECTED) {
            return false;
        }

        Instant lapsedAt = decidedAt != null ? decidedAt : getUpdatedAt();
        if (lapsedAt == null) {
            return false;
        }

        LocalDate lapsedOn = lapsedAt.atZone(REQUEST_ZONE).toLocalDate();
        return !today.isBefore(lapsedOn) && !today.isAfter(lapsedOn.plusDays(RE_RAISE_WINDOW_DAYS));
    }

    public void markExecuted() {
        if (status != TenancyExitRequestStatus.APPROVED) {
            throw new ValidationException("Only approved exit requests can be executed");
        }

        this.status = TenancyExitRequestStatus.EXECUTED;
        this.expiresAt = Instant.now();
        this.executedAt = Instant.now();
    }

    public boolean isNormalNotice() {
        return type == TenancyExitRequestType.NORMAL_NOTICE;
    }

    public boolean isPremature() {
        return type == TenancyExitRequestType.PREMATURE;
    }

    private void ensureRequested() {
        if (status != TenancyExitRequestStatus.REQUESTED) {
            throw new ValidationException("Exit request is not pending review");
        }
    }

    private void ensureWithdrawalPending() {
        if (status != TenancyExitRequestStatus.WITHDRAWAL_REQUESTED) {
            throw new ValidationException("No withdrawal is pending on this exit request");
        }
    }

    private static void validateNonNegative(Long amount, String message) {
        if (amount != null && amount < 0) {
            throw new ValidationException(message);
        }
    }

    private static String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }
}
