package com.khatiyan.d_modules.staff.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.employment.SalaryStructure;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.ManagerEmploymentResponse;
import com.khatiyan.d_modules.property.api.dto.ManagerPayrollView;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.staff.api.dto.CreateSalaryAdjustmentRequest;
import com.khatiyan.d_modules.staff.api.dto.RecordSalaryPaymentRequest;
import com.khatiyan.d_modules.staff.api.dto.SalaryAccountDetailResponse;
import com.khatiyan.d_modules.staff.api.dto.SalaryAccountResponse;
import com.khatiyan.d_modules.staff.api.dto.SalaryAdjustmentResponse;
import com.khatiyan.d_modules.staff.api.dto.SalaryHolderType;
import com.khatiyan.d_modules.staff.api.dto.SalaryMonthResponse;
import com.khatiyan.d_modules.staff.api.dto.SalaryPaymentDueItem;
import com.khatiyan.d_modules.staff.api.dto.SalaryPaymentResponse;
import com.khatiyan.d_modules.staff.api.dto.TerminationPreviewResponse;
import com.khatiyan.d_modules.staff.api.dto.UpdateSalaryAdjustmentRequest;
import com.khatiyan.d_modules.staff.model.SalaryAccount;
import com.khatiyan.d_modules.staff.model.SalaryAdjustment;
import com.khatiyan.d_modules.staff.model.SalaryAdjustmentType;
import com.khatiyan.d_modules.staff.model.SalaryMonth;
import com.khatiyan.d_modules.staff.model.SalaryPayment;
import com.khatiyan.d_modules.staff.model.SalaryPaymentMethod;
import com.khatiyan.d_modules.staff.model.StaffCategory;
import com.khatiyan.d_modules.staff.model.StaffMember;
import com.khatiyan.d_modules.staff.repository.SalaryAccountRepository;
import com.khatiyan.d_modules.staff.repository.SalaryAdjustmentRepository;
import com.khatiyan.d_modules.staff.repository.SalaryMonthRepository;
import com.khatiyan.d_modules.staff.repository.SalaryPaymentRepository;
import com.khatiyan.d_modules.staff.repository.StaffCategoryRepository;
import com.khatiyan.d_modules.staff.repository.StaffMemberRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Owner-only manual payroll tracker. It records salary facts but deliberately
 * never calls a payment provider or moves money.
 */
@Slf4j
@Service
public class SalaryAccountService {

    private final PropertyModule propertyModule;
    private final ReferenceCodeGenerator referenceCodeGenerator;
    private final SalaryAccountRepository salaryAccountRepository;
    private final SalaryMonthRepository salaryMonthRepository;
    private final SalaryAdjustmentRepository salaryAdjustmentRepository;
    private final SalaryPaymentRepository salaryPaymentRepository;
    private final StaffMemberRepository staffMemberRepository;
    private final StaffCategoryRepository staffCategoryRepository;

    public SalaryAccountService(
            PropertyModule propertyModule,
            ReferenceCodeGenerator referenceCodeGenerator,
            SalaryAccountRepository salaryAccountRepository,
            SalaryMonthRepository salaryMonthRepository,
            SalaryAdjustmentRepository salaryAdjustmentRepository,
            SalaryPaymentRepository salaryPaymentRepository,
            StaffMemberRepository staffMemberRepository,
            StaffCategoryRepository staffCategoryRepository) {
        this.propertyModule = propertyModule;
        this.referenceCodeGenerator = referenceCodeGenerator;
        this.salaryAccountRepository = salaryAccountRepository;
        this.salaryMonthRepository = salaryMonthRepository;
        this.salaryAdjustmentRepository = salaryAdjustmentRepository;
        this.salaryPaymentRepository = salaryPaymentRepository;
        this.staffMemberRepository = staffMemberRepository;
        this.staffCategoryRepository = staffCategoryRepository;
    }

    @Transactional(readOnly = true)
    public List<SalaryAccountResponse> listActiveAccounts(UUID actorUserId, UUID propertyId) {
        ensureOwner(actorUserId, propertyId);
        return salaryAccountRepository.findByPropertyIdAndActiveTrueOrderByCreatedAtDesc(propertyId)
                .stream()
                .map(this::toAccountResponse)
                .toList();
    }

