package com.khatiyan.d_modules.dashboard.event;

import org.springframework.modulith.events.ApplicationModuleListener;

import com.khatiyan.d_modules.billing.event.BillingCyclePaidManuallyEvent;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.concerns.event.ConcernAssignedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernEscalatedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernStatusChangedEvent;
import com.khatiyan.d_modules.concerns.model.ConcernEscalationLevel;
import com.khatiyan.d_modules.concerns.model.ConcernStatus;
import com.khatiyan.d_modules.concerns.event.ConcernRaisedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernResolvedEvent;
import com.khatiyan.d_modules.dashboard.api.dto.RecentActivityType;
import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.d_modules.dashboard.service.ActivityEventService;
import com.khatiyan.d_modules.notice.event.NoticePublishedEvent;
import com.khatiyan.d_modules.property.event.ManagerAssignedEvent;
import com.khatiyan.d_modules.property.event.ManagerRemovedEvent;
import com.khatiyan.d_modules.property.event.RoomLifecycleEvent;
import com.khatiyan.d_modules.staff.event.StaffMemberAddedEvent;
import com.khatiyan.d_modules.staff.event.StaffMemberEndedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyEndedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitRequestedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomTransferredEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyStartedEvent;

import java.time.Instant;

/**
 * Turns domain events into activity feed rows.
 *
 * <p>
 * This is the whole point of the persisted feed: an event is recorded when it
 * happens, so it survives whatever later happens to the thing it describes. The
 * previous implementation rebuilt the feed from current state, which meant
 * ending a tenancy erased the fact that it had ever started.
 *
 * <p>
 * {@code @ApplicationModuleListener} is at-least-once, so every handler must be
 * safe to run twice. {@link ActivityEventService#record} enforces that by
 * de-duplicating on (property, type, subject, occurredAt).
 */
@Component
public class ActivityFeedListener {

    private final ActivityEventService activityEventService;
    private final AuthModule authModule;

    public ActivityFeedListener(ActivityEventService activityEventService, AuthModule authModule) {
        this.activityEventService = activityEventService;
        this.authModule = authModule;
    }

