package com.khatiyan.d_modules.tenancy.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.api.dto.EndTenancyRequest;
import com.khatiyan.d_modules.tenancy.api.dto.ExitScheduleSettingsResponse;
import com.khatiyan.d_modules.tenancy.api.dto.ScheduledTenancyExitResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyExitRequestResponse;
import com.khatiyan.d_modules.tenancy.api.dto.UpcomingTenancyExitResponse;
import com.khatiyan.d_modules.tenancy.event.ScheduledTenancyExitFailedEvent;
import com.khatiyan.d_modules.tenancy.model.PropertyExitScheduleSettings;
import com.khatiyan.d_modules.tenancy.model.ScheduledTenancyExit;
import com.khatiyan.d_modules.tenancy.model.ScheduledTenancyExitStatus;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.d_modules.tenancy.repository.PropertyExitScheduleSettingsRepository;
import com.khatiyan.d_modules.tenancy.repository.ScheduledTenancyExitRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyExitRequestRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

/**
 * Configures and executes approved tenancy exits.
 *
 * <p>Approval never creates a schedule. A management actor explicitly saves
 * the complete end-tenancy assessment, and the runner later submits that same
 * command through the ordinary exit transaction.
 */
@Service
public class ScheduledTenancyExitService {

    private static final ZoneId EXIT_ZONE = ZoneId.of("Asia/Kolkata");

    private final ObjectMapper objectMapper;
    private final ScheduledTenancyExitRepository scheduledExitRepository;
    private final PropertyExitScheduleSettingsRepository settingsRepository;
    private final TenancyExitRequestRepository exitRequestRepository;
    private final TenancyRepository tenancyRepository;
    private final TenancyAccessPolicy tenancyAccessPolicy;
    private final PropertyModule propertyModule;
    private final BillingModule billingModule;
    private final TenancyExitRequestService exitRequestService;
    private final ApplicationEventPublisher eventPublisher;