    @Transactional
    public SalaryAccountDetailResponse openStaffAccount(UUID actorUserId, UUID propertyId, String staffReferenceCode) {
        ensureOwner(actorUserId, propertyId);
        StaffMember staffMember = staffMember(propertyId, staffReferenceCode);
        ensureMonthlySalaryStructure(staffMember.getSalaryStructure());
        ensurePayTermsConfigured(staffMember.getSalaryRatePaise(), staffMember.getEmploymentStartDate());
        SalaryAccount account = salaryAccountRepository.findByStaffMemberId(staffMember.getId())
                .orElseGet(() -> salaryAccountRepository.save(SalaryAccount.forStaffMember(
                        referenceCodeGenerator.nextCode("SAL"),
                        propertyId,
                        staffMember.getId(),
                        staffMember.getEmploymentStartDate())));
        return detail(account);
    }

    @Transactional
    public SalaryAccountDetailResponse openManagerAccount(UUID actorUserId, UUID propertyId, String managerReferenceCode) {
        ensureOwner(actorUserId, propertyId);
        ManagerEmploymentResponse manager = propertyModule.getManagerEmploymentByReference(propertyId, managerReferenceCode);
        ensureMonthlySalaryStructure(manager.salaryStructure());
        ensurePayTermsConfigured(manager.salaryRatePaise(), manager.employmentStartDate());
        SalaryAccount account = salaryAccountRepository.findByPropertyManagerId(manager.id())
                .orElseGet(() -> salaryAccountRepository.save(SalaryAccount.forManager(
                        referenceCodeGenerator.nextCode("SAL"),
                        propertyId,
                        manager.id(),
                        manager.employmentStartDate())));
        return detail(account);
    }

    @Transactional(readOnly = true)
    public SalaryAccountDetailResponse getAccount(UUID actorUserId, UUID propertyId, String accountReferenceCode) {
        ensureOwner(actorUserId, propertyId);
        return detail(account(propertyId, accountReferenceCode));
    }

    /** A manager's own salary account (read-only). Throws if the actor is not a
     * manager, or if no account has been opened for them yet. */
    @Transactional(readOnly = true)
    public SalaryAccountDetailResponse getMyAccount(UUID actorUserId, UUID propertyId) {
        ManagerEmploymentResponse manager = propertyModule.getManagerEmploymentByUser(propertyId, actorUserId);
        SalaryAccount account = salaryAccountRepository.findByPropertyManagerId(manager.id())
                .orElseThrow(() -> new NotFoundException("SalaryAccount", manager.referenceCode()));
        return detail(account);
    }

    // --- Settlement, used by the end-employment flow. ---

    @Transactional(readOnly = true)
    public TerminationPreviewResponse staffTerminationPreview(UUID staffMemberId) {
        return preview(salaryAccountRepository.findByStaffMemberId(staffMemberId).orElse(null));
    }

    @Transactional(readOnly = true)
    public TerminationPreviewResponse managerTerminationPreview(UUID propertyManagerId) {
        return preview(salaryAccountRepository.findByPropertyManagerId(propertyManagerId).orElse(null));
    }

    private TerminationPreviewResponse preview(SalaryAccount account) {
        if (account == null) {
            return new TerminationPreviewResponse(false, 0, 0, 0);
        }
        List<SalaryMonth> months = salaryMonthRepository.findBySalaryAccountIdOrderByPayrollMonthDesc(account.getId());
        long net = months.stream().mapToLong(SalaryMonth::getNetAmountPaise).sum();
        long gross = months.stream().mapToLong(SalaryMonth::getGrossAmountPaise).sum();
        long paid = months.stream().mapToLong(SalaryMonth::getPaidAmountPaise).sum();
        return new TerminationPreviewResponse(true, Math.max(0, net - paid), gross, paid);
    }

