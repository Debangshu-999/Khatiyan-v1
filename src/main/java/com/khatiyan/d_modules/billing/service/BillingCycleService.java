package com.khatiyan.d_modules.billing.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import java.util.stream.Collectors;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleLineItemResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingDashboardSummary;
import com.khatiyan.d_modules.billing.api.dto.BillingMonthSummary;
import com.khatiyan.d_modules.billing.api.dto.BillingPastSummary;
import com.khatiyan.d_modules.billing.api.dto.ManualPaymentResponse;
import com.khatiyan.d_modules.billing.api.dto.RecordManualPaymentRequest;
import com.khatiyan.d_modules.billing.event.BillingCycleGeneratedEvent;
import com.khatiyan.d_modules.billing.event.BillingLateFeeAppliedEvent;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItem;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemStatus;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.billing.model.BillingLineSettlementAction;
import com.khatiyan.d_modules.billing.model.BillingManualPayment;
import com.khatiyan.d_modules.billing.model.BillingMonthlyReport;
import com.khatiyan.d_modules.billing.repository.BillingCycleLineItemRepository;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.billing.repository.BillingManualPaymentRepository;
import com.khatiyan.d_modules.billing.repository.BillingMonthlyReportRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

import lombok.extern.slf4j.Slf4j;

/**
 * Manages live billing cycles before payment succeeds.
 *
 * <p>
 * A billing cycle is the editable payable workspace. For now, payment success
 * marks the cycle itself as paid; a separate receipt/snapshot can be added
 * later
 * when the payments module is built.
 */
@Slf4j
@Service
public class BillingCycleService {

    private final BillingCycleRepository billingCycleRepository;
    private final BillingCycleLineItemRepository lineItemRepository;
    private final BillingManualPaymentRepository manualPaymentRepository;
    private final BillingMonthlyReportRepository monthlyReportRepository;
    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final DepositManagerService depositManagerService;
    private final ApplicationEventPublisher eventPublisher;
    private final ReferenceCodeGenerator referenceCodeGenerator;

    public BillingCycleService(
            BillingCycleRepository billingCycleRepository,
            BillingCycleLineItemRepository lineItemRepository,
            BillingManualPaymentRepository manualPaymentRepository,
            BillingMonthlyReportRepository monthlyReportRepository,
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            AuthModule authModule,
            DepositManagerService depositManagerService,
            ApplicationEventPublisher eventPublisher,
            ReferenceCodeGenerator referenceCodeGenerator) {
        this.billingCycleRepository = billingCycleRepository;
        this.lineItemRepository = lineItemRepository;
        this.manualPaymentRepository = manualPaymentRepository;
        this.monthlyReportRepository = monthlyReportRepository;
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.depositManagerService = depositManagerService;
        this.eventPublisher = eventPublisher;
        this.referenceCodeGenerator = referenceCodeGenerator;
    }

    /**
     * Creates the first billing cycle for a tenancy.
     */
    @Transactional
    public BillingCycleResponse createFirstCycle(UUID actorUserId, UUID tenancyId) {
        Instant generationCutoff = Instant.now();
        TenancyResponse tenancy = getTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

        if (billingCycleRepository.existsByTenancyIdAndCycleNumber(tenancyId, 1)) {
            throw new ValidationException("First billing cycle already exists");
        }

        UserSummaryResponse tenant = authModule.findById(tenancy.userId())
                .orElseThrow(() -> new NotFoundException("User", tenancy.userId()));

        BillingCycle cycle = createCycleEntity(tenancy, tenant.fullName(), 1, tenancy.startDate());
        BillingCycle savedCycle = billingCycleRepository.save(cycle);

        createBaseLineItems(savedCycle, tenancy);
        attachPendingLineItems(savedCycle, generationCutoff);
        calculateCycle(savedCycle);
        lineItemRepository.flush();
        billingCycleRepository.saveAndFlush(savedCycle);

        tenancyModule.markBillingStarted(tenancyId);
        publishBillingCycleGenerated(savedCycle);

        log.info(
                "Billing cycle created billingCycleId={} tenancyId={} actorUserId={} cycleNumber={}",
                savedCycle.getId(),
                tenancyId,
                actorUserId,
                savedCycle.getCycleNumber());

        return toResponse(savedCycle);
    }

    /**
     * Lists tenant billing cycles for self-view.
     */
    @Transactional(readOnly = true)
    public List<BillingCycleResponse> listMyCycles(UUID tenantUserId) {
        return billingCycleRepository.findByTenantUserId(tenantUserId)
                .stream()
                .map(cycle -> toResponse(cycle))
                .toList();
    }

    private static final ZoneId DASHBOARD_ZONE = ZoneId.of("Asia/Kolkata");

