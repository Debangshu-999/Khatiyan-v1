package com.khatiyan.d_modules.dashboard.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;


import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingDashboardSummary;
import com.khatiyan.d_modules.billing.model.BillingCycleCategory;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.concerns.ConcernModule;
import com.khatiyan.d_modules.concerns.api.dto.ConcernDashboardSummary;
import com.khatiyan.d_modules.dashboard.api.dto.ActionCenterProperty;
import com.khatiyan.d_modules.dashboard.api.dto.ActionCenterResponse;
import com.khatiyan.d_modules.dashboard.api.dto.AttentionSummary;
import com.khatiyan.d_modules.dashboard.api.dto.BudgetAttention;
import com.khatiyan.d_modules.dashboard.api.dto.BudgetAttentionLevel;
import com.khatiyan.d_modules.dashboard.api.dto.ConcernQueueSummary;
import com.khatiyan.d_modules.dashboard.api.dto.MoneySnapshot;
import com.khatiyan.d_modules.dashboard.api.dto.MonthlyTrendPoint;
import com.khatiyan.d_modules.dashboard.api.dto.OccupancySnapshot;
import com.khatiyan.d_modules.dashboard.api.dto.RecentActivityItem;
import com.khatiyan.d_modules.dashboard.api.dto.RecentActivityType;
import com.khatiyan.d_modules.dashboard.api.dto.TenancySnapshot;
import com.khatiyan.d_modules.dashboard.api.dto.TodayDigest;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.expense.ExpenseModule;
import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetOverviewResponse;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.staff.StaffModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyExitRequestResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyRoomChangeRequestResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
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

    /** Fire the "approaching" budget flag once spend reaches this percent of budget. */
    private static final long BUDGET_APPROACHING_PERCENT = 80L;

    private final PropertyModule propertyModule;
    private final TenancyModule tenancyModule;
    private final BillingModule billingModule;
    private final ConcernModule concernModule;
    private final StaffModule staffModule;
    private final ExpenseModule expenseModule;
    private final EnquiryModule enquiryModule;

    private final int upcomingExitDays;
    private final ActivityEventService activityEventService;
    private final int recentActivityLimit;

    public OwnerDashboardService(
            PropertyModule propertyModule,
            TenancyModule tenancyModule,
            BillingModule billingModule,
            ConcernModule concernModule,
            StaffModule staffModule,
            ExpenseModule expenseModule,
            EnquiryModule enquiryModule,
            @Value("${app.dashboard.upcoming-exit-days:7}") int upcomingExitDays,
            ActivityEventService activityEventService,
            @Value("${app.dashboard.recent-activity-limit:10}") int recentActivityLimit) {
        this.propertyModule = propertyModule;
        this.tenancyModule = tenancyModule;
        this.billingModule = billingModule;
        this.concernModule = concernModule;
        this.staffModule = staffModule;
        this.expenseModule = expenseModule;
        this.enquiryModule = enquiryModule;
        this.upcomingExitDays = upcomingExitDays;
        this.activityEventService = activityEventService;
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
        List<TenancyResponse> inactiveTenancies = tenancyModule.findInactiveByPropertyId(propertyId);
        List<TenancyExitRequestResponse> exitRequests =
                tenancyModule.listPropertyExitRequests(actorUserId, propertyId);
        List<TenancyRoomChangeRequestResponse> roomChangeRequests =
                tenancyModule.listPropertyRoomChangeRequests(actorUserId, propertyId);
        BillingDashboardSummary billing = billingModule.getPropertyBillingSummaryForDashboard(propertyId);
        ConcernDashboardSummary concern = concernModule.getPropertyConcernSummary(actorUserId, propertyId);
        // Full cycle history (not a single month) so the six-month trend, the
        // prior-month money delta and recent activity all see every month's data.
        List<BillingCycleResponse> cycles = billingModule.listAllPropertyCycles(actorUserId, propertyId);

        List<TenancyResponse> allTenancies = new ArrayList<>(activeTenancies);
        allTenancies.addAll(inactiveTenancies);

        LocalDate monthStart = today.withDayOfMonth(1);
        LocalDate prevMonthStart = monthStart.minusMonths(1);

        OccupancySnapshot occupancy = buildOccupancy(rooms, activeTenancies);
        TenancySnapshot tenancy = buildTenancy(activeTenancies, inactiveTenancies, allTenancies, exitRequests, today);
        MoneySnapshot money = buildMoney(billing, cycles, activeTenancies, prevMonthStart, monthStart);
        TodayDigest todayDigest = buildToday(billing, concern, activeTenancies, exitRequests, today);
        long pendingDepositSettlements = billingModule.countPropertyDepositsPendingSettlement(propertyId);
        AttentionSummary attention = buildAttention(
                billing, concern, activeTenancies, exitRequests, roomChangeRequests, today, pendingDepositSettlements,
                enquiryModule.countNewForProperty(propertyId),
                staffModule.countSalaryPaymentDue(propertyId, today));
        BudgetAttention budget = buildBudget(expenseModule.budgetSnapshot(propertyId, monthStart));
        ConcernQueueSummary concernQueue = buildConcernQueue(concern);
        List<MonthlyTrendPoint> monthlyTrends =
                buildMonthlyTrends(allTenancies, inactiveTenancies, cycles, occupancy.totalBeds(), today);
        // Straight read: the feed is only what listeners have recorded. Nothing is
        // derived from current state any more, which is what let history rewrite itself.
        List<RecentActivityItem> recentActivity = activityEventService.listRecent(propertyId, recentActivityLimit);

        log.info("Action center built propertyId={} actorUserId={}", propertyId, actorUserId);

        return new ActionCenterResponse(
                new ActionCenterProperty(
                        property.id(),
                        property.name(),
                        property.referenceCode(),
                        property.city(),
                        property.type()),
                occupancy,
                tenancy,
                money,
                todayDigest,
                attention,
                budget,
                concernQueue,
                recentActivity,
                monthlyTrends,
                Instant.now());
    }

    /**
     * Maps the current month's budget overview to an action-center flag. NONE when
     * there is no budget or spend is comfortably under it; APPROACHING once spend
     * reaches {@link #BUDGET_APPROACHING_PERCENT}; EXCEEDED once spend passes the
     * effective budget (which already includes projected salary).
     */
    private BudgetAttention buildBudget(ExpenseBudgetOverviewResponse budget) {
        Long effective = budget.effectiveBudgetPaise();
        long spent = budget.spentPaise();
        if (effective == null || effective <= 0) {
            return new BudgetAttention(BudgetAttentionLevel.NONE, 0, spent, 0, 0);
        }
        if (spent > effective) {
            return new BudgetAttention(BudgetAttentionLevel.EXCEEDED, effective, spent, spent - effective, 0);
        }
        long remaining = effective - spent;
        if (spent * 100 >= effective * BUDGET_APPROACHING_PERCENT) {
            return new BudgetAttention(BudgetAttentionLevel.APPROACHING, effective, spent, 0, remaining);
        }
        return new BudgetAttention(BudgetAttentionLevel.NONE, effective, spent, 0, remaining);
    }

    /**
     * Tenancy movement for the property: live counts plus month-scoped started
     * and ended tenancies (IST calendar month) and approved upcoming exits.
     */
    private TenancySnapshot buildTenancy(
            List<TenancyResponse> activeTenancies,
            List<TenancyResponse> inactiveTenancies,
            List<TenancyResponse> allTenancies,
            List<TenancyExitRequestResponse> exitRequests,
            LocalDate today) {
        LocalDate monthStart = today.withDayOfMonth(1);
        LocalDate nextMonthStart = monthStart.plusMonths(1);
        LocalDate prevMonthStart = monthStart.minusMonths(1);

        long onNotice = activeTenancies.stream()
                .filter(tenancy -> tenancy.status() == TenancyStatus.ON_NOTICE
                        || tenancy.status() == TenancyStatus.ON_PREMATURE_NOTICE)
                .count();

        long startedThisMonth = Stream.concat(activeTenancies.stream(), inactiveTenancies.stream())
                .filter(tenancy -> isWithinMonth(tenancy.startDate(), monthStart, nextMonthStart))
                .count();

        long endedThisMonth = inactiveTenancies.stream()
                .filter(tenancy -> isWithinMonth(tenancy.endDate(), monthStart, nextMonthStart))
                .count();

        long startedPrevMonth = allTenancies.stream()
                .filter(tenancy -> isWithinMonth(tenancy.startDate(), prevMonthStart, monthStart))
                .count();

        long endedPrevMonth = inactiveTenancies.stream()
                .filter(tenancy -> isWithinMonth(tenancy.endDate(), prevMonthStart, monthStart))
                .count();

        long activeTenantsPrevMonth = activeTenantsDuring(allTenancies, prevMonthStart, monthStart);

        long upcomingExits = countUpcomingExits(activeTenancies, exitRequests, today);

        return new TenancySnapshot(
                activeTenancies.size(),
                onNotice,
                startedThisMonth,
                endedThisMonth,
                upcomingExits,
                activeTenantsPrevMonth,
                startedPrevMonth,
                endedPrevMonth);
    }

    /**
     * Upcoming exits within the horizon: approved monthly exit requests plus
     * active daily tenancies whose end date is due soon (daily stays end on their
     * end date without an exit request). De-duplicated by tenancy id.
     */
    private long countUpcomingExits(
            List<TenancyResponse> activeTenancies,
            List<TenancyExitRequestResponse> exitRequests,
            LocalDate today) {
        LocalDate horizon = today.plusDays(upcomingExitDays);
        Set<UUID> counted = new HashSet<>();
        long count = 0;
        for (TenancyExitRequestResponse request : exitRequests) {
            if (request.status() != TenancyExitRequestStatus.APPROVED) {
                continue;
            }
            LocalDate checkout = request.approvedCheckoutDate();
            if (checkout != null && checkout.isAfter(today) && !checkout.isAfter(horizon)) {
                count = count + 1;
                counted.add(request.tenancyId());
            }
        }
        for (TenancyResponse tenancy : activeTenancies) {
            if (tenancy.billingType() != TenancyBillingType.DAILY) {
                continue;
            }
            LocalDate end = tenancy.plannedEndDate();
            if (end != null && end.isAfter(today) && !end.isAfter(horizon) && !counted.contains(tenancy.id())) {
                count = count + 1;
            }
        }
        return count;
    }

    /**
     * Exits that are past due but not yet executed: approved monthly exit requests
     * whose checkout date has already passed (the exit scheduler has not run / there
     * is none) plus active daily tenancies whose end date has passed (daily stays end
     * on their end date without an exit request). De-duplicated by tenancy id.
     */
    private long countPastDueExits(
            List<TenancyResponse> activeTenancies,
            List<TenancyExitRequestResponse> exitRequests,
            LocalDate today) {
        Set<UUID> counted = new HashSet<>();
        long count = 0;
        for (TenancyExitRequestResponse request : exitRequests) {
            if (request.status() != TenancyExitRequestStatus.APPROVED) {
                continue;
            }
            LocalDate checkout = request.approvedCheckoutDate();
            if (checkout != null && checkout.isBefore(today)) {
                count = count + 1;
                counted.add(request.tenancyId());
            }
        }
        for (TenancyResponse tenancy : activeTenancies) {
            if (tenancy.billingType() != TenancyBillingType.DAILY) {
                continue;
            }
            LocalDate end = tenancy.plannedEndDate();
            if (end != null && end.isBefore(today) && !counted.contains(tenancy.id())) {
                count = count + 1;
            }
        }
        return count;
    }

    /**
     * Counts tenancies whose stay overlaps the half-open month window
     * {@code [monthStart, nextMonthStart)} — i.e. started before the month ends
     * and not yet ended when the month begins.
     */
    private long activeTenantsDuring(
            List<TenancyResponse> tenancies, LocalDate monthStart, LocalDate nextMonthStart) {
        return tenancies.stream()
                .filter(tenancy -> tenancy.startDate() != null
                        && tenancy.startDate().isBefore(nextMonthStart)
                        && (tenancy.endDate() == null || !tenancy.endDate().isBefore(monthStart)))
                .count();
    }

    private boolean isWithinMonth(LocalDate date, LocalDate monthStart, LocalDate nextMonthStart) {
        return date != null && !date.isBefore(monthStart) && date.isBefore(nextMonthStart);
    }


    private OccupancySnapshot buildOccupancy(List<RoomResponse> rooms, List<TenancyResponse> activeTenancies) {
        long totalBeds = rooms.stream().mapToLong(RoomResponse::capacity).sum();
        long occupiedBeds = rooms.stream().mapToLong(RoomResponse::occupiedCount).sum();
        long vacantBeds = Math.max(0, totalBeds - occupiedBeds);
        long unavailableRooms = rooms.stream()
                .filter(room -> room.capacity() > 0 && room.occupiedCount() >= room.capacity())
                .count();

        return new OccupancySnapshot(
                activeTenancies.size(),
                totalBeds,
                occupiedBeds,
                vacantBeds,
                rooms.size(),
                unavailableRooms);
    }

    private MoneySnapshot buildMoney(
            BillingDashboardSummary billing,
            List<BillingCycleResponse> cycles,
            List<TenancyResponse> activeTenancies,
            LocalDate prevMonthStart,
            LocalDate monthStart) {
        LocalDate nextMonthStart = monthStart.plusMonths(1);

        // Monthly cycles generate lazily on each tenancy's anniversary day, so early
        // in the month "billed" is near zero even though rent is collectable. Project
        // the month from active monthly tenancies that are not exiting this month and
        // whose cycle has not generated yet, so billed and pending reflect what is
        // collectable rather than only what has already been billed. (Same rule as the
        // billing screen's month summary.)
        // Whose RENT is already on the books. Category matters: a one-off bill is
        // not rent, so counting it here suppressed that tenancy's rent projection
        // — three one-off bills were enough to zero the projection for the whole
        // property. Same rule as BillingCycleService.getPropertyMonthSummary.
        Set<UUID> billedTenancyIds = new HashSet<>();
        for (BillingCycleResponse cycle : cycles) {
            if (cycle.status() != BillingCycleStatus.CANCELLED
                    && cycle.category() == BillingCycleCategory.RENT_CYCLE
                    && isWithinMonth(cycle.periodStartDate(), monthStart, nextMonthStart)) {
                billedTenancyIds.add(cycle.tenancyId());
            }
        }
        long projectedExtraPaise = 0;
        for (TenancyResponse tenancy : activeTenancies) {
            if (tenancy.billingType() != TenancyBillingType.MONTHLY || tenancy.rentAmountPaise() == null) {
                continue;
            }
            LocalDate end = tenancy.endDate();
            boolean endingThisMonth = end != null && !end.isBefore(monthStart) && end.isBefore(nextMonthStart);
            if (endingThisMonth || billedTenancyIds.contains(tenancy.id())) {
                continue;
            }
            projectedExtraPaise = projectedExtraPaise + tenancy.rentAmountPaise();
        }

        long billedThisMonth = billing.billedThisMonthPaise() + projectedExtraPaise;
        long collectedThisMonth = billing.collectedThisMonthPaise();
        long pending = Math.max(0, billedThisMonth - collectedThisMonth);

        return new MoneySnapshot(
                billedThisMonth,
                collectedThisMonth,
                pending,
                billing.overduePaise(),
                billing.overdueCount(),
                billedInMonth(cycles, prevMonthStart, monthStart),
                collectedInMonth(cycles, prevMonthStart, monthStart));
    }

    /**
     * Builds the trailing six-month trend (oldest first, current month last) used
     * by the dashboard bar charts. Occupancy rate is active tenancies in the
     * month over current total beds; collection rate is collected over billed in
     * the month. Both are clamped to 0..100.
     *
     * <p>Started and ended are counted exactly as the current-month figures on
     * the tenancy snapshot are: any stay whose start date lands in the month,
     * and only ENDED stays whose end date does. Ended reads from the inactive
     * list alone because an active stay on notice carries a future end date,
     * and counting that as an exit would report a month's departures before
     * anybody had left.
     */
    private List<MonthlyTrendPoint> buildMonthlyTrends(
            List<TenancyResponse> allTenancies,
            List<TenancyResponse> inactiveTenancies,
            List<BillingCycleResponse> cycles,
            long totalBeds,
            LocalDate today) {
        List<MonthlyTrendPoint> points = new ArrayList<>();
        LocalDate currentMonthStart = today.withDayOfMonth(1);

        for (int monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
            LocalDate windowStart = currentMonthStart.minusMonths(monthsAgo);
            LocalDate windowEnd = windowStart.plusMonths(1);

            long activeInMonth = activeTenantsDuring(allTenancies, windowStart, windowEnd);
            long billed = billedInMonth(cycles, windowStart, windowEnd);
            long collected = collectedInMonth(cycles, windowStart, windowEnd);
            long started = allTenancies.stream()
                    .filter(tenancy -> isWithinMonth(tenancy.startDate(), windowStart, windowEnd))
                    .count();
            long ended = inactiveTenancies.stream()
                    .filter(tenancy -> isWithinMonth(tenancy.endDate(), windowStart, windowEnd))
                    .count();

            int occupancyRate = totalBeds > 0
                    ? clampPercent((int) Math.round(100.0 * activeInMonth / totalBeds))
                    : 0;
            int collectionRate = billed > 0
                    ? clampPercent((int) Math.round(100.0 * collected / billed))
                    : 0;

            String label = windowStart.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
            points.add(new MonthlyTrendPoint(label, occupancyRate, collectionRate, collected, started, ended));
        }

        return points;
    }

    private int clampPercent(int value) {
        return Math.min(100, Math.max(0, value));
    }

    private long billedInMonth(
            List<BillingCycleResponse> cycles, LocalDate monthStart, LocalDate nextMonthStart) {
        return cycles.stream()
                .filter(cycle -> isWithinMonth(cycle.periodStartDate(), monthStart, nextMonthStart))
                .mapToLong(BillingCycleResponse::totalAmountPaise)
                .sum();
    }

    private long collectedInMonth(
            List<BillingCycleResponse> cycles, LocalDate monthStart, LocalDate nextMonthStart) {
        return cycles.stream()
                .filter(cycle -> cycle.status() == BillingCycleStatus.PAID && cycle.paidAt() != null)
                .filter(cycle -> isWithinMonth(
                        LocalDate.ofInstant(cycle.paidAt(), IST), monthStart, nextMonthStart))
                .mapToLong(BillingCycleResponse::totalAmountPaise)
                .sum();
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
            LocalDate today,
            long pendingDepositSettlements,
            long newEnquiries,
            long salaryPaymentsDue) {
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

        // Read off the tenancy itself, not the agreement. A tenancy onboarded
        // with an agreement is held at PENDING_ACCEPTANCE and the acceptance —
        // and the expiry job — flip both records in one transaction, so the two
        // can never disagree. Asking compliance would mean a second query and a
        // module dependency for a fact already in this list.
        long agreementsPendingAcceptance = activeTenancies.stream()
                .filter(tenancy -> tenancy.status() == TenancyStatus.PENDING_ACCEPTANCE)
                .count();

        long upcomingExits = countUpcomingExits(activeTenancies, exitRequests, today);

        long exitsPastDue = countPastDueExits(activeTenancies, exitRequests, today);

        return new AttentionSummary(
                billing.overdueCount(),
                concern.unattended24h(),
                concern.actionableEscalated(),
                pendingExitRequests,
                pendingRoomChangeRequests,
                upcomingExits,
                exitsPastDue,
                tenantsOnNotice,
                pendingDepositSettlements,
                newEnquiries,
                salaryPaymentsDue,
                agreementsPendingAcceptance);
    }

    private ConcernQueueSummary buildConcernQueue(ConcernDashboardSummary concern) {
        return new ConcernQueueSummary(
                concern.open(),
                concern.underReview(),
                concern.inProgress(),
                concern.actionableEscalated(),
                concern.reopened(),
                concern.resolvedThisWeek());
    }
}