    /** Settles a staff member's salary account: clears every unpaid month and
     * records the additional final amount, then marks the account settled. */
    @Transactional
    public void settleStaffAccount(UUID staffMemberId, long additionalAmountPaise, SalaryPaymentMethod method, LocalDate paidOn, String notes, UUID actorUserId) {
        salaryAccountRepository.findByStaffMemberId(staffMemberId)
                .ifPresent(account -> settle(account, additionalAmountPaise, method, paidOn, notes, actorUserId));
    }

    @Transactional
    public void settleManagerAccount(UUID propertyManagerId, long additionalAmountPaise, SalaryPaymentMethod method, LocalDate paidOn, String notes, UUID actorUserId) {
        salaryAccountRepository.findByPropertyManagerId(propertyManagerId)
                .ifPresent(account -> settle(account, additionalAmountPaise, method, paidOn, notes, actorUserId));
    }

    private void settle(SalaryAccount account, long additionalAmountPaise, SalaryPaymentMethod method, LocalDate paidOn, String notes, UUID actorUserId) {
        LocalDate effectivePaidOn = paidOn != null ? paidOn : LocalDate.now();
        List<SalaryMonth> months = salaryMonthRepository.findBySalaryAccountIdOrderByPayrollMonthDesc(account.getId());
        for (SalaryMonth month : months) {
            long remaining = month.getNetAmountPaise() - month.getPaidAmountPaise();
            if (remaining > 0) {
                if (method == null) {
                    throw new ValidationException("Choose a payment method to settle the outstanding salary");
                }
                salaryPaymentRepository.save(SalaryPayment.record(
                        month.getId(), remaining, effectivePaidOn, method, "Final settlement", optionalText(notes), actorUserId));
                recalculate(month);
            }
        }
        if (additionalAmountPaise > 0 && method == null) {
            throw new ValidationException("Choose a payment method for the additional settlement amount");
        }
        account.settle(LocalDate.now(), additionalAmountPaise);
    }

    @Transactional(readOnly = true)
    public Optional<SettledAccountSummary> staffAccountSummary(UUID staffMemberId) {
        return salaryAccountRepository.findByStaffMemberId(staffMemberId).map(this::summarize);
    }

    @Transactional(readOnly = true)
    public Optional<SettledAccountSummary> managerAccountSummary(UUID propertyManagerId) {
        return salaryAccountRepository.findByPropertyManagerId(propertyManagerId).map(this::summarize);
    }

    private SettledAccountSummary summarize(SalaryAccount account) {
        long paid = salaryMonthRepository.findBySalaryAccountIdOrderByPayrollMonthDesc(account.getId())
                .stream().mapToLong(SalaryMonth::getPaidAmountPaise).sum();
        return new SettledAccountSummary(account.getSettledOn(), account.getSettlementAmountPaise(), paid);
    }

    public record SettledAccountSummary(LocalDate settledOn, long settlementAmountPaise, long totalPaidPaise) {
    }

    // --- Scheduled jobs: monthly salary-month roll-over + payment reminders. ---

    /**
     * Keeps monthly payroll current for every active monthly employee. For each
     * active monthly manager / staff member it opens a salary account if one does
     * not exist yet, then opens the current payroll month if it is missing. Runs
     * daily, so a manager or staff member who joins mid-month gets an account and
     * the current month the next day, and everyone rolls into the new month on the
     * 1st. Daily-wage employees are paid per working day and are skipped.
     * Idempotent: re-running once the account + month exist is a no-op.
     */
    @Transactional
    public int openDueSalaryMonths(LocalDate today) {
        LocalDate currentMonth = YearMonth.from(today).atDay(1);
        int opened = 0;

        for (StaffMember member : staffMemberRepository.findByActiveTrue()) {
            if (!isPayrollEligible(member.getSalaryStructure(), member.getSalaryRatePaise(), member.getEmploymentStartDate())) {
                continue;
            }
            SalaryAccount account = salaryAccountRepository.findByStaffMemberId(member.getId())
                    .orElseGet(() -> salaryAccountRepository.save(SalaryAccount.forStaffMember(
                            referenceCodeGenerator.nextCode("SAL"),
                            member.getPropertyId(),
                            member.getId(),
                            member.getEmploymentStartDate())));
            opened += openMonthIfDue(account, member.getSalaryRatePaise(),
                    member.getEmploymentStartDate(), member.getEmploymentEndDate(), currentMonth, today);
        }

        for (ManagerPayrollView manager : propertyModule.listActiveManagerPayroll()) {
            if (!isPayrollEligible(manager.salaryStructure(), manager.salaryRatePaise(), manager.employmentStartDate())) {
                continue;
            }
            SalaryAccount account = salaryAccountRepository.findByPropertyManagerId(manager.id())
                    .orElseGet(() -> salaryAccountRepository.save(SalaryAccount.forManager(
                            referenceCodeGenerator.nextCode("SAL"),
                            manager.propertyId(),
                            manager.id(),
                            manager.employmentStartDate())));
            opened += openMonthIfDue(account, manager.salaryRatePaise(),
                    manager.employmentStartDate(), manager.employmentEndDate(), currentMonth, today);
        }

        return opened;
    }