    /**
     * Property-scoped billing rollup for the owner action center.
     *
     * <p>"This month" uses the current IST calendar month; "today" uses the
     * current IST date. Billed counts cycles whose period starts in the month;
     * collected/payments-today count cycles marked PAID with a payment instant
     * in the window.
     */
    @Transactional(readOnly = true)
    public BillingDashboardSummary getPropertyBillingSummary(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        LocalDate today = LocalDate.now(DASHBOARD_ZONE);
        LocalDate monthStart = today.withDayOfMonth(1);
        LocalDate nextMonthStart = monthStart.plusMonths(1);

        Instant monthStartInstant = monthStart.atStartOfDay(DASHBOARD_ZONE).toInstant();
        Instant nextMonthStartInstant = nextMonthStart.atStartOfDay(DASHBOARD_ZONE).toInstant();
        Instant todayStartInstant = today.atStartOfDay(DASHBOARD_ZONE).toInstant();
        Instant tomorrowStartInstant = today.plusDays(1).atStartOfDay(DASHBOARD_ZONE).toInstant();

        long billed = billingCycleRepository.sumTotalForPropertyByPeriodStartBetween(
                propertyId, monthStart, nextMonthStart);
        long collected = billingCycleRepository.sumTotalForPropertyByStatusAndPaidAtBetween(
                propertyId, BillingCycleStatus.PAID, monthStartInstant, nextMonthStartInstant);
        long pending = billingCycleRepository.sumTotalForPropertyByStatusIn(
                propertyId, List.of(BillingCycleStatus.UNPAID, BillingCycleStatus.OVERDUE));
        long overdue = billingCycleRepository.sumTotalForPropertyByStatus(
                propertyId, BillingCycleStatus.OVERDUE);
        long overdueCount = billingCycleRepository.countForPropertyByStatus(
                propertyId, BillingCycleStatus.OVERDUE);
        long paymentsMadeToday = billingCycleRepository.countForPropertyByStatusAndPaidAtBetween(
                propertyId, BillingCycleStatus.PAID, todayStartInstant, tomorrowStartInstant);
        long paymentsMadeTodayPaise = billingCycleRepository.sumTotalForPropertyByStatusAndPaidAtBetween(
                propertyId, BillingCycleStatus.PAID, todayStartInstant, tomorrowStartInstant);
        long activeCycleCount = billingCycleRepository.countForPropertyByStatusIn(
                propertyId, List.of(BillingCycleStatus.UNPAID, BillingCycleStatus.OVERDUE, BillingCycleStatus.PAID));
        long paidCycleCount = billingCycleRepository.countForPropertyByStatus(propertyId, BillingCycleStatus.PAID);
        long manuallyPaidCycleCount = manualPaymentRepository.countDistinctPaidCyclesByPropertyId(propertyId);
        long unpaidCycleCount = billingCycleRepository.countForPropertyByStatus(propertyId, BillingCycleStatus.UNPAID);
        long totalCollectedPaise = billingCycleRepository.sumTotalForPropertyByStatus(
                propertyId, BillingCycleStatus.PAID);
        long manuallyCollectedPaise = manualPaymentRepository.sumAmountByPropertyId(propertyId);
        long totalDiscountPaise = billingCycleRepository.sumDiscountForProperty(propertyId);

        return new BillingDashboardSummary(
                billed,
                collected,
                pending,
                overdue,
                overdueCount,
                paymentsMadeToday,
                paymentsMadeTodayPaise,
                activeCycleCount,
                paidCycleCount,
                manuallyPaidCycleCount,
                unpaidCycleCount,
                totalCollectedPaise,
                manuallyCollectedPaise,
                totalDiscountPaise);
    }

    /**
     * Month-scoped billing summary for the owner billing screen (active tab).
     * Covers all property cycles whose period starts in the selected IST month.
     */
    @Transactional(readOnly = true)
    public BillingMonthSummary getPropertyMonthSummary(UUID actorUserId, UUID propertyId, String month) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        LocalDate parsed = parseMonthStart(month);
        LocalDate monthStart = parsed != null ? parsed : LocalDate.now(DASHBOARD_ZONE).withDayOfMonth(1);
        LocalDate nextMonth = monthStart.plusMonths(1);
        Instant fromInstant = monthStart.atStartOfDay(DASHBOARD_ZONE).toInstant();
        Instant toInstant = nextMonth.atStartOfDay(DASHBOARD_ZONE).toInstant();

        List<BillingCycle> cycles = cyclesForReportMonth(propertyId, monthStart);

        long activeCount = cycles.size();
        long overdueCount = cycles.stream().filter(c -> c.getStatus() == BillingCycleStatus.OVERDUE).count();
        long overduePaise = cycles.stream()
                .filter(c -> c.getStatus() == BillingCycleStatus.OVERDUE)
                .mapToLong(BillingCycle::getTotalAmountPaise).sum();
        long paidCount = cycles.stream().filter(BillingCycle::isPaid).count();
        long unpaidCount = cycles.stream().filter(c -> c.getStatus() == BillingCycleStatus.UNPAID).count();
        long billedPaise = cycles.stream().filter(c -> !c.isCancelled())
                .mapToLong(BillingCycle::getTotalAmountPaise).sum();
        long collectedPaise = cycles.stream().filter(BillingCycle::isPaid)
                .mapToLong(BillingCycle::getTotalAmountPaise).sum();
        long discountPaise = cycles.stream().mapToLong(BillingCycle::getDiscountAmountPaise).sum();

        long manuallyPaidPaise = manualPaymentRepository
                .sumAmountByPropertyAndCollectedBetween(propertyId, fromInstant, toInstant);
        long manuallyPaidCount = manualPaymentRepository
                .countDistinctCyclesByPropertyAndCollectedBetween(propertyId, fromInstant, toInstant);