    public ScheduledTenancyExitService(
            ObjectMapper objectMapper,
            ScheduledTenancyExitRepository scheduledExitRepository,
            PropertyExitScheduleSettingsRepository settingsRepository,
            TenancyExitRequestRepository exitRequestRepository,
            TenancyRepository tenancyRepository,
            TenancyAccessPolicy tenancyAccessPolicy,
            PropertyModule propertyModule,
            @Lazy BillingModule billingModule,
            @Lazy TenancyExitRequestService exitRequestService,
            ApplicationEventPublisher eventPublisher) {
        this.objectMapper = objectMapper;
        this.scheduledExitRepository = scheduledExitRepository;
        this.settingsRepository = settingsRepository;
        this.exitRequestRepository = exitRequestRepository;
        this.tenancyRepository = tenancyRepository;
        this.tenancyAccessPolicy = tenancyAccessPolicy;
        this.propertyModule = propertyModule;
        this.billingModule = billingModule;
        this.exitRequestService = exitRequestService;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public ScheduledTenancyExitResponse schedule(
            UUID actorUserId,
            UUID requestId,
            EndTenancyRequest configuration) {
        TenancyExitRequest request = getRequestForUpdate(requestId);
        tenancyAccessPolicy.ensureCanManageExitRequests(actorUserId, request.getPropertyId());
        tenancyAccessPolicy.ensureCanManageStays(actorUserId, request.getPropertyId());

        if (request.getStatus() != TenancyExitRequestStatus.APPROVED) {
            throw new ValidationException("Only an approved exit request can be scheduled");
        }
        if (request.getApprovedCheckoutDate() == null) {
            throw new ValidationException("Approved checkout date is required before scheduling");
        }

        Tenancy tenancy = tenancyRepository.findByIdForUpdate(request.getTenancyId())
                .orElseThrow(() -> new NotFoundException("Tenancy", request.getTenancyId()));
        ensureSchedulableTenancy(request, tenancy);

        ScheduledTenancyExit existingForTenancy = scheduledExitRepository.findByTenancyIdAndStatus(
                tenancy.getId(), ScheduledTenancyExitStatus.SCHEDULED).orElse(null);
        if (existingForTenancy != null && !existingForTenancy.getExitRequestId().equals(requestId)) {
            throw new ValidationException("This tenancy already has another scheduled exit");
        }

        String payload = serialize(configuration);
        Instant now = Instant.now();
        LocalTime executionTime = executionTimeForProperty(request.getPropertyId());
        Instant nextAttemptAt = plannedAttempt(request.getApprovedCheckoutDate(), executionTime, now);

        Optional<ScheduledTenancyExit> existing = scheduledExitRepository.findByExitRequestIdForUpdate(
                requestId, ScheduledTenancyExitStatus.SCHEDULED);
        ScheduledTenancyExit scheduled;
        if (existing.isPresent()) {
            scheduled = existing.get();
            scheduled.updatePlan(payload, actorUserId, nextAttemptAt);
        } else {
            scheduled = ScheduledTenancyExit.create(
                    tenancy.getId(),
                    requestId,
                    request.getPropertyId(),
                    request.getTenantUserId(),
                    request.getApprovedCheckoutDate(),
                    payload,
                    actorUserId,
                    nextAttemptAt);
        }

        return toResponse(scheduledExitRepository.saveAndFlush(scheduled));
    }

    @Transactional(readOnly = true)
    public ScheduledTenancyExitResponse getActiveSchedule(UUID actorUserId, UUID requestId) {
        TenancyExitRequest request = exitRequestRepository.findById(requestId)
                .orElseThrow(() -> new NotFoundException("TenancyExitRequest", requestId));
        tenancyAccessPolicy.ensureCanViewExitRequests(actorUserId, request.getPropertyId());

        ScheduledTenancyExit scheduled = scheduledExitRepository.findByExitRequestIdAndStatus(
                        requestId, ScheduledTenancyExitStatus.SCHEDULED)
                .orElseThrow(() -> new NotFoundException("ScheduledTenancyExit", requestId));
        return toResponse(scheduled);
    }

    /**
     * Removes only the automation. The approved request remains intact and the
     * schedule row is soft-closed for audit.
     */
    @Transactional
    public void unschedule(UUID actorUserId, UUID requestId) {
        TenancyExitRequest request = getRequestForUpdate(requestId);
        tenancyAccessPolicy.ensureCanManageExitRequests(actorUserId, request.getPropertyId());
        tenancyAccessPolicy.ensureCanManageStays(actorUserId, request.getPropertyId());

        ScheduledTenancyExit scheduled = scheduledExitRepository.findByExitRequestIdForUpdate(
                        requestId, ScheduledTenancyExitStatus.SCHEDULED)
                .orElseThrow(() -> new NotFoundException("ScheduledTenancyExit", requestId));
        scheduled.unschedule(Instant.now(), "Removed from scheduled exits by management");
    }

    @Transactional(readOnly = true)
    public ExitScheduleSettingsResponse getSettings(UUID actorUserId, UUID propertyId) {
        tenancyAccessPolicy.ensureCanViewExitRequests(actorUserId, propertyId);
        return new ExitScheduleSettingsResponse(propertyId, executionTimeForProperty(propertyId));
    }

    @Transactional
    public ExitScheduleSettingsResponse updateSettings(
            UUID actorUserId,
            UUID propertyId,
            LocalTime executionTime) {
        tenancyAccessPolicy.ensureCanManageExitRequests(actorUserId, propertyId);
        tenancyAccessPolicy.ensureCanManageStays(actorUserId, propertyId);
        propertyModule.getActiveProperty(propertyId);

        PropertyExitScheduleSettings settings = settingsRepository.findByPropertyId(propertyId)
                .orElseGet(() -> PropertyExitScheduleSettings.create(propertyId, executionTime));
        settings.update(executionTime);
        PropertyExitScheduleSettings saved = settingsRepository.save(settings);

        Instant now = Instant.now();
        for (ScheduledTenancyExit scheduled
                : scheduledExitRepository.findByPropertyIdAndStatusOrderByScheduledCheckoutDateAsc(
                        propertyId, ScheduledTenancyExitStatus.SCHEDULED)) {
            scheduled.reschedule(plannedAttempt(
                    scheduled.getScheduledCheckoutDate(), saved.getExecutionTime(), now));
        }

        return new ExitScheduleSettingsResponse(propertyId, saved.getExecutionTime());
    }

    @Transactional(readOnly = true)
    public List<UpcomingTenancyExitResponse> listUpcoming(UUID actorUserId, UUID propertyId) {
        tenancyAccessPolicy.ensureCanViewExitRequests(actorUserId, propertyId);
        LocalTime executionTime = executionTimeForProperty(propertyId);
        Map<UUID, ScheduledTenancyExit> schedules = scheduledExitRepository
                .findByPropertyIdAndStatusOrderByScheduledCheckoutDateAsc(
                        propertyId, ScheduledTenancyExitStatus.SCHEDULED)
                .stream()
                .collect(Collectors.toMap(ScheduledTenancyExit::getExitRequestId, Function.identity()));

        return exitRequestService.listForProperty(actorUserId, propertyId).stream()
                .filter(request -> request.status() == TenancyExitRequestStatus.APPROVED
                        || request.status() == TenancyExitRequestStatus.WITHDRAWAL_REQUESTED)
                .sorted((left, right) -> checkoutDate(left).compareTo(checkoutDate(right)))
                .map(request -> new UpcomingTenancyExitResponse(
                        request,
                        executionTime,
                        schedules.containsKey(request.id()) ? toResponse(schedules.get(request.id())) : null))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<UUID> findDueIds(Instant now, int batchSize) {
        return scheduledExitRepository.findDueIds(now, PageRequest.of(0, batchSize));
    }

    @Transactional
    public ExecutionResult executeDue(UUID scheduleId) {
        ScheduledTenancyExit scheduled = scheduledExitRepository.findByIdForUpdate(scheduleId)
                .orElseThrow(() -> new NotFoundException("ScheduledTenancyExit", scheduleId));
        if (scheduled.getStatus() != ScheduledTenancyExitStatus.SCHEDULED) {
            return ExecutionResult.SKIPPED;
        }

        TenancyExitRequest request = getRequestForUpdate(scheduled.getExitRequestId());
        if (request.getStatus() == TenancyExitRequestStatus.WITHDRAWAL_REQUESTED) {
            scheduled.defer(nextRetryAt(Instant.now(), executionTimeForProperty(scheduled.getPropertyId())));
            return ExecutionResult.DEFERRED;
        }
        if (request.getStatus() == TenancyExitRequestStatus.EXECUTED) {
            scheduled.complete(Instant.now());
            return ExecutionResult.SKIPPED;
        }
        if (request.getStatus() != TenancyExitRequestStatus.APPROVED) {
            scheduled.unschedule(Instant.now(), "Exit request is no longer approved");
            return ExecutionResult.SKIPPED;
        }

        Tenancy tenancy = tenancyRepository.findByIdForUpdate(scheduled.getTenancyId())
                .orElseThrow(() -> new ScheduledExitFailureException(
                        "TENANCY_MISSING", "The tenancy no longer exists"));
        ensureExecutionMatchesActiveTenancy(request, tenancy);

        var property = propertyModule.getActiveProperty(scheduled.getPropertyId());
        try {
            billingModule.ensureLatestCyclePaidForExit(property.ownerId(), scheduled.getTenancyId());
        } catch (ValidationException exception) {
            throw new ScheduledExitFailureException(
                    "PAYMENT_DUE",
                    "Tenant has unpaid or unconfirmed bills. Clear them before the scheduled exit can run.");
        }

        EndTenancyRequest configuration = deserialize(scheduled.getExecutionPayload());
        exitRequestService.executeScheduledApprovedRequest(
                property.ownerId(), scheduled.getExitRequestId(), configuration);
        scheduled.complete(Instant.now());
        return ExecutionResult.EXECUTED;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(UUID scheduleId, RuntimeException exception) {
        ScheduledTenancyExit scheduled = scheduledExitRepository.findByIdForUpdate(scheduleId)
                .orElse(null);
        if (scheduled == null || scheduled.getStatus() != ScheduledTenancyExitStatus.SCHEDULED) {
            return;
        }

        String code = exception instanceof ScheduledExitFailureException failure
                ? failure.code()
                : "EXECUTION_BLOCKED";
        String message = exception.getMessage() != null
                ? exception.getMessage()
                : "The scheduled exit could not be completed";
        Instant attemptedAt = Instant.now();
        Instant retryAt = nextRetryAt(
                attemptedAt, executionTimeForProperty(scheduled.getPropertyId()));
        scheduled.recordFailure(attemptedAt, retryAt, code, message);

        String referenceCode = exitRequestRepository.findById(scheduled.getExitRequestId())
                .map(TenancyExitRequest::getReferenceCode)
                .orElse("Unknown request");
        eventPublisher.publishEvent(new ScheduledTenancyExitFailedEvent(
                scheduled.getId(),
                scheduled.getExitRequestId(),
                referenceCode,
                scheduled.getTenancyId(),
                scheduled.getTenantUserId(),
                scheduled.getPropertyId(),
                scheduled.getScheduledCheckoutDate(),
                code,
                message,
                scheduled.getAttemptCount()));
    }

    private void ensureSchedulableTenancy(
            TenancyExitRequest request,
            Tenancy tenancy) {
        if (!tenancy.isCurrentlyActive()) {
            throw new ValidationException("Only an active tenancy can be scheduled for exit");
        }
        if (!tenancy.getId().equals(request.getTenancyId())
                || !tenancy.getPropertyId().equals(request.getPropertyId())
                || !tenancy.getUserId().equals(request.getTenantUserId())) {
            throw new ValidationException("The exit request no longer matches this tenancy");
        }
    }

    private void ensureExecutionMatchesActiveTenancy(
            TenancyExitRequest request,
            Tenancy tenancy) {
        if (!tenancy.isCurrentlyActive()) {
            throw new ScheduledExitFailureException(
                    "TENANCY_INACTIVE", "The tenant is no longer active at this property");
        }
        if (!tenancy.getId().equals(request.getTenancyId())
                || !tenancy.getPropertyId().equals(request.getPropertyId())
                || !tenancy.getUserId().equals(request.getTenantUserId())) {
            throw new ScheduledExitFailureException(
                    "SCHEDULE_MISMATCH", "The scheduled exit no longer matches the tenancy");
        }
    }

    private TenancyExitRequest getRequestForUpdate(UUID requestId) {
        return exitRequestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new NotFoundException("TenancyExitRequest", requestId));
    }

    private LocalTime executionTimeForProperty(UUID propertyId) {
        return settingsRepository.findByPropertyId(propertyId)
                .map(PropertyExitScheduleSettings::getExecutionTime)
                .orElse(PropertyExitScheduleSettings.DEFAULT_EXECUTION_TIME);
    }

    private ScheduledTenancyExitResponse toResponse(ScheduledTenancyExit scheduled) {
        return new ScheduledTenancyExitResponse(
                scheduled.getId(),
                scheduled.getExitRequestId(),
                scheduled.getTenancyId(),
                scheduled.getPropertyId(),
                scheduled.getTenantUserId(),
                scheduled.getScheduledCheckoutDate(),
                scheduled.getConfiguredByUserId(),
                scheduled.getNextAttemptAt(),
                scheduled.getLastAttemptAt(),
                scheduled.getAttemptCount(),
                scheduled.getLastFailureCode(),
                scheduled.getLastFailureMessage(),
                scheduled.getStatus(),
                scheduled.getClosedAt(),
                scheduled.getClosureReason(),
                deserialize(scheduled.getExecutionPayload()),
                scheduled.getCreatedAt(),
                scheduled.getUpdatedAt());
    }

    private String serialize(EndTenancyRequest configuration) {
        try {
            return objectMapper.writeValueAsString(configuration);
        } catch (JsonProcessingException exception) {
            throw new ValidationException("Exit schedule configuration could not be saved");
        }
    }

    private EndTenancyRequest deserialize(String payload) {
        try {
            return objectMapper.readValue(payload, EndTenancyRequest.class);
        } catch (JsonProcessingException exception) {
            throw new ScheduledExitFailureException(
                    "INVALID_CONFIGURATION", "The saved exit configuration is invalid");
        }
    }

    private static LocalDate checkoutDate(TenancyExitRequestResponse request) {
        return request.approvedCheckoutDate() != null
                ? request.approvedCheckoutDate()
                : request.requestedCheckoutDate();
    }

    private static Instant plannedAttempt(
            LocalDate checkoutDate,
            LocalTime executionTime,
            Instant now) {
        Instant planned = LocalDateTime.of(checkoutDate, executionTime)
                .atZone(EXIT_ZONE)
                .toInstant();
        return planned.isAfter(now) ? planned : now;
    }

    private static Instant nextRetryAt(Instant now, LocalTime executionTime) {
        LocalDate today = now.atZone(EXIT_ZONE).toLocalDate();
        Instant todayAtExecutionTime = LocalDateTime.of(today, executionTime)
                .atZone(EXIT_ZONE)
                .toInstant();
        if (todayAtExecutionTime.isAfter(now)) {
            return todayAtExecutionTime;
        }
        return LocalDateTime.of(today.plusDays(1), executionTime)
                .atZone(EXIT_ZONE)
                .toInstant();
    }

    public enum ExecutionResult {
        EXECUTED,
        DEFERRED,
        SKIPPED
    }
}