    private static boolean isPayrollEligible(SalaryStructure salaryStructure, long salaryRatePaise, LocalDate employmentStartDate) {
        return salaryStructure == SalaryStructure.MONTHLY && salaryRatePaise > 0 && employmentStartDate != null;
    }

    /** Opens the current payroll month for an active, un-settled account when it
     * is within the employment window and not already present. Returns 1 if a
     * month was opened, else 0. */
    private int openMonthIfDue(SalaryAccount account, long salaryRatePaise,
            LocalDate employmentStartDate, LocalDate employmentEndDate, LocalDate currentMonth, LocalDate openedOn) {
        if (!account.isActive() || account.getSettledOn() != null) {
            return 0;
        }
        if (employmentStartDate != null
                && currentMonth.isBefore(YearMonth.from(employmentStartDate).atDay(1))) {
            return 0;
        }
        if (employmentEndDate != null
                && currentMonth.isAfter(YearMonth.from(employmentEndDate).atDay(1))) {
            return 0;
        }
        if (salaryMonthRepository.findBySalaryAccountIdAndPayrollMonth(account.getId(), currentMonth).isPresent()) {
            return 0;
        }
        salaryMonthRepository.save(SalaryMonth.open(
                account.getId(),
                currentMonth,
                openedOn,
                SalaryStructure.MONTHLY,
                salaryRatePaise,
                null,
                salaryRatePaise));
        log.info("Auto-opened salary month salaryAccountReferenceCode={} payrollMonth={} openedOn={}",
                account.getReferenceCode(), currentMonth, openedOn);
        return 1;
    }

    /**
     * Active monthly accounts whose current-month salary is still unpaid, for the
     * end-of-month payment reminder.
     */
    @Transactional(readOnly = true)
    public List<SalaryPaymentDueItem> listSalaryPaymentDue(LocalDate today) {
        LocalDate currentMonth = YearMonth.from(today).atDay(1);
        List<SalaryPaymentDueItem> due = new ArrayList<>();
        for (SalaryAccount account : salaryAccountRepository.findByActiveTrueAndSettledOnIsNull()) {
            SalaryMonth month = salaryMonthRepository
                    .findBySalaryAccountIdAndPayrollMonth(account.getId(), currentMonth)
                    .orElse(null);
            if (month == null) {
                continue;
            }
            long outstanding = month.getNetAmountPaise() - month.getPaidAmountPaise();
            if (outstanding <= 0) {
                continue;
            }
            HolderTerms terms = holderTermsOrNull(account);
            if (terms == null) {
                continue;
            }
            due.add(new SalaryPaymentDueItem(
                    account.getPropertyId(),
                    account.getId(),
                    account.getReferenceCode(),
                    terms.fullName(),
                    currentMonth,
                    outstanding));
        }
        return due;
    }

    /** Holder terms, or {@code null} if the underlying holder no longer exists. */
    private HolderTerms holderTermsOrNull(SalaryAccount account) {
        try {
            return holderTerms(account);
        } catch (NotFoundException exception) {
            log.warn("Skipping salary account with missing holder salaryAccountReferenceCode={}", account.getReferenceCode());
            return null;
        }
    }

