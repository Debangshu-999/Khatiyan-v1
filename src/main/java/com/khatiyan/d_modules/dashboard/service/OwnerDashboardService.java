package com.khatiyan.d_modules.dashboard.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingDashboardSummary;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.concerns.ConcernModule;
import com.khatiyan.d_modules.concerns.api.dto.ConcernDashboardSummary;
import com.khatiyan.d_modules.concerns.api.dto.ConcernResponse;
import com.khatiyan.d_modules.dashboard.api.dto.ActionCenterProperty;
import com.khatiyan.d_modules.dashboard.api.dto.ActionCenterResponse;
import com.khatiyan.d_modules.dashboard.api.dto.AttentionSummary;
import com.khatiyan.d_modules.dashboard.api.dto.ConcernQueueSummary;
import com.khatiyan.d_modules.dashboard.api.dto.MoneySnapshot;
import com.khatiyan.d_modules.dashboard.api.dto.OccupancySnapshot;
import com.khatiyan.d_modules.dashboard.api.dto.RecentActivityItem;
import com.khatiyan.d_modules.dashboard.api.dto.RecentActivityType;
import com.khatiyan.d_modules.dashboard.api.dto.TodayDigest;
import com.khatiyan.d_modules.notice.NoticeModule;
import com.khatiyan.d_modules.notice.api.dto.NoticeResponse;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyExitRequestResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyRoomChangeRequestResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;

import lombok.extern.slf4j.Slf4j;

/**
 * Aggregates a per-property owner action center from other modules' facades.
 *
 * <p>This service is read-only and depends only on module facades — it never
 * touches another module's repositories or entities. Access is checked once
 * via {@link PropertyModule#ensureCanManageProperty} before any data is read.
 */
