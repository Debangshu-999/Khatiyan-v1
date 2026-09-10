package com.khatiyan.d_modules.tenancy.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

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
 * Pending, fully configured execution of one approved exit request.
 *
 * <p>The settlement command is serialized at the service boundary so this
 * persistence model does not depend on a controller DTO.
 */
@Entity
@Table(name = "scheduled_tenancy_exits", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ScheduledTenancyExit extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "tenancy_id", nullable = false, updatable = false)
    private UUID tenancyId;

    @Column(name = "exit_request_id", nullable = false, updatable = false)
    private UUID exitRequestId;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "tenant_user_id", nullable = false, updatable = false)
    private UUID tenantUserId;

    @Column(name = "scheduled_checkout_date", nullable = false)
    private LocalDate scheduledCheckoutDate;

    @Column(name = "execution_payload", nullable = false, columnDefinition = "text")
    private String executionPayload;

    @Column(name = "configured_by_user_id", nullable = false)
    private UUID configuredByUserId;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "last_attempt_at")
    private Instant lastAttemptAt;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "last_failure_code", length = 40)
    private String lastFailureCode;

    @Column(name = "last_failure_message", length = 500)
    private String lastFailureMessage;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private ScheduledTenancyExitStatus status;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "closure_reason", length = 120)
    private String closureReason;

    public static ScheduledTenancyExit create(
            UUID tenancyId,
            UUID exitRequestId,
            UUID propertyId,
            UUID tenantUserId,
            LocalDate scheduledCheckoutDate,
            String executionPayload,
            UUID configuredByUserId,
            Instant nextAttemptAt) {
        ScheduledTenancyExit scheduled = new ScheduledTenancyExit();
        scheduled.id = UUID.randomUUID();
        scheduled.tenancyId = tenancyId;
        scheduled.exitRequestId = exitRequestId;
        scheduled.propertyId = propertyId;
        scheduled.tenantUserId = tenantUserId;
        scheduled.scheduledCheckoutDate = scheduledCheckoutDate;
        scheduled.status = ScheduledTenancyExitStatus.SCHEDULED;
        scheduled.updatePlan(executionPayload, configuredByUserId, nextAttemptAt);
        return scheduled;
    }

    public void updatePlan(String executionPayload, UUID configuredByUserId, Instant nextAttemptAt) {
        if (status != ScheduledTenancyExitStatus.SCHEDULED) {
            throw new IllegalStateException("A closed exit schedule cannot be changed");
        }
        this.executionPayload = executionPayload;
        this.configuredByUserId = configuredByUserId;
        this.nextAttemptAt = nextAttemptAt;
        this.lastAttemptAt = null;
        this.attemptCount = 0;
        this.lastFailureCode = null;
        this.lastFailureMessage = null;
    }

    public void reschedule(Instant nextAttemptAt) {
        this.nextAttemptAt = nextAttemptAt;
    }

    public void recordFailure(Instant attemptedAt, Instant retryAt, String code, String message) {
        this.lastAttemptAt = attemptedAt;
        this.nextAttemptAt = retryAt;
        this.attemptCount = this.attemptCount + 1;
        this.lastFailureCode = truncate(code, 40);
        this.lastFailureMessage = truncate(message, 500);
    }

    public void defer(Instant retryAt) {
        this.nextAttemptAt = retryAt;
    }

    public void complete(Instant closedAt) {
        close(ScheduledTenancyExitStatus.COMPLETED, closedAt, "Exit executed");
    }

    public void reverse(Instant closedAt) {
        close(ScheduledTenancyExitStatus.REVERSED, closedAt, "Approved exit withdrawn");
    }

    public void unschedule(Instant closedAt, String reason) {
        close(ScheduledTenancyExitStatus.UNSCHEDULED, closedAt, reason);
    }

    private void close(ScheduledTenancyExitStatus nextStatus, Instant at, String reason) {
        if (status != ScheduledTenancyExitStatus.SCHEDULED) {
            return;
        }
        this.status = nextStatus;
        this.closedAt = at;
        this.closureReason = truncate(reason, 120);
    }

    private static String truncate(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }
}