    @Transactional
    public SalaryAccountDetailResponse openSalaryMonth(
            UUID actorUserId,
            UUID propertyId,
            String accountReferenceCode) {
        ensureOwner(actorUserId, propertyId);
        SalaryAccount account = account(propertyId, accountReferenceCode);
        // Manual opens always target the current month and record today as the
        // opening day, mirroring the scheduler (which opens a month on the day it
        // first becomes due). A future payroll policy can prorate using opened_on.
        LocalDate today = LocalDate.now();
        LocalDate payrollMonth = YearMonth.from(today).atDay(1);
        if (salaryMonthRepository.findBySalaryAccountIdAndPayrollMonth(account.getId(), payrollMonth).isPresent()) {
            return detail(account);
        }

        HolderTerms holderTerms = holderTerms(account);
        validatePayrollMonth(holderTerms, payrollMonth);
        SalaryMonth month = SalaryMonth.open(
                account.getId(),
                payrollMonth,
                today,
                holderTerms.salaryStructure(),
                holderTerms.salaryRatePaise(),
                null,
                holderTerms.salaryRatePaise());
        salaryMonthRepository.save(month);
        log.info("Salary month opened salaryAccountReferenceCode={} payrollMonth={} openedOn={} actorUserId={}",
                accountReferenceCode, payrollMonth, today, actorUserId);
        return detail(account);
    }

    @Transactional
    public SalaryAccountDetailResponse addAdjustment(
            UUID actorUserId,
            UUID propertyId,
            String accountReferenceCode,
            LocalDate payrollMonth,
            CreateSalaryAdjustmentRequest request) {
        SalaryAccount account = ownedAccount(actorUserId, propertyId, accountReferenceCode);
        SalaryMonth month = salaryMonth(account, normalizeMonth(payrollMonth));
        ensureUnpaidForAdjustment(month);
        salaryAdjustmentRepository.save(SalaryAdjustment.create(
                month.getId(), request.adjustmentType(), request.amountPaise(), request.reason().trim(), actorUserId));
        recalculate(month);
        return detail(account);
    }

    @Transactional
    public SalaryAccountDetailResponse updateAdjustment(
            UUID actorUserId,
            UUID propertyId,
            String accountReferenceCode,
            LocalDate payrollMonth,
            UUID adjustmentId,
            UpdateSalaryAdjustmentRequest request) {
        SalaryAccount account = ownedAccount(actorUserId, propertyId, accountReferenceCode);
        SalaryMonth month = salaryMonth(account, normalizeMonth(payrollMonth));
        ensureUnpaidForAdjustment(month);
        SalaryAdjustment adjustment = salaryAdjustmentRepository.findById(adjustmentId)
                .filter(item -> item.getSalaryMonthId().equals(month.getId()))
                .orElseThrow(() -> new NotFoundException("SalaryAdjustment", adjustmentId));
        adjustment.amend(request.adjustmentType(), request.amountPaise(), request.reason().trim());
        recalculate(month);
        return detail(account);
    }

    @Transactional
    public SalaryAccountDetailResponse removeAdjustment(
            UUID actorUserId,
            UUID propertyId,
            String accountReferenceCode,
            LocalDate payrollMonth,
            UUID adjustmentId) {
        SalaryAccount account = ownedAccount(actorUserId, propertyId, accountReferenceCode);
        SalaryMonth month = salaryMonth(account, normalizeMonth(payrollMonth));
        ensureUnpaidForAdjustment(month);
        SalaryAdjustment adjustment = salaryAdjustmentRepository.findById(adjustmentId)
                .filter(item -> item.getSalaryMonthId().equals(month.getId()))
                .orElseThrow(() -> new NotFoundException("SalaryAdjustment", adjustmentId));
        salaryAdjustmentRepository.delete(adjustment);
        recalculate(month);
        return detail(account);
    }