    @ApplicationModuleListener
    public void onTenancyStarted(TenancyStartedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.TENANCY_STARTED,
                "Tenancy started",
                "Moving in on " + event.startDate(),
                event.actorUserId(),
                event.tenancyId(),
                Instant.now());
    }

    @ApplicationModuleListener
    public void onTenancyEnded(TenancyEndedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.TENANCY_ENDED,
                "Tenancy ended",
                "Checked out on " + event.endDate(),
                event.actorUserId(),
                event.tenancyId(),
                Instant.now());
    }

    @ApplicationModuleListener
    public void onRoomTransferred(TenancyRoomTransferredEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.TENANCY_ROOM_CHANGED,
                "Room change completed",
                "Moved on " + event.transferDate(),
                event.actorUserId(),
                event.tenancyId(),
                Instant.now());
    }

    @ApplicationModuleListener
    public void onExitRequested(TenancyExitRequestedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.TENANCY_EXIT_REQUESTED,
                "Exit requested",
                "Checkout requested for " + event.requestedCheckoutDate(),
                event.tenantUserId(),
                event.requestId(),
                Instant.now());
    }

    @ApplicationModuleListener
    public void onConcernRaised(ConcernRaisedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.CONCERN_RAISED,
                event.title(),
                "Raised by a tenant",
                event.raisedByUserId(),
                event.concernId(),
                Instant.now());
    }

    @ApplicationModuleListener
    public void onConcernResolved(ConcernResolvedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.CONCERN_RESOLVED,
                event.title(),
                "Resolved",
                event.resolvedByUserId(),
                event.concernId(),
                Instant.now());
    }

    @ApplicationModuleListener
    public void onConcernAssigned(ConcernAssignedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.CONCERN_ASSIGNED,
                event.title(),
                "Assigned to a team member",
                event.assignedByUserId(),
                event.concernId(),
                Instant.now());
    }

    /**
     * "Taken up" is the move to IN_PROGRESS specifically.
     *
     * <p>The other statuses are already covered or are not activity: RESOLVED has
     * its own event, and OPEN / UNDER_REVIEW / CLOSED are either where a concern
     * starts or bookkeeping after the work is done.
     */
    @ApplicationModuleListener
    public void onConcernStatusChanged(ConcernStatusChangedEvent event) {
        if (event.status() != ConcernStatus.IN_PROGRESS) {
            return;
        }

        activityEventService.record(
                event.propertyId(),
                RecentActivityType.CONCERN_TAKEN_UP,
                event.title(),
                "Work started",
                event.actorUserId(),
                event.concernId(),
                Instant.now());
    }

    /**
     * Escalation used to have no handler, and the note here said so: nothing
     * fired when a concern "became" escalated, because the level is derived from
     * waiting time. That is no longer true — {@code ConcernSchedulerService}
     * sweeps the thresholds daily, and it now publishes on a rise.
     */
    @ApplicationModuleListener
    public void onConcernEscalated(ConcernEscalatedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.CONCERN_ESCALATED,
                event.title(),
                escalationSubtitle(event.level()),
                event.raisedByUserId(),
                event.concernId(),
                Instant.now());
    }

    /** How long it has been waiting, which is what the level actually measures. */
    private String escalationSubtitle(ConcernEscalationLevel level) {
        return switch (level) {
            case CRITICAL -> "Waiting over 72 hours";
            case ESCALATED -> "Waiting over 48 hours";
            case ATTENTION -> "Waiting over 24 hours";
            case NONE -> "Waiting";
        };
    }

    // People. Manager events carry only ids, so the name is resolved here — a
    // feed row reading "Manager removed" with no name is barely an event.

    @ApplicationModuleListener
    public void onManagerAssigned(ManagerAssignedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.MANAGER_ADDED,
                nameOf(event.managerUserId(), "Manager"),
                "Added as a manager",
                event.assignedByUserId(),
                event.managerUserId(),
                Instant.now());
    }

    @ApplicationModuleListener
    public void onManagerRemoved(ManagerRemovedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.MANAGER_REMOVED,
                nameOf(event.managerUserId(), "Manager"),
                "Removed as a manager",
                event.removedByUserId(),
                event.managerUserId(),
                Instant.now());
    }

    @ApplicationModuleListener
    public void onStaffAdded(StaffMemberAddedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.STAFF_ADDED,
                event.staffName(),
                "Joined as " + event.categoryName(),
                event.actorUserId(),
                // Staff events carry no id, so there is nothing to de-duplicate on.
                // A redelivery could double this row; acceptable for a feed entry.
                null,
                Instant.now());
    }

    @ApplicationModuleListener
    public void onStaffEnded(StaffMemberEndedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.STAFF_REMOVED,
                event.staffName(),
                "Left the " + event.categoryName() + " team",
                event.actorUserId(),
                null,
                Instant.now());
    }

    @ApplicationModuleListener
    public void onNoticePublished(NoticePublishedEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.NOTICE_PUBLISHED,
                event.title(),
                "Published to the property",
                null,
                event.noticeId(),
                Instant.now());
    }

    /**
     * Every payment in the app is recorded by hand, so this is the only way a
     * bill ever reaches the feed. PAYMENT_RECORDED existed in the enum from the
     * start but nothing emitted it, which is why settled bills never appeared.
     */
    @ApplicationModuleListener
    public void onPaidManually(BillingCyclePaidManuallyEvent event) {
        activityEventService.record(
                event.propertyId(),
                RecentActivityType.PAYMENT_RECORDED,
                event.tenantNameSnapshot() == null ? "Payment recorded" : event.tenantNameSnapshot(),
                String.format("%s paid by %s", formatMoney(event.amountPaise()), methodLabel(event.method())),
                event.recordedByUserId(),
                event.billingCycleId(),
                Instant.now());
    }

    /**
     * Room state changes: maintenance on and off, deactivation and reactivation.
     *
     * <p>The four ROOM_* activity types were declared from the start and nothing
     * ever emitted them, so a room going offline left no trace in the feed even
     * though the property module had been publishing the event all along. One
     * handler covers all four because {@code RoomLifecycleEvent.Kind} maps one to
     * one onto them — which is also why an unmapped kind must never silently
     * become "some room thing happened".
     */
    @ApplicationModuleListener
    public void onRoomLifecycle(RoomLifecycleEvent event) {
        RecentActivityType type = switch (event.kind()) {
            case MAINTENANCE_STARTED -> RecentActivityType.ROOM_MAINTENANCE_STARTED;
            case MAINTENANCE_ENDED -> RecentActivityType.ROOM_MAINTENANCE_ENDED;
            case DEACTIVATED -> RecentActivityType.ROOM_DEACTIVATED;
            case REACTIVATED -> RecentActivityType.ROOM_REACTIVATED;
        };

        activityEventService.record(
                event.propertyId(),
                type,
                "Room " + event.roomNumber(),
                roomSubtitle(event),
                event.actorUserId(),
                event.roomId(),
                Instant.now());
    }

    /** The reason when one was given, else what happened. */
    private static String roomSubtitle(RoomLifecycleEvent event) {
        if (event.reason() != null && !event.reason().isBlank()) {
            return event.reason().trim();
        }
        return switch (event.kind()) {
            case MAINTENANCE_STARTED -> "Taken off service for maintenance";
            case MAINTENANCE_ENDED -> "Back in service";
            case DEACTIVATED -> "Deactivated";
            case REACTIVATED -> "Reactivated as vacant";
        };
    }

    private static String formatMoney(long paise) {
        return "₹" + java.text.NumberFormat.getInstance(java.util.Locale.of("en", "IN")).format(paise / 100);
    }

    private static String methodLabel(com.khatiyan.d_modules.billing.model.ManualPaymentMethod method) {
        return method == null ? "hand" : method.name().toLowerCase().replace('_', ' ');
    }

    /** Falls back rather than dropping the event if the user cannot be resolved. */
    private String nameOf(java.util.UUID userId, String fallback) {
        return authModule.findById(userId)
                .map(user -> user.fullName() == null || user.fullName().isBlank() ? fallback : user.fullName())
                .orElse(fallback);
    }
}