@Slf4j
@Service
public class OwnerDashboardService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final PropertyModule propertyModule;
    private final TenancyModule tenancyModule;
    private final BillingModule billingModule;
    private final ConcernModule concernModule;
    private final NoticeModule noticeModule;

    private final int upcomingExitDays;
    private final int recentActivityLimit;

    public OwnerDashboardService(
            PropertyModule propertyModule,
            TenancyModule tenancyModule,
            BillingModule billingModule,
            ConcernModule concernModule,
            NoticeModule noticeModule,
            @Value("${app.dashboard.upcoming-exit-days:7}") int upcomingExitDays,
            @Value("${app.dashboard.recent-activity-limit:10}") int recentActivityLimit) {
        this.propertyModule = propertyModule;
        this.tenancyModule = tenancyModule;
        this.billingModule = billingModule;
        this.concernModule = concernModule;
        this.noticeModule = noticeModule;
        this.upcomingExitDays = upcomingExitDays;
        this.recentActivityLimit = recentActivityLimit;
    }

    /**
     * Builds the composite action center for a property the actor manages.
     */
    public ActionCenterResponse getPropertyActionCenter(UUID actorUserId, UUID propertyId) {
        // Authoritative access check up front; facade calls below also enforce
        // their own checks (defense in depth) but this fails fast.
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        LocalDate today = LocalDate.now(IST);

        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        List<RoomResponse> rooms = propertyModule.listRooms(actorUserId, propertyId);
        List<TenancyResponse> activeTenancies = tenancyModule.findActiveByPropertyId(propertyId);
        List<TenancyExitRequestResponse> exitRequests =
                tenancyModule.listPropertyExitRequests(actorUserId, propertyId);
        List<TenancyRoomChangeRequestResponse> roomChangeRequests =
                tenancyModule.listPropertyRoomChangeRequests(actorUserId, propertyId);
        BillingDashboardSummary billing = billingModule.getPropertyBillingSummary(actorUserId, propertyId);
        ConcernDashboardSummary concern = concernModule.getPropertyConcernSummary(actorUserId, propertyId);

        OccupancySnapshot occupancy = buildOccupancy(rooms, activeTenancies);
        MoneySnapshot money = buildMoney(billing);
        TodayDigest todayDigest = buildToday(billing, concern, activeTenancies, exitRequests, today);
        AttentionSummary attention = buildAttention(billing, concern, activeTenancies, exitRequests, roomChangeRequests, today);
        ConcernQueueSummary concernQueue = buildConcernQueue(concern);
        List<RecentActivityItem> recentActivity = buildRecentActivity(actorUserId, propertyId, activeTenancies);

        log.info("Action center built propertyId={} actorUserId={}", propertyId, actorUserId);

        return new ActionCenterResponse(
                new ActionCenterProperty(
                        property.id(),
                        property.name(),
                        property.referenceCode(),
                        property.city(),
                        property.type()),
                occupancy,
                money,
                todayDigest,
                attention,
                concernQueue,
                recentActivity,
                Instant.now());
    }

    /**
     * Builds a newest-first recent-activity feed by composing read-only facade
     * data: new tenancies, recorded payments, resolved concerns, and published
     * notices.
     */
    private List<RecentActivityItem> buildRecentActivity(
            UUID actorUserId,
            UUID propertyId,
            List<TenancyResponse> activeTenancies) {
        List<RecentActivityItem> items = new ArrayList<>();

        for (TenancyResponse tenancy : activeTenancies) {
            if (tenancy.createdAt() != null) {
                items.add(new RecentActivityItem(
                        RecentActivityType.TENANCY_STARTED,
                        "Tenancy " + tenancy.referenceCode(),
                        "Started " + tenancy.startDate(),
                        tenancy.createdAt()));
            }
        }

        for (BillingCycleResponse cycle : billingModule.listPropertyCycles(actorUserId, propertyId, null, null)) {
            if (cycle.status() == BillingCycleStatus.PAID && cycle.paidAt() != null) {
                String who = cycle.tenantNameSnapshot() != null && !cycle.tenantNameSnapshot().isBlank()
                        ? cycle.tenantNameSnapshot()
                        : cycle.referenceCode();
                items.add(new RecentActivityItem(
                        RecentActivityType.PAYMENT_RECORDED,
                        who,
                        "Paid ₹" + (cycle.totalAmountPaise() / 100) + " · " + cycle.referenceCode(),
                        cycle.paidAt()));
            }
        }

        for (ConcernResponse concern : concernModule.listPropertyConcernHistory(actorUserId, propertyId)) {
            if (concern.resolvedAt() != null) {
                items.add(new RecentActivityItem(
                        RecentActivityType.CONCERN_RESOLVED,
                        concern.title(),
                        "Resolved concern " + concern.referenceCode(),
                        concern.resolvedAt()));
            }
        }

        for (ConcernResponse concern : concernModule.listEscalatedConcerns(actorUserId, propertyId)) {
            Instant escalatedAt = concern.updatedAt() != null ? concern.updatedAt() : concern.createdAt();
            if (escalatedAt != null) {
                items.add(new RecentActivityItem(
                        RecentActivityType.CONCERN_ESCALATED,
                        concern.title(),
                        "Escalated concern " + concern.referenceCode(),
                        escalatedAt));
            }
        }

        Instant now = Instant.now();
        for (NoticeResponse notice : noticeModule.listPublishedNotices(actorUserId, propertyId)) {
            Instant occurredAt = notice.publishedAt() != null ? notice.publishedAt() : notice.createdAt();
            if (occurredAt == null) {
                continue;
            }
            items.add(new RecentActivityItem(
                    RecentActivityType.NOTICE_PUBLISHED,
                    notice.title(),
                    noticeActivitySubtitle(notice, now),
                    occurredAt));
        }

        return items.stream()
                .sorted(Comparator.comparing(RecentActivityItem::occurredAt).reversed())
                .limit(recentActivityLimit)
                .toList();
    }

    /**
     * Describes where a notice sits in its visibility lifecycle. The notice row
     * exists (status PUBLISHED), but it is only live to tenants inside its
     * {@code visibleFrom..visibleUntil} window, so the feed should not claim it
     * is "published" before that window opens.
     */
    private String noticeActivitySubtitle(NoticeResponse notice, Instant now) {
        Instant visibleFrom = notice.visibleFrom();
        Instant visibleUntil = notice.visibleUntil();

        if (visibleFrom != null && visibleFrom.isAfter(now)) {
            return "Notice created · not live yet";
        }
        if (visibleUntil != null && visibleUntil.isBefore(now)) {
            return "Notice created · window ended";
        }
        return "Notice live";
    }

    private OccupancySnapshot buildOccupancy(List<RoomResponse> rooms, List<TenancyResponse> activeTenancies) {
        long totalBeds = rooms.stream().mapToLong(RoomResponse::capacity).sum();
        long occupiedBeds = rooms.stream().mapToLong(RoomResponse::occupiedCount).sum();
        long vacantBeds = Math.max(0, totalBeds - occupiedBeds);

        return new OccupancySnapshot(
                activeTenancies.size(),
                totalBeds,
                occupiedBeds,
                vacantBeds,
                rooms.size());
    }

    private MoneySnapshot buildMoney(BillingDashboardSummary billing) {
        return new MoneySnapshot(
                billing.billedThisMonthPaise(),
                billing.collectedThisMonthPaise(),
                billing.pendingPaise(),
                billing.overduePaise(),
                billing.overdueCount());
    }

    private TodayDigest buildToday(
            BillingDashboardSummary billing,
            ConcernDashboardSummary concern,
            List<TenancyResponse> activeTenancies,
            List<TenancyExitRequestResponse> exitRequests,
            LocalDate today) {
        long startedToday = activeTenancies.stream()
                .filter(tenancy -> tenancy.startDate() != null && tenancy.startDate().isEqual(today))
                .count();
        long endingToday = exitRequests.stream()
                .filter(request -> request.status() == TenancyExitRequestStatus.APPROVED)
                .filter(request -> request.approvedCheckoutDate() != null
                        && request.approvedCheckoutDate().isEqual(today))
                .count();

        return new TodayDigest(
                billing.paymentsMadeToday(),
                billing.paymentsMadeTodayPaise(),
                concern.raisedToday(),
                startedToday,
                endingToday);
    }

    private AttentionSummary buildAttention(
            BillingDashboardSummary billing,
            ConcernDashboardSummary concern,
            List<TenancyResponse> activeTenancies,
            List<TenancyExitRequestResponse> exitRequests,
            List<TenancyRoomChangeRequestResponse> roomChangeRequests,
            LocalDate today) {
        long tenantsOnNotice = activeTenancies.stream()
                .filter(tenancy -> tenancy.status() == TenancyStatus.ON_NOTICE
                        || tenancy.status() == TenancyStatus.ON_PREMATURE_NOTICE)
                .count();

        long pendingExitRequests = exitRequests.stream()
                .filter(request -> request.status() == TenancyExitRequestStatus.REQUESTED)
                .count();

        long pendingRoomChangeRequests = roomChangeRequests.stream()
                .filter(request -> request.status() == TenancyRoomChangeRequestStatus.REQUESTED)
                .count();

        LocalDate upcomingHorizon = today.plusDays(upcomingExitDays);
        long upcomingExits = exitRequests.stream()
                .filter(request -> request.status() == TenancyExitRequestStatus.APPROVED)
                .filter(request -> {
                    LocalDate checkout = request.approvedCheckoutDate();
                    return checkout != null
                            && checkout.isAfter(today)
                            && !checkout.isAfter(upcomingHorizon);
                })
                .count();

        return new AttentionSummary(
                billing.overdueCount(),
                concern.unattended24h(),
                concern.escalated(),
                pendingExitRequests,
                pendingRoomChangeRequests,
                upcomingExits,
                tenantsOnNotice);
    }

    private ConcernQueueSummary buildConcernQueue(ConcernDashboardSummary concern) {
        return new ConcernQueueSummary(
                concern.open(),
                concern.inProgress(),
                concern.escalated(),
                concern.resolvedThisWeek());
    }
}