    @Transactional
    public SalaryAccountDetailResponse recordManualPayment(
            UUID actorUserId,
            UUID propertyId,
            String accountReferenceCode,
            LocalDate payrollMonth,
            RecordSalaryPaymentRequest request) {
        SalaryAccount account = ownedAccount(actorUserId, propertyId, accountReferenceCode);
        SalaryMonth month = salaryMonth(account, normalizeMonth(payrollMonth));
        long alreadyPaid = month.getPaidAmountPaise();
        if (alreadyPaid + request.amountPaise() > month.getNetAmountPaise()) {
            throw new ValidationException("Recorded salary payment cannot exceed the remaining payable amount");
        }
        salaryPaymentRepository.save(SalaryPayment.record(
                month.getId(),
                request.amountPaise(),
                request.paidOn(),
                request.paymentMethod(),
                optionalText(request.referenceText()),
                optionalText(request.notes()),
                actorUserId));
        recalculate(month);
        return detail(account);
    }

    private SalaryAccount ownedAccount(UUID actorUserId, UUID propertyId, String accountReferenceCode) {
        ensureOwner(actorUserId, propertyId);
        return account(propertyId, accountReferenceCode);
    }

    private SalaryAccount account(UUID propertyId, String accountReferenceCode) {
        return salaryAccountRepository.findByReferenceCodeAndPropertyId(accountReferenceCode, propertyId)
                .orElseThrow(() -> new NotFoundException("SalaryAccount", accountReferenceCode));
    }

    private SalaryMonth salaryMonth(SalaryAccount account, LocalDate payrollMonth) {
        return salaryMonthRepository.findBySalaryAccountIdAndPayrollMonth(account.getId(), payrollMonth)
                .orElseThrow(() -> new NotFoundException("SalaryMonth", payrollMonth));
    }

    private SalaryAccountDetailResponse detail(SalaryAccount account) {
        List<SalaryMonth> months = salaryMonthRepository.findBySalaryAccountIdOrderByPayrollMonthDesc(account.getId());
        SalaryAccountResponse accountResponse = toAccountResponse(account, months);
        List<SalaryMonthResponse> monthResponses = months.stream().map(this::toMonthResponse).toList();
        return new SalaryAccountDetailResponse(accountResponse, monthResponses);
    }

    private SalaryAccountResponse toAccountResponse(SalaryAccount account) {
        return toAccountResponse(account, salaryMonthRepository.findBySalaryAccountIdOrderByPayrollMonthDesc(account.getId()));
    }

    private SalaryAccountResponse toAccountResponse(SalaryAccount account, List<SalaryMonth> months) {
        HolderTerms holderTerms = holderTerms(account);
        long gross = months.stream().mapToLong(SalaryMonth::getGrossAmountPaise).sum();
        long net = months.stream().mapToLong(SalaryMonth::getNetAmountPaise).sum();
        long paid = months.stream().mapToLong(SalaryMonth::getPaidAmountPaise).sum();
        return SalaryAccountResponse.from(
                account,
                holderTerms.holderType(),
                holderTerms.referenceCode(),
                holderTerms.fullName(),
                holderTerms.categoryName(),
                holderTerms.salaryStructure(),
                holderTerms.salaryRatePaise(),
                gross,
                net,
                paid);
    }

    private SalaryMonthResponse toMonthResponse(SalaryMonth month) {
        List<SalaryAdjustmentResponse> adjustments = salaryAdjustmentRepository.findBySalaryMonthIdOrderByCreatedAtAsc(month.getId())
                .stream()
                .map(SalaryAdjustmentResponse::from)
                .toList();
        List<SalaryPaymentResponse> payments = salaryPaymentRepository.findBySalaryMonthIdOrderByPaidOnDesc(month.getId())
                .stream()
                .map(SalaryPaymentResponse::from)
                .toList();
        return SalaryMonthResponse.from(month, adjustments, payments);
    }