        return new BillingMonthSummary(
                monthStart.toString().substring(0, 7),
                !cycles.isEmpty(),
                activeCount,
                overdueCount,
                overduePaise,
                paidCount,
                unpaidCount,
                billedPaise,
                collectedPaise,
                discountPaise,
                manuallyPaidCount,
                manuallyPaidPaise);
    }

    /**
     * Summary for the owner billing "past cycles" tab — cycles from months
     * before the selected month, independent of tenancy status.
     */
    @Transactional(readOnly = true)
    public BillingPastSummary getPropertyPastSummary(UUID actorUserId, UUID propertyId, String month) {
        List<BillingCycleResponse> past = listPastPropertyCycles(actorUserId, propertyId, null, month);

        long paidCount = past.stream().filter(c -> c.status() == BillingCycleStatus.PAID).count();
        long paidPaise = past.stream().filter(c -> c.status() == BillingCycleStatus.PAID)
                .mapToLong(BillingCycleResponse::totalAmountPaise).sum();
        long unpaidCount = past.stream()
                .filter(c -> c.status() == BillingCycleStatus.UNPAID || c.status() == BillingCycleStatus.OVERDUE)
                .count();
        long unpaidPaise = past.stream()
                .filter(c -> c.status() == BillingCycleStatus.UNPAID || c.status() == BillingCycleStatus.OVERDUE)
                .mapToLong(BillingCycleResponse::totalAmountPaise).sum();

        return new BillingPastSummary(past.size(), paidCount, paidPaise, unpaidCount, unpaidPaise);
    }

    /**
     * Lists billing cycles whose period starts in the selected month, for the
     * whole property and independent of tenancy status.
     */
    @Transactional(readOnly = true)
    public List<BillingCycleResponse> listPropertyCycles(
            UUID actorUserId,
            UUID propertyId,
            String query,
            String month) {
        return listPropertyCyclesForMonth(actorUserId, propertyId, query, month, true);
    }

    /**
     * Lists billing cycles from months before the selected month, for the whole
     * property and independent of tenancy status.
     */
    @Transactional(readOnly = true)
    public List<BillingCycleResponse> listPastPropertyCycles(
            UUID actorUserId,
            UUID propertyId,
            String query,
            String month) {
        return listPropertyCyclesForMonth(actorUserId, propertyId, query, month, false);
    }

    private List<BillingCycleResponse> listPropertyCyclesForMonth(
            UUID actorUserId,
            UUID propertyId,
            String query,
            String month,
            boolean inSelectedMonth) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        LocalDate parsed = parseMonthStart(month);
        LocalDate monthStart = parsed != null ? parsed : LocalDate.now(DASHBOARD_ZONE).withDayOfMonth(1);
        LocalDate nextMonth = monthStart.plusMonths(1);
        String normalizedQuery = normalize(query);

        return billingCycleRepository.findByPropertyId(propertyId)
                .stream()
                .filter(cycle -> inSelectedMonth
                        ? (!cycle.getPeriodStartDate().isBefore(monthStart)
                                && cycle.getPeriodStartDate().isBefore(nextMonth))
                        : cycle.getPeriodStartDate().isBefore(monthStart))
                .filter(cycle -> matchesCycleSearch(cycle, normalizedQuery))
                .sorted(Comparator.comparing(BillingCycle::getPeriodStartDate).reversed())
                .map(cycle -> toResponse(cycle))
                .toList();
    }

    /**
     * Downloads a finalized month-wise billing report.
     */
    @Transactional(readOnly = true)
    public String exportPropertyCyclesCsv(
            UUID actorUserId,
            UUID propertyId,
            String month) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        LocalDate parsedReportMonth = parseMonthStart(month);
        LocalDate reportMonth = parsedReportMonth == null
                ? LocalDate.now(DASHBOARD_ZONE).withDayOfMonth(1)
                : parsedReportMonth;

        LocalDate currentMonth = LocalDate.now(DASHBOARD_ZONE).withDayOfMonth(1);
        if (!reportMonth.isBefore(currentMonth)) {
            throw new ValidationException("Billing report for this month is not available until the month is finalized");
        }

        return monthlyReportRepository.findByPropertyIdAndReportMonth(propertyId, reportMonth)
                .map(BillingMonthlyReport::getCsvContent)
                .orElseThrow(() -> new NotFoundException("BillingMonthlyReport", reportMonth));
    }

    /**
     * Generates finalized reports for the previous calendar month once the
     * month has closed. Empty months are intentionally not materialized.
     */
    @Transactional
    public int generateClosedMonthlyReports(LocalDate today) {
        LocalDate reportMonth = today.minusMonths(1).withDayOfMonth(1);
        LocalDate currentMonth = today.withDayOfMonth(1);
        if (!reportMonth.isBefore(currentMonth)) {
            return 0;
        }

        int generatedCount = 0;
        for (PropertyResponse property : propertyModule.listActiveProperties()) {
            if (monthlyReportRepository.existsByPropertyIdAndReportMonth(property.id(), reportMonth)) {
                continue;
            }

            List<BillingCycle> cycles = cyclesForReportMonth(property.id(), reportMonth);
            if (cycles.isEmpty()) {
                continue;
            }

            BillingMonthlyReport report = buildMonthlyReport(property.id(), reportMonth, cycles);
            monthlyReportRepository.save(report);
            generatedCount = generatedCount + 1;
        }

        log.info("Billing monthly report generation month={} generated={}", reportMonth, generatedCount);
        return generatedCount;
    }

    /**
     * Lists tenant billing cycles for one tenancy owned by the tenant.
     */
    @Transactional(readOnly = true)
    public List<BillingCycleResponse> listMyTenancyCycles(UUID tenantUserId, UUID tenancyId) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        if (!tenancy.userId().equals(tenantUserId)) {
            throw new ValidationException("Tenancy does not belong to current user");
        }

        return billingCycleRepository.findByTenancyId(tenancyId)
                .stream()
                .map(cycle -> toResponse(cycle))
                .toList();
    }

    /**
     * Lists billing cycles for a managed tenancy.
     */
    @Transactional(readOnly = true)
    public List<BillingCycleResponse> listManagedTenancyCycles(UUID actorUserId, UUID tenancyId) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

        return billingCycleRepository.findByTenancyId(tenancyId)
                .stream()
                .map(cycle -> toResponse(cycle))
                .toList();
    }

    /**
     * Loads the latest cycle for a tenancy after verifying property access.
     */
    @Transactional(readOnly = true)
    public BillingCycleResponse getLatestManagedTenancyCycle(UUID actorUserId, UUID tenancyId) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

        BillingCycle cycle = getLatestCycle(tenancyId);
        return toResponse(cycle);
    }

    /**
     * Loads the latest cycle for tenant self-service flows.
     */
    @Transactional(readOnly = true)
    public BillingCycleResponse getLatestMyCycle(UUID tenantUserId) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancy", tenantUserId));

        BillingCycle cycle = getLatestCycle(tenancy.id());
        return toResponse(cycle);
    }

    /**
     * Loads one tenant-owned cycle for payment initiation or self-service views.
     */
    @Transactional(readOnly = true)
    public BillingCycleResponse getMyCycle(UUID tenantUserId, UUID billingCycleId) {
        BillingCycle cycle = billingCycleRepository.findByIdForTenant(billingCycleId, tenantUserId)
                .orElseThrow(() -> new NotFoundException("BillingCycle", billingCycleId));

        return toResponse(cycle);
    }

    /**
     * Recalculates a tenant-owned live cycle from its current line items.
     *
     * <p>
     * This is a repair/safety action for manual refresh flows. Paid and
     * cancelled cycles are immutable and are returned without recalculation.
     */
    @Transactional
    public BillingCycleResponse refreshMyCycle(UUID tenantUserId, UUID billingCycleId) {
        BillingCycle cycle = billingCycleRepository.findByIdForTenant(billingCycleId, tenantUserId)
                .orElseThrow(() -> new NotFoundException("BillingCycle", billingCycleId));

        refreshCycleTotalsIfMutable(cycle);

        log.info(
                "Billing cycle manually refreshed billingCycleId={} tenantUserId={} status={}",
                billingCycleId,
                tenantUserId,
                cycle.getStatus());

        return toResponse(cycle);
    }

    /**
     * Recalculates a managed live cycle from its current line items.
     *
     * <p>
     * This is useful when a cycle summary has drifted from its line-item
     * breakdown during testing or admin maintenance.
     */
    @Transactional
    public BillingCycleResponse refreshManagedCycle(UUID actorUserId, UUID billingCycleId) {
        BillingCycle cycle = getManagedCycle(actorUserId, billingCycleId);
        refreshCycleTotalsIfMutable(cycle);

        log.info(
                "Managed billing cycle manually refreshed billingCycleId={} actorUserId={} status={}",
                billingCycleId,
                actorUserId,
                cycle.getStatus());

        return toResponse(cycle);
    }

    /**
     * Marks a live billing cycle as paid after a successful payment confirmation.
     *
     * <p>
     * Until the payments module exists, the dummy frontend calls this directly.
     * Any line settled from deposit is applied to the deposit manager in the same
     * transaction before the cycle is marked paid.
     */
    @Transactional
    public BillingCycleResponse recordPaymentSuccess(UUID actorUserId, UUID billingCycleId, long paidAmountPaise) {
        BillingCycle cycle = getManagedCycle(actorUserId, billingCycleId);
        return recordPaymentSuccessForCycle(actorUserId, cycle, paidAmountPaise);
    }

    /**
     * Tenant self-payment path for their own billing cycle.
     */
    @Transactional
    public BillingCycleResponse recordMyPaymentSuccess(UUID tenantUserId, UUID billingCycleId, long paidAmountPaise) {
        BillingCycle cycle = billingCycleRepository.findByIdForTenant(billingCycleId, tenantUserId)
                .orElseThrow(() -> new NotFoundException("BillingCycle", billingCycleId));

        return recordPaymentSuccessForCycle(tenantUserId, cycle, paidAmountPaise);
    }

    /**
     * Owner/manager records an offline payment (cash, UPI, bank transfer, etc.)
     * for a billing cycle. The payment covers the full cycle total (partial
     * payments are not supported yet); the manual payment is recorded and the
     * cycle is marked paid in the same transaction.
     */
    @Transactional
    public ManualPaymentResponse recordManualPayment(
            UUID actorUserId,
            UUID billingCycleId,
            RecordManualPaymentRequest request) {
        BillingCycle cycle = getManagedCycle(actorUserId, billingCycleId);

        if (cycle.isCancelled()) {
            throw new ValidationException("Cancelled billing cycle cannot be paid");
        }
        if (cycle.isPaid()) {
            throw new ValidationException("Billing cycle is already paid");
        }

        Instant now = Instant.now();
        BillingManualPayment manualPayment = BillingManualPayment.record(
                cycle.getId(),
                cycle.getTenancyId(),
                cycle.getTenantUserId(),
                cycle.getPropertyId(),
                cycle.getTotalAmountPaise(),
                request.method(),
                normalize(request.referenceText()),
                normalize(request.proofImageUrl()),
                normalize(request.note()),
                actorUserId,
                now);
        BillingManualPayment saved = manualPaymentRepository.save(manualPayment);

        // Reuse the standard paid path: validates amount, opens the first-cycle
        // deposit account, and marks the cycle paid.
        recordPaymentSuccessForCycle(actorUserId, cycle, cycle.getTotalAmountPaise());

        log.info(
                "Manual payment recorded manualPaymentId={} billingCycleId={} actorUserId={} method={}",
                saved.getId(),
                billingCycleId,
                actorUserId,
                saved.getMethod());

        return ManualPaymentResponse.from(saved);
    }

    /**
     * Lists manual payments recorded against a billing cycle the actor manages.
     */
    @Transactional(readOnly = true)
    public List<ManualPaymentResponse> listManualPayments(UUID actorUserId, UUID billingCycleId) {
        getManagedCycle(actorUserId, billingCycleId);

        return manualPaymentRepository.findByBillingCycleId(billingCycleId)
                .stream()
                .map(ManualPaymentResponse::from)
                .toList();
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private boolean matchesCycleSearch(BillingCycle cycle, String normalizedQuery) {
        if (normalizedQuery == null) {
            return true;
        }

        return contains(cycle.getTenantNameSnapshot(), normalizedQuery)
                || contains(cycle.getTenancyId().toString(), normalizedQuery)
                || contains(cycle.getReferenceCode(), normalizedQuery);
    }

    private boolean contains(String value, String normalizedQuery) {
        return value != null && value.toLowerCase().contains(normalizedQuery.toLowerCase());
    }

    private LocalDate parseMonthStart(String month) {
        String normalizedMonth = normalize(month);
        if (normalizedMonth == null) {
            return null;
        }

        return LocalDate.parse(normalizedMonth + "-01", DateTimeFormatter.ISO_LOCAL_DATE);
    }

    private List<BillingCycle> cyclesForReportMonth(UUID propertyId, LocalDate reportMonth) {
        LocalDate nextMonthStart = reportMonth.plusMonths(1);

        return billingCycleRepository.findByPropertyId(propertyId)
                .stream()
                .filter(cycle -> !cycle.getPeriodStartDate().isBefore(reportMonth))
                .filter(cycle -> cycle.getPeriodStartDate().isBefore(nextMonthStart))
                .toList();
    }

    private BillingMonthlyReport buildMonthlyReport(
            UUID propertyId,
            LocalDate reportMonth,
            List<BillingCycle> cycles) {
        long totalCollectablePaise = cycles.stream()
                .mapToLong(BillingCycle::getTotalAmountPaise)
                .sum();
        long totalCollectedPaise = cycles.stream()
                .filter(BillingCycle::isPaid)
                .mapToLong(BillingCycle::getTotalAmountPaise)
                .sum();
        long totalPendingPaise = cycles.stream()
                .filter(cycle -> !cycle.isPaid() && !cycle.isCancelled())
                .mapToLong(BillingCycle::getTotalAmountPaise)
                .sum();
        long totalDiscountPaise = cycles.stream()
                .mapToLong(BillingCycle::getDiscountAmountPaise)
                .sum();
        long manualCollectedPaise = cycles.stream()
                .mapToLong(this::manualPaymentAmount)
                .sum();

        String csv = buildMonthlyReportCsv(
                reportMonth,
                cycles,
                totalCollectablePaise,
                totalCollectedPaise,
                totalPendingPaise,
                totalDiscountPaise,
                manualCollectedPaise);

        return BillingMonthlyReport.create(
                propertyId,
                reportMonth,
                csv,
                cycles.size(),
                totalCollectablePaise,
                totalCollectedPaise,
                totalPendingPaise,
                totalDiscountPaise,
                manualCollectedPaise,
                Instant.now());
    }

    private String buildMonthlyReportCsv(
            LocalDate reportMonth,
            List<BillingCycle> cycles,
            long totalCollectablePaise,
            long totalCollectedPaise,
            long totalPendingPaise,
            long totalDiscountPaise,
            long manualCollectedPaise) {
        StringBuilder csv = new StringBuilder();
        csv.append("report_month,cycle_count,total_collectable,total_collected,total_pending,total_discount,manual_collected\n");
        appendCsvValue(csv, reportMonth.toString());
        csv.append(cycles.size()).append(',');
        csv.append(totalCollectablePaise).append(',');
        csv.append(totalCollectedPaise).append(',');
        csv.append(totalPendingPaise).append(',');
        csv.append(totalDiscountPaise).append(',');
        csv.append(manualCollectedPaise).append('\n');
        csv.append('\n');
        csv.append("cycle_reference,cycle_id,tenancy_id,tenant_name,status,cycle_number,generation_date,period_start,period_end,due_date,payment_date,base_amount,extra_charge,late_fee,discount,total_amount,amount_paid,manual_payment,manual_payment_amount\n");

        for (BillingCycle cycle : cycles) {
            long manualAmount = manualPaymentAmount(cycle);
            appendCsvRow(csv, cycle, manualAmount > 0, manualAmount);
        }

        return csv.toString();
    }

    private long manualPaymentAmount(BillingCycle cycle) {
        return manualPaymentRepository.findByBillingCycleId(cycle.getId())
                .stream()
                .mapToLong(BillingManualPayment::getAmountPaise)
                .sum();
    }

    private void appendCsvRow(StringBuilder csv, BillingCycle cycle, boolean manuallyPaid, long manualAmount) {
        long amountPaid = cycle.isPaid() ? cycle.getTotalAmountPaise() : 0L;
        appendCsvValue(csv, cycle.getReferenceCode());
        appendCsvValue(csv, cycle.getId().toString());
        appendCsvValue(csv, cycle.getTenancyId().toString());
        appendCsvValue(csv, cycle.getTenantNameSnapshot());
        appendCsvValue(csv, cycle.getStatus().name());
        csv.append(cycle.getCycleNumber()).append(',');
        appendCsvValue(csv, cycle.getCreatedAt() == null ? "" : cycle.getCreatedAt().toString());
        appendCsvValue(csv, cycle.getPeriodStartDate().toString());
        appendCsvValue(csv, cycle.getPeriodEndDate().toString());
        appendCsvValue(csv, cycle.getRentDueDate().toString());
        appendCsvValue(csv, cycle.getPaidAt() == null ? "" : cycle.getPaidAt().toString());
        csv.append(cycle.getBaseAmountPaise()).append(',');
        csv.append(cycle.getExtraChargePaise()).append(',');
        csv.append(cycle.getLateFeeAmountPaise()).append(',');
        csv.append(cycle.getDiscountAmountPaise()).append(',');
        csv.append(cycle.getTotalAmountPaise()).append(',');
        csv.append(amountPaid).append(',');
        csv.append(manuallyPaid).append(',');
        csv.append(manualAmount).append('\n');
    }

    private void appendCsvValue(StringBuilder csv, String value) {
        csv.append('"');
        if (value != null) {
            csv.append(value.replace("\"", "\"\""));
        }
        csv.append('"').append(',');
    }

    private BillingCycleResponse recordPaymentSuccessForCycle(
            UUID performedByUserId,
            BillingCycle cycle,
            long paidAmountPaise) {
        if (cycle.isCancelled()) {
            throw new ValidationException("Cancelled billing cycle cannot be paid");
        }
        if (cycle.isPaid()) {
            return toResponse(cycle);
        }
        if (paidAmountPaise != cycle.getTotalAmountPaise()) {
            throw new ValidationException("Paid amount must match billing cycle total");
        }

        ensureFirstCycleDepositCanBeOpened(cycle);
        cycle.markPaid(Instant.now());
        openDepositAccountAfterFirstCyclePayment(cycle);

        log.info(
                "Billing cycle paid billingCycleId={} tenancyId={} performedByUserId={} paidAmount={}",
                cycle.getId(),
                cycle.getTenancyId(),
                performedByUserId,
                paidAmountPaise);

        return toResponse(cycle);
    }

    private void ensureFirstCycleDepositCanBeOpened(BillingCycle cycle) {
        if (cycle.getBillingType() != TenancyBillingType.MONTHLY || cycle.getCycleNumber() != 1) {
            return;
        }

        long depositAmountPaise = depositLineAmount(cycle.getId());
        if (depositAmountPaise <= 0) {
            return;
        }

        if (cycle.getTotalAmountPaise() < depositAmountPaise) {
            throw new ValidationException("First billing cycle payable amount cannot be less than deposit amount");
        }
    }

    private void openDepositAccountAfterFirstCyclePayment(BillingCycle cycle) {
        if (cycle.getBillingType() != TenancyBillingType.MONTHLY || cycle.getCycleNumber() != 1) {
            return;
        }

        TenancyResponse tenancy = getTenancy(cycle.getTenancyId());
        long depositAmountPaise = depositLineAmount(cycle.getId());
        depositManagerService.openFromPaidFirstCycleIfNeeded(tenancy, cycle, depositAmountPaise);
    }

    private long depositLineAmount(UUID billingCycleId) {
        return lineItemRepository.findByBillingCycleIdAndType(
                billingCycleId,
                BillingCycleLineItemType.DEPOSIT)
                .stream()
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();
    }

    /**
     * Exit execution guard: tenancy can end only when the latest cycle is paid.
     */
    @Transactional(readOnly = true)
    public BillingCycleResponse ensureLatestCyclePaidForExit(UUID actorUserId, UUID tenancyId) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

        BillingCycle cycle = getLatestCycle(tenancyId);
        if (!cycle.isPaid()) {
            throw new ValidationException("Latest billing cycle must be paid before tenancy exit");
        }

        return toResponse(cycle);
    }

    /**
     * Scheduler entry point for creating due monthly billing cycles.
     *
     * <p>
     * First-cycle creation remains part of tenancy creation. This job only
     * advances already-started monthly tenancies when their next period start has
     * arrived.
     */
    @Transactional
    public int generateDueMonthlyCycles(LocalDate today, int batchSize) {
        int resolvedBatchSize = batchSize > 0 ? batchSize : 50;
        int generatedCount = 0;
        int processedCount = 0;
        int failedCount = 0;

        List<TenancyResponse> tenancies = tenancyModule.findActiveBillingStartedMonthlyTenancies();
        for (TenancyResponse tenancy : tenancies) {
            if (generatedCount >= resolvedBatchSize) {
                break;
            }

            processedCount = processedCount + 1;
            try {
                if (generateDueMonthlyCycle(today, tenancy)) {
                    generatedCount = generatedCount + 1;
                }
            } catch (RuntimeException exception) {
                failedCount = failedCount + 1;
                log.error("Monthly billing scheduler failed tenancyId={}", tenancy.id(), exception);
            }
        }

        log.info(
                "Monthly billing cycle generation checked={} generated={} failed={} today={}",
                processedCount,
                generatedCount,
                failedCount,
                today);

        return generatedCount;
    }

    private boolean generateDueMonthlyCycle(LocalDate today, TenancyResponse tenancy) {
        Instant generationCutoff = Instant.now();
        Optional<BillingCycle> latestCycle = findLatestCycle(tenancy.id());
        if (latestCycle.isEmpty()) {
            log.warn(
                    "Monthly billing scheduler skipped tenancy without existing cycle tenancyId={} tenantUserId={}",
                    tenancy.id(),
                    tenancy.userId());
            return false;
        }

        BillingCycle latest = latestCycle.get();
        LocalDate nextPeriodStart = latest.getPeriodStartDate().plusMonths(1);
        int nextCycleNumber = latest.getCycleNumber() + 1;
        if (nextPeriodStart.isAfter(today)) {
            return false;
        }

        if (billingCycleRepository.existsByTenancyIdAndCycleNumber(tenancy.id(), nextCycleNumber)) {
            return false;
        }

        UserSummaryResponse tenant = authModule.findById(tenancy.userId())
                .orElseThrow(() -> new NotFoundException("User", tenancy.userId()));

        BillingCycle cycle = createCycleEntity(tenancy, tenant.fullName(), nextCycleNumber, nextPeriodStart);
        BillingCycle savedCycle = billingCycleRepository.save(cycle);

        createBaseLineItems(savedCycle, tenancy);
        attachPendingLineItems(savedCycle, generationCutoff);
        calculateCycle(savedCycle);
        lineItemRepository.flush();
        billingCycleRepository.saveAndFlush(savedCycle);
        publishBillingCycleGenerated(savedCycle);

        log.info(
                "Monthly billing cycle generated billingCycleId={} tenancyId={} cycleNumber={} periodStart={}",
                savedCycle.getId(),
                tenancy.id(),
                savedCycle.getCycleNumber(),
                savedCycle.getPeriodStartDate());

        return true;
    }

    /**
     * Marks unpaid cycles as overdue after their rent due date.
     */
    @Transactional
    public int markPastDueCycles(LocalDate today) {
        List<BillingCycle> cycles = billingCycleRepository.findPastDueCycles(
                BillingCycleStatus.UNPAID,
                today);

        int updatedCount = 0;
        for (BillingCycle cycle : cycles) {
            cycle.markOverdue(today);
            if (cycle.getStatus() == BillingCycleStatus.OVERDUE) {
                updatedCount = updatedCount + 1;
            }
        }

        log.info("Billing overdue marker checked={} updated={} today={}",
                cycles.size(),
                updatedCount,
                today);

        return updatedCount;
    }

    /**
     * Creates or updates one visible LATE_FEE line item per overdue cycle.
     */
    @Transactional
    public int recalculateLateFees(LocalDate today) {
        List<BillingCycle> cycles = billingCycleRepository.findCyclesEligibleForLateFee(
                List.of(BillingCycleStatus.UNPAID, BillingCycleStatus.OVERDUE),
                today);

        int updatedCount = 0;
        int skippedCount = 0;
        for (BillingCycle cycle : cycles) {
            if (applyLateFeeIfNeeded(cycle, today)) {
                updatedCount = updatedCount + 1;
            } else {
                skippedCount = skippedCount + 1;
            }
        }

        log.info("Billing late fee recalculation checked={} updated={} skipped={} today={}",
                cycles.size(),
                updatedCount,
                skippedCount,
                today);

        return updatedCount;
    }

    @Transactional(readOnly = true)
    public List<BillingCycleResponse> findCyclesDueTodayForReminders(LocalDate today) {
        return billingCycleRepository.findCyclesDueToday(
                List.of(BillingCycleStatus.UNPAID, BillingCycleStatus.OVERDUE),
                today)
                .stream()
                .map(cycle -> toResponse(cycle))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BillingCycleResponse> findCyclesDueBetweenForReminders(LocalDate startDate, LocalDate endDate) {
        return billingCycleRepository.findCyclesDueBetween(
                List.of(BillingCycleStatus.UNPAID, BillingCycleStatus.OVERDUE),
                startDate,
                endDate)
                .stream()
                .map(cycle -> toResponse(cycle))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BillingCycleResponse> findOverdueCyclesForReminders() {
        return billingCycleRepository.findOverdueCycles()
                .stream()
                .map(cycle -> toResponse(cycle))
                .toList();
    }

    private boolean applyLateFeeIfNeeded(BillingCycle cycle, LocalDate today) {
        if (cycle.isPaid() || cycle.isCancelled()) {
            return false;
        }

        cycle.markOverdue(today);
        long lateFeePerDayPaise = lateFeePerDayPaise(cycle.getPropertyId());
        long lateDays = ChronoUnit.DAYS.between(cycle.getRentDueDate(), today);
        if (lateDays <= 0) {
            return false;
        }

        long lateFeeAmountPaise = lateDays * lateFeePerDayPaise;
        List<BillingCycleLineItem> existingLateFeeLines = lineItemRepository.findByBillingCycleIdAndType(
                cycle.getId(),
                BillingCycleLineItemType.LATE_FEE);

        if (existingLateFeeLines.isEmpty()) {
            if (lateFeeAmountPaise <= 0) {
                return false;
            }

            BillingCycleLineItem lateFeeLine = BillingCycleLineItem.lateFee(
                    cycle,
                    "Late fee",
                    "Automatic late fee for overdue rent",
                    lateFeeAmountPaise,
                    nextDisplayOrder(cycle.getId()));
            lineItemRepository.save(lateFeeLine);
            calculateCycle(cycle);
            publishLateFeeApplied(cycle, lateFeeLine);
            return true;
        }

        BillingCycleLineItem lateFeeLine = existingLateFeeLines.get(0);
        if (lateFeeLine.getLastAdjustedByUserId() != null || !lateFeeLine.isSystemGenerated()) {
            log.debug("Late fee skipped because it was manually adjusted billingCycleId={} lineItemId={}",
                    cycle.getId(),
                    lateFeeLine.getId());
            return false;
        }

        if (lateFeeLine.getAmountPaise() == lateFeeAmountPaise) {
            return false;
        }

        lateFeeLine.replaceSystemLateFee(lateFeeAmountPaise);
        calculateCycle(cycle);
        publishLateFeeApplied(cycle, lateFeeLine);
        return true;
    }

    private long lateFeePerDayPaise(UUID propertyId) {
        PropertyBillingPolicyResponse billingPolicy = propertyModule.getBillingPolicy(propertyId);
        if (billingPolicy.rentLateFeePerDayPaise() == null) {
            return 0;
        }

        return billingPolicy.rentLateFeePerDayPaise();
    }

    private void publishBillingCycleGenerated(BillingCycle cycle) {
        eventPublisher.publishEvent(new BillingCycleGeneratedEvent(
                cycle.getId(),
                cycle.getTenancyId(),
                cycle.getTenantUserId(),
                cycle.getPropertyId(),
                cycle.getCycleNumber(),
                cycle.getRentDueDate(),
                cycle.getTotalAmountPaise()));
    }

    private void publishLateFeeApplied(BillingCycle cycle, BillingCycleLineItem lineItem) {
        eventPublisher.publishEvent(new BillingLateFeeAppliedEvent(
                cycle.getId(),
                lineItem.getId(),
                cycle.getTenancyId(),
                cycle.getTenantUserId(),
                cycle.getPropertyId(),
                lineItem.getAmountPaise()));
    }

    /**
     * Applies the owner/manager's final payable amount during exit approval.
     *
     * <p>
     * Paid cycles remain immutable. For unpaid cycles, the approved amount is
     * represented as an explicit adjustment line so the cycle total and its
     * visible breakdown stay in sync.
     */
    @Transactional
    public BillingCycleResponse applyExitApprovalTotal(
            UUID actorUserId,
            UUID tenancyId,
            Long approvedTotalAmountPaise) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

        BillingCycle cycle = getLatestCycle(tenancyId);
        if (approvedTotalAmountPaise == null) {
            return toResponse(cycle);
        }
        if (approvedTotalAmountPaise < 0) {
            throw new ValidationException("Approved billing amount cannot be negative");
        }

        if (cycle.isPaid()) {
            throw new ValidationException("Paid billing cycle total cannot be supplied during exit approval");
        }
        if (cycle.isCancelled()) {
            throw new ValidationException("Cancelled billing cycle cannot be edited during exit approval");
        }

        long currentTotalAmountPaise = cycle.getTotalAmountPaise();
        long differencePaise = approvedTotalAmountPaise - currentTotalAmountPaise;
        if (differencePaise == 0) {
            return toResponse(cycle);
        }

        BillingCycleLineItem lineItem;
        if (differencePaise > 0) {
            lineItem = BillingCycleLineItem.extraChargeAddedToBill(
                    cycle,
                    "Exit adjustment",
                    "Owner/manager final payable adjustment during tenancy exit",
                    differencePaise,
                    actorUserId,
                    nextDisplayOrder(cycle.getId()));
        } else {
            lineItem = BillingCycleLineItem.discount(
                    cycle,
                    "Exit adjustment",
                    "Owner/manager final payable reduction during tenancy exit",
                    Math.abs(differencePaise),
                    actorUserId,
                    nextDisplayOrder(cycle.getId()));
        }

        lineItemRepository.save(lineItem);
        calculateCycle(cycle);

        log.info(
                "Billing exit approval total applied billingCycleId={} tenancyId={} actorUserId={} approvedTotal={} previousTotal={}",
                cycle.getId(),
                tenancyId,
                actorUserId,
                approvedTotalAmountPaise,
                currentTotalAmountPaise);

        return toResponse(cycle);
    }

    /**
     * Builds a billing cycle shell for the supplied cycle number and period start.
     */
    private BillingCycle createCycleEntity(
            TenancyResponse tenancy,
            String tenantNameSnapshot,
            int cycleNumber,
            LocalDate periodStart) {
        if (tenancy.billingType() == TenancyBillingType.MONTHLY) {
            PropertyBillingPolicyResponse billingPolicy = propertyModule.getBillingPolicy(tenancy.propertyId());
            LocalDate periodEnd = periodStart.plusMonths(1).minusDays(1);
            LocalDate dueDate = calculateMonthlyDueDate(periodStart, billingPolicy.rentGraceDays());

            return BillingCycle.create(
                    tenancy.id(),
                    referenceCodeGenerator.nextCode("BIL"),
                    tenancy.userId(),
                    tenantNameSnapshot,
                    tenancy.propertyId(),
                    tenancy.roomId(),
                    tenancy.billingType(),
                    cycleNumber,
                    periodStart,
                    periodEnd,
                    dueDate,
                    BillingCollectionTiming.CYCLE_START,
                    billingPolicy.rentGraceDays());
        }

        LocalDate plannedEndDate = tenancy.plannedEndDate();
        if (plannedEndDate == null) {
            throw new ValidationException("Daily tenancy needs planned checkout date");
        }

        return BillingCycle.create(
                tenancy.id(),
                referenceCodeGenerator.nextCode("BIL"),
                tenancy.userId(),
                tenantNameSnapshot,
                tenancy.propertyId(),
                tenancy.roomId(),
                tenancy.billingType(),
                cycleNumber,
                tenancy.startDate(),
                plannedEndDate,
                plannedEndDate,
                BillingCollectionTiming.CYCLE_START,
                0);
    }

    /**
     * Creates system-generated line items that form the rent/stay payable amount.
     */
    private void createBaseLineItems(BillingCycle cycle, TenancyResponse tenancy) {
        if (tenancy.billingType() == TenancyBillingType.MONTHLY) {
            if (tenancy.rentAmountPaise() == null || tenancy.rentAmountPaise() <= 0) {
                throw new ValidationException("Monthly tenancy needs rent amount");
            }

            lineItemRepository.save(BillingCycleLineItem.systemCharge(
                    cycle,
                    BillingCycleLineItemType.RENT,
                    "Rent",
                    "Monthly rent",
                    tenancy.rentAmountPaise(),
                    1));

            if (cycle.getCycleNumber() == 1
                    && tenancy.depositAmountPaise() != null
                    && tenancy.depositAmountPaise() > 0) {
                lineItemRepository.save(BillingCycleLineItem.systemDepositCharge(
                        cycle,
                        "Deposit",
                        "Starting deposit",
                        tenancy.depositAmountPaise(),
                        2));
            }

            return;
        }

        if (tenancy.dailyRatePaise() == null || tenancy.dailyRatePaise() <= 0) {
            throw new ValidationException("Daily tenancy needs daily rate");
        }

        long stayDays = tenancy.startDate().datesUntil(tenancy.plannedEndDate().plusDays(1)).count();
        long dailyStayAmount = tenancy.dailyRatePaise() * stayDays;

        lineItemRepository.save(BillingCycleLineItem.systemCharge(
                cycle,
                BillingCycleLineItemType.DAILY_STAY,
                "Daily stay",
                "Daily guest stay charges",
                dailyStayAmount,
                1));
    }

    /**
     * Moves pending owner-created items into the newly generated cycle.
     */
    private void attachPendingLineItems(BillingCycle cycle, Instant generationCutoff) {
        List<BillingCycleLineItem> pendingItems = lineItemRepository.findPendingByTenancyIdBefore(
                cycle.getTenancyId(),
                BillingCycleLineItemStatus.PENDING,
                generationCutoff);

        int displayOrder = nextDisplayOrder(cycle.getId());
        for (BillingCycleLineItem pendingItem : pendingItems) {
            pendingItem.attachToCycle(cycle.getId(), displayOrder);
            if (pendingItem.getSettlementAction() == BillingLineSettlementAction.ADJUSTED_FROM_DEPOSIT) {
                depositManagerService.upsertBillingLineDeduction(
                        pendingItem.getCreatedByUserId(),
                        cycle.getTenancyId(),
                        cycle.getId(),
                        pendingItem.getId(),
                        pendingItem.getSettlementAmountPaise(),
                        pendingItem.getLabel());
            }
            displayOrder = displayOrder + 1;
        }
    }

    /**
     * Recomputes the cycle summary amounts from its line-item breakdown.
     */
    private void calculateCycle(BillingCycle cycle) {
        List<BillingCycleLineItem> lineItems = lineItemRepository.findByBillingCycleId(cycle.getId());

        long baseAmount = lineItems.stream()
                .filter(lineItem -> lineItem.contributesToBaseAmount())
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();
        
        long depositAmount = lineItems.stream()
                .filter(lineItem -> lineItem.contributesToBaseDeposit())
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();

        long extraAmount = lineItems.stream()
                .filter(lineItem -> lineItem.contributesToExtraAmount())
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();

        long lateFeeAmount = lineItems.stream()
                .filter(lineItem -> lineItem.contributesToLateFeeAmount())
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();

        long discountAmount = lineItems.stream()
                .filter(lineItem -> lineItem.contributesToDiscountAmount())
                .mapToLong(lineItem -> lineItem.getAmountPaise())
                .sum();

        cycle.recalculateTotals(baseAmount, depositAmount, extraAmount, lateFeeAmount, discountAmount);
    }

    /**
     * Recalculates only cycles that are still allowed to change.
     */
    private void refreshCycleTotalsIfMutable(BillingCycle cycle) {
        if (cycle.isPaid() || cycle.isCancelled()) {
            return;
        }

        calculateCycle(cycle);
    }

    /**
     * Loads a billing cycle and verifies the actor can manage its property.
     */
    private BillingCycle getManagedCycle(UUID actorUserId, UUID billingCycleId) {
        BillingCycle cycle = billingCycleRepository.findById(billingCycleId)
                .orElseThrow(() -> new NotFoundException("BillingCycle", billingCycleId));

        propertyModule.ensureCanManageProperty(actorUserId, cycle.getPropertyId());
        return cycle;
    }

    private BillingCycle getLatestCycle(UUID tenancyId) {
        return findLatestCycle(tenancyId)
                .orElseThrow(() -> new NotFoundException("BillingCycle", tenancyId));
    }

    private Optional<BillingCycle> findLatestCycle(UUID tenancyId) {
        return billingCycleRepository.findLatestByTenancyId(tenancyId, PageRequest.of(0, 1))
                .stream()
                .findFirst();
    }

    /**
     * Loads tenancy data through the tenancy module facade.
     */
    private TenancyResponse getTenancy(UUID tenancyId) {
        return tenancyModule.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
    }

    /**
     * Builds the API response with the current line-item breakdown.
     */
    private BillingCycleResponse toResponse(BillingCycle cycle) {
        List<BillingCycleLineItemResponse> lineItems = lineItemRepository.findByBillingCycleId(cycle.getId())
                .stream()
                .map(lineItem -> BillingCycleLineItemResponse.from(lineItem))
                .toList();

        return BillingCycleResponse.from(cycle, lineItems);
    }

    /**
     * Returns the next display order for appending a line item to a cycle.
     */
    private int nextDisplayOrder(UUID billingCycleId) {
        return lineItemRepository.findMaxDisplayOrder(billingCycleId) + 1;
    }

    /**
     * Converts the property's current billing policy into the cycle due date.
     */
    private LocalDate calculateMonthlyDueDate(LocalDate periodStartDate, int rentGraceDays) {
        if (rentGraceDays < 0 || rentGraceDays > 30) {
            throw new ValidationException("Rent grace days must be between 0 and 30");
        }

        return periodStartDate.plusDays(rentGraceDays);
    }

    /**
     * Normalizes optional descriptions before storing them on line items.
     */
}