    private HolderTerms holderTerms(SalaryAccount account) {
        if (account.getStaffMemberId() != null) {
            StaffMember member = staffMemberRepository.findById(account.getStaffMemberId())
                    .orElseThrow(() -> new NotFoundException("StaffMember", account.getStaffMemberId()));
            String categoryName = staffCategoryRepository.findById(member.getCategoryId())
                    .map(StaffCategory::getName)
                    .orElse("Former category");
            return new HolderTerms(
                    SalaryHolderType.STAFF_MEMBER,
                    member.getReferenceCode(),
                    member.getFullName(),
                    categoryName,
                    member.getSalaryStructure(),
                    member.getSalaryRatePaise(),
                    member.getEmploymentStartDate(),
                    member.getEmploymentEndDate());
        }
        ManagerEmploymentResponse manager = propertyModule.getManagerEmploymentById(account.getPropertyManagerId());
        return new HolderTerms(
                SalaryHolderType.MANAGER,
                manager.referenceCode(),
                manager.fullName(),
                "Managers",
                manager.salaryStructure(),
                manager.salaryRatePaise(),
                manager.employmentStartDate(),
                manager.employmentEndDate());
    }

    private StaffMember staffMember(UUID propertyId, String referenceCode) {
        return staffMemberRepository.findByPropertyIdOrderByFullNameAsc(propertyId)
                .stream()
                .filter(member -> member.getReferenceCode().equalsIgnoreCase(referenceCode))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("StaffMember", referenceCode));
    }

    private void recalculate(SalaryMonth month) {
        List<SalaryAdjustment> adjustments = salaryAdjustmentRepository.findBySalaryMonthIdOrderByCreatedAtAsc(month.getId());
        long additions = adjustments.stream()
                .filter(item -> item.getAdjustmentType() == SalaryAdjustmentType.ADDITION)
                .mapToLong(SalaryAdjustment::getAmountPaise)
                .sum();
        long deductions = adjustments.stream()
                .filter(item -> item.getAdjustmentType() == SalaryAdjustmentType.DEDUCTION)
                .mapToLong(SalaryAdjustment::getAmountPaise)
                .sum();
        long paid = salaryPaymentRepository.findBySalaryMonthIdOrderByPaidOnDesc(month.getId())
                .stream()
                .mapToLong(SalaryPayment::getAmountPaise)
                .sum();
        try {
            month.recalculate(additions, deductions, paid);
        } catch (IllegalArgumentException exception) {
            throw new ValidationException(exception.getMessage());
        }
    }

    private void ensureUnpaidForAdjustment(SalaryMonth month) {
        if (month.getPaidAmountPaise() > 0) {
            throw new ValidationException("Salary adjustments cannot be changed after a manual payment is recorded");
        }
    }

    private void ensureOwner(UUID actorUserId, UUID propertyId) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        if (!property.ownerId().equals(actorUserId)) {
            throw new ForbiddenException("Only the property owner can manage salary records");
        }
    }

    private static void ensurePayTermsConfigured(long salaryRatePaise, LocalDate employmentStartDate) {
        if (salaryRatePaise <= 0 || employmentStartDate == null) {
            throw new ValidationException("Set the worker's salary rate and employment start date before opening a salary account");
        }
    }

    private static void ensureMonthlySalaryStructure(SalaryStructure salaryStructure) {
        if (salaryStructure == SalaryStructure.DAILY) {
            throw new ValidationException("Daily-wage employees are paid per working day and do not use a salary account");
        }
    }

    private static LocalDate normalizeMonth(LocalDate date) {
        return YearMonth.from(date).atDay(1);
    }


    private static void validatePayrollMonth(HolderTerms holderTerms, LocalDate payrollMonth) {
        YearMonth requested = YearMonth.from(payrollMonth);
        if (requested.isBefore(YearMonth.from(holderTerms.employmentStartDate()))) {
            throw new ValidationException("Salary month cannot be before the employment start month");
        }
        if (holderTerms.employmentEndDate() != null
                && requested.isAfter(YearMonth.from(holderTerms.employmentEndDate()))) {
            throw new ValidationException("Salary month cannot be after the employment end month");
        }
    }

    private static String optionalText(String value) {
        return value == null ? "" : value.trim();
    }

    private record HolderTerms(
            SalaryHolderType holderType,
            String referenceCode,
            String fullName,
            String categoryName,
            SalaryStructure salaryStructure,
            long salaryRatePaise,
            LocalDate employmentStartDate,
            LocalDate employmentEndDate) {
    }
}
