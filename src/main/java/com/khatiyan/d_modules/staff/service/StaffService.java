package com.khatiyan.d_modules.staff.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.employment.IdentityVerificationStatus;
import com.khatiyan.c_shared.employment.ManagerEmploymentDetails;
import com.khatiyan.c_shared.employment.SalaryStructure;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.ManagerEmploymentResponse;
import com.khatiyan.d_modules.property.api.dto.ManagerPayrollView;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.staff.api.dto.CreateStaffCategoryRequest;
import com.khatiyan.d_modules.staff.api.dto.CreateStaffMemberRequest;
import com.khatiyan.d_modules.staff.api.dto.EmployeeActivityItem;
import com.khatiyan.d_modules.staff.api.dto.EmployeeActivityType;
import com.khatiyan.d_modules.staff.api.dto.EmployeeHistoryResponse;
import com.khatiyan.d_modules.staff.api.dto.EndEmploymentRequest;
import com.khatiyan.d_modules.staff.api.dto.SalaryHolderType;
import com.khatiyan.d_modules.staff.api.dto.SalaryPaymentDueItem;
import com.khatiyan.d_modules.staff.api.dto.StaffCategoryResponse;
import com.khatiyan.d_modules.staff.api.dto.StaffMemberResponse;
import com.khatiyan.d_modules.staff.api.dto.StaffMemberSummary;
import com.khatiyan.d_modules.staff.api.dto.TerminationPreviewResponse;
import com.khatiyan.d_modules.staff.api.dto.UpdateManagerEmploymentRequest;
import com.khatiyan.d_modules.staff.api.dto.UpdateStaffCategoryRequest;
import com.khatiyan.d_modules.staff.api.dto.UpdateStaffMemberRequest;
import com.khatiyan.d_modules.staff.event.StaffMemberAddedEvent;
import com.khatiyan.d_modules.staff.event.StaffMemberEndedEvent;
import com.khatiyan.d_modules.staff.model.StaffCategory;
import com.khatiyan.d_modules.staff.model.StaffCategoryType;
import com.khatiyan.d_modules.staff.model.StaffMember;
import com.khatiyan.d_modules.staff.repository.StaffCategoryRepository;
import com.khatiyan.d_modules.staff.repository.StaffMemberRepository;

import lombok.extern.slf4j.Slf4j;

/** Owner-only personnel directory for manager employment data and non-user staff. */
@Slf4j
@Service
public class StaffService {

    private final PropertyModule propertyModule;
    private final SalaryAccountService salaryAccountService;
    private final ReferenceCodeGenerator referenceCodeGenerator;
    private final StaffCategoryRepository staffCategoryRepository;
    private final StaffMemberRepository staffMemberRepository;
    private final ApplicationEventPublisher eventPublisher;

    public StaffService(
            PropertyModule propertyModule,
            SalaryAccountService salaryAccountService,
            ReferenceCodeGenerator referenceCodeGenerator,
            StaffCategoryRepository staffCategoryRepository,
            StaffMemberRepository staffMemberRepository,
            ApplicationEventPublisher eventPublisher) {
        this.propertyModule = propertyModule;
        this.salaryAccountService = salaryAccountService;
        this.referenceCodeGenerator = referenceCodeGenerator;
        this.staffCategoryRepository = staffCategoryRepository;
        this.staffMemberRepository = staffMemberRepository;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Projected total salary payout for a property in the given month — the same
     * figure shown in the "Est payout" card: monthly holders contribute their
     * monthly rate, daily holders contribute rate × days-in-month. Read by the
     * expense tracker, which treats salary as a derived (not stored) expense.
     */
    @Transactional(readOnly = true)
    public long estimatedMonthlySalaryPaise(UUID propertyId, LocalDate month) {
        int daysInMonth = YearMonth.from(month).lengthOfMonth();
        long total = 0;
        for (StaffMember member : staffMemberRepository.findByPropertyIdAndActiveTrueOrderByFullNameAsc(propertyId)) {
            total += projectedSalaryPaise(member.getSalaryStructure(), member.getSalaryRatePaise(), daysInMonth);
        }
        for (ManagerPayrollView manager : propertyModule.listActiveManagerPayroll()) {
            if (manager.propertyId().equals(propertyId)) {
                total += projectedSalaryPaise(manager.salaryStructure(), manager.salaryRatePaise(), daysInMonth);
            }
        }
        return total;
    }

    private static long projectedSalaryPaise(SalaryStructure structure, long ratePaise, int daysInMonth) {
        return structure == SalaryStructure.MONTHLY ? ratePaise : Math.multiplyExact(ratePaise, daysInMonth);
    }

    @Transactional
    public List<StaffCategoryResponse> listCategories(UUID actorUserId, UUID propertyId) {
        ensureOwner(actorUserId, propertyId);
        ensureSystemCategories(propertyId);
        return staffCategoryRepository.findByPropertyIdAndActiveTrueOrderByNameAsc(propertyId)
                .stream()
                .map(StaffCategoryResponse::from)
                .toList();
    }

    @Transactional
    public StaffCategoryResponse createCategory(UUID actorUserId, UUID propertyId, CreateStaffCategoryRequest request) {
        ensureOwner(actorUserId, propertyId);
        String name = requiredText(request.name(), "Category name");
        String normalizedName = name.toLowerCase(java.util.Locale.ROOT);
        if (staffCategoryRepository.existsByPropertyIdAndNormalizedName(propertyId, normalizedName)) {
            throw new ValidationException("A staff category with this name already exists");
        }
        StaffCategory category = staffCategoryRepository.save(StaffCategory.custom(propertyId, name));
        return StaffCategoryResponse.from(category);
    }

    @Transactional
    public StaffCategoryResponse updateCategory(
            UUID actorUserId,
            UUID propertyId,
            UUID categoryId,
            UpdateStaffCategoryRequest request) {
        ensureOwner(actorUserId, propertyId);
        StaffCategory category = category(categoryId, propertyId);
        String name = requiredText(request.name(), "Category name");
        String normalizedName = name.toLowerCase(java.util.Locale.ROOT);
        if (!normalizedName.equals(category.getNormalizedName())
                && staffCategoryRepository.existsByPropertyIdAndNormalizedName(propertyId, normalizedName)) {
            throw new ValidationException("A staff category with this name already exists");
        }
        category.rename(name);
        return StaffCategoryResponse.from(category);
    }

    @Transactional
    public void deactivateCategory(UUID actorUserId, UUID propertyId, UUID categoryId) {
        ensureOwner(actorUserId, propertyId);
        StaffCategory category = category(categoryId, propertyId);
        if (category.isSystem()) {
            throw new ValidationException("Built-in categories cannot be deleted");
        }
        boolean hasMembers = staffMemberRepository.findByPropertyIdOrderByFullNameAsc(propertyId)
                .stream()
                .anyMatch(member -> member.getCategoryId().equals(categoryId));
        if (hasMembers) {
            throw new ValidationException("A category with staff records cannot be deleted");
        }
        category.deactivate();
    }

    @Transactional(readOnly = true)
    public List<StaffMemberResponse> listMembers(UUID actorUserId, UUID propertyId, boolean includeInactive) {
        ensureOwner(actorUserId, propertyId);
        Map<UUID, String> categoryNames = staffCategoryRepository.findByPropertyIdAndActiveTrueOrderByNameAsc(propertyId)
                .stream()
                .collect(Collectors.toMap(StaffCategory::getId, StaffCategory::getName));
        List<StaffMember> members = includeInactive
                ? staffMemberRepository.findByPropertyIdOrderByFullNameAsc(propertyId)
                : staffMemberRepository.findByPropertyIdAndActiveTrueOrderByFullNameAsc(propertyId);
        return members.stream()
                .map(member -> StaffMemberResponse.from(member, categoryNames.getOrDefault(member.getCategoryId(), "Former category"), age(member.getDateOfBirth())))
                .toList();
    }

    @Transactional
    public StaffMemberResponse createMember(UUID actorUserId, UUID propertyId, CreateStaffMemberRequest request) {
        ensureOwner(actorUserId, propertyId);
        StaffCategory category = activeCategory(request.categoryId(), propertyId);
        validateEmploymentDates(request.employmentStartDate(), request.employmentEndDate());

        StaffMember member = StaffMember.create(
                referenceCodeGenerator.nextCode("STF"),
                propertyId,
                category.getId(),
                requiredText(request.fullName(), "Staff member name"),
                request.dateOfBirth(),
                request.salaryStructure(),
                request.salaryRatePaise(),
                optionalText(request.benefitsSummary()),
                request.employmentStartDate(),
                request.employmentEndDate(),
                optionalText(request.employmentNotes()));
        StaffMember saved = staffMemberRepository.save(member);
        log.info("Staff member created propertyId={} staffReferenceCode={} actorUserId={}",
                propertyId, saved.getReferenceCode(), actorUserId);
        eventPublisher.publishEvent(new StaffMemberAddedEvent(propertyId, saved.getFullName(), category.getName(), actorUserId));
        return StaffMemberResponse.from(saved, category.getName(), age(saved.getDateOfBirth()));
    }

    @Transactional
    public StaffMemberResponse updateMember(
            UUID actorUserId,
            UUID propertyId,
            String staffReferenceCode,
            UpdateStaffMemberRequest request) {
        ensureOwner(actorUserId, propertyId);
        StaffMember member = member(staffReferenceCode, propertyId);
        StaffCategory category = activeCategory(request.categoryId(), propertyId);
        validateEmploymentDates(request.employmentStartDate(), request.employmentEndDate());

        member.updateDetails(
                category.getId(),
                requiredText(request.fullName(), "Staff member name"),
                request.dateOfBirth(),
                request.salaryStructure(),
                request.salaryRatePaise(),
                optionalText(request.benefitsSummary()),
                request.employmentStartDate(),
                request.employmentEndDate(),
                optionalText(request.employmentNotes()));
        member.updateVerification(request.identityVerificationStatus(), verifiedAt(request.identityVerificationStatus()));
        return StaffMemberResponse.from(member, category.getName(), age(member.getDateOfBirth()));
    }

    @Transactional(readOnly = true)
    public TerminationPreviewResponse staffTerminationPreview(UUID actorUserId, UUID propertyId, String staffReferenceCode) {
        ensureOwner(actorUserId, propertyId);
        StaffMember member = member(staffReferenceCode, propertyId);
        return salaryAccountService.staffTerminationPreview(member.getId());
    }

    /** Ends a staff member's employment with a full-and-final settlement, all in
     * one transaction — any settlement failure rolls back the whole end. */
    @Transactional
    public void endStaffMember(UUID actorUserId, UUID propertyId, String staffReferenceCode, EndEmploymentRequest request) {
        ensureOwner(actorUserId, propertyId);
        StaffMember member = member(staffReferenceCode, propertyId);
        String reason = requiredText(request.reason(), "Exit reason");
        salaryAccountService.settleStaffAccount(
                member.getId(),
                request.additionalAmountPaise(),
                request.paymentMethod(),
                request.paidOn(),
                request.settlementNotes(),
                actorUserId);
        member.deactivate(java.time.LocalDate.now(), reason, optionalText(request.review()));
        log.info("Staff member employment ended propertyId={} staffReferenceCode={} actorUserId={}",
                propertyId, staffReferenceCode, actorUserId);
        eventPublisher.publishEvent(new StaffMemberEndedEvent(propertyId, member.getFullName(), categoryName(member.getCategoryId()), actorUserId));
    }

    private String categoryName(UUID categoryId) {
        return staffCategoryRepository.findById(categoryId).map(StaffCategory::getName).orElse("Staff");
    }

    /**
     * Employee lifecycle (added / removed) for the dashboard recent-activity
     * feed, derived from current state. Access is already checked by the
     * dashboard, so this method does not re-check ownership.
     */
    @Transactional(readOnly = true)
    public List<EmployeeActivityItem> listRecentEmployeeActivity(UUID propertyId) {
        Map<UUID, String> categoryNames = staffCategoryRepository.findByPropertyIdAndActiveTrueOrderByNameAsc(propertyId)
                .stream()
                .collect(Collectors.toMap(StaffCategory::getId, StaffCategory::getName));

        List<EmployeeActivityItem> items = new ArrayList<>();
        for (StaffMember member : staffMemberRepository.findByPropertyIdOrderByFullNameAsc(propertyId)) {
            String category = categoryNames.getOrDefault(member.getCategoryId(), "Staff");
            if (member.getCreatedAt() != null) {
                items.add(new EmployeeActivityItem(EmployeeActivityType.STAFF_ADDED, member.getFullName(), category, member.getCreatedAt()));
            }
            if (!member.isActive() && member.getEmploymentEndDate() != null) {
                items.add(new EmployeeActivityItem(EmployeeActivityType.STAFF_REMOVED, member.getFullName(), category, removalInstant(member.getUpdatedAt(), member.getEmploymentEndDate())));
            }
        }
        for (ManagerEmploymentResponse manager : propertyModule.listManagerEmployment(propertyId)) {
            if (manager.createdAt() != null) {
                items.add(new EmployeeActivityItem(EmployeeActivityType.MANAGER_ADDED, manager.fullName(), "Managers", manager.createdAt()));
            }
        }
        for (ManagerEmploymentResponse manager : propertyModule.listEndedManagerEmployment(propertyId)) {
            if (manager.createdAt() != null) {
                items.add(new EmployeeActivityItem(EmployeeActivityType.MANAGER_ADDED, manager.fullName(), "Managers", manager.createdAt()));
            }
            if (manager.employmentEndDate() != null) {
                items.add(new EmployeeActivityItem(EmployeeActivityType.MANAGER_REMOVED, manager.fullName(), "Managers", removalInstant(manager.updatedAt(), manager.employmentEndDate())));
            }
        }
        return items;
    }

    /** Active monthly salary accounts with the current month still unpaid, for
     * the end-of-month salary payment reminder. */
    @Transactional(readOnly = true)
    public List<SalaryPaymentDueItem> listSalaryPaymentDue(LocalDate today) {
        return salaryAccountService.listSalaryPaymentDue(today);
    }

    private static Instant toInstant(LocalDate date) {
        return date.atStartOfDay(ZoneId.systemDefault()).toInstant();
    }

    /**
     * Best-known removal time for the recent-activity feed. The audit timestamp
     * is set when the record is deactivated, so it reflects the actual moment of
     * removal — far better than the end date at midnight, which reads as "Nh ago"
     * for the rest of the day. Falls back to the end date if no audit value.
     */
    private static Instant removalInstant(Instant updatedAt, LocalDate endDate) {
        if (updatedAt != null) {
            return updatedAt;
        }
        return endDate != null ? toInstant(endDate) : Instant.now();
    }

    @Transactional(readOnly = true)
    public TerminationPreviewResponse managerTerminationPreview(UUID actorUserId, UUID propertyId, String managerReferenceCode) {
        ensureOwner(actorUserId, propertyId);
        ManagerEmploymentResponse manager = propertyModule.getManagerEmploymentByReference(propertyId, managerReferenceCode);
        return salaryAccountService.managerTerminationPreview(manager.id());
    }

    /** Ends a manager's employment + settlement atomically (settlement in the
     * staff module, assignment removal in the property module, one transaction). */
    @Transactional
    public void endManagerEmployment(UUID actorUserId, UUID propertyId, String managerReferenceCode, EndEmploymentRequest request) {
        ensureOwner(actorUserId, propertyId);
        ManagerEmploymentResponse manager = propertyModule.getManagerEmploymentByReference(propertyId, managerReferenceCode);
        String reason = requiredText(request.reason(), "Exit reason");
        salaryAccountService.settleManagerAccount(
                manager.id(),
                request.additionalAmountPaise(),
                request.paymentMethod(),
                request.paidOn(),
                request.settlementNotes(),
                actorUserId);
        propertyModule.endManagerEmployment(actorUserId, propertyId, manager.managerUserId(), reason, optionalText(request.review()));
        log.info("Manager employment ended propertyId={} managerReferenceCode={} actorUserId={}",
                propertyId, managerReferenceCode, actorUserId);
    }

    @Transactional(readOnly = true)
    public PageResponse<EmployeeHistoryResponse> listEmployeeHistory(UUID actorUserId, UUID propertyId, int page, int size) {
        ensureOwner(actorUserId, propertyId);
        Map<UUID, String> categoryNames = staffCategoryRepository.findByPropertyIdAndActiveTrueOrderByNameAsc(propertyId)
                .stream()
                .collect(Collectors.toMap(StaffCategory::getId, StaffCategory::getName));

        List<EmployeeHistoryResponse> history = new ArrayList<>();
        for (StaffMember member : staffMemberRepository.findByPropertyIdOrderByFullNameAsc(propertyId)) {
            if (member.isActive()) {
                continue;
            }
            SalaryAccountService.SettledAccountSummary summary = salaryAccountService.staffAccountSummary(member.getId()).orElse(null);
            history.add(new EmployeeHistoryResponse(
                    SalaryHolderType.STAFF_MEMBER,
                    member.getReferenceCode(),
                    member.getFullName(),
                    categoryNames.getOrDefault(member.getCategoryId(), "Former category"),
                    member.getIdentityVerificationStatus(),
                    member.getSalaryStructure(),
                    member.getSalaryRatePaise(),
                    member.getEmploymentStartDate(),
                    member.getEmploymentEndDate(),
                    member.getEmploymentEndReason(),
                    member.getEmploymentReview(),
                    summary == null ? null : summary.settledOn(),
                    summary == null ? 0 : summary.settlementAmountPaise(),
                    summary == null ? 0 : summary.totalPaidPaise()));
        }
        for (ManagerEmploymentResponse manager : propertyModule.listEndedManagerEmployment(propertyId)) {
            SalaryAccountService.SettledAccountSummary summary = salaryAccountService.managerAccountSummary(manager.id()).orElse(null);
            history.add(new EmployeeHistoryResponse(
                    SalaryHolderType.MANAGER,
                    manager.referenceCode(),
                    manager.fullName(),
                    "Managers",
                    manager.identityVerificationStatus(),
                    manager.salaryStructure(),
                    manager.salaryRatePaise(),
                    manager.employmentStartDate(),
                    manager.employmentEndDate(),
                    manager.employmentEndReason(),
                    manager.employmentReview(),
                    summary == null ? null : summary.settledOn(),
                    summary == null ? 0 : summary.settlementAmountPaise(),
                    summary == null ? 0 : summary.totalPaidPaise()));
        }
        history.sort(Comparator.comparing(
                EmployeeHistoryResponse::employmentEndDate,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return PageResponse.of(history, page, size);
    }

    @Transactional(readOnly = true)
    public List<ManagerEmploymentResponse> listManagers(UUID actorUserId, UUID propertyId) {
        ensureOwner(actorUserId, propertyId);
        return propertyModule.listManagerEmployment(propertyId);
    }

    // --- Manager self-service (read-only). ---

    /** A manager's own employment record. Throws if the actor is not a manager. */
    @Transactional(readOnly = true)
    public ManagerEmploymentResponse getMyEmployment(UUID actorUserId, UUID propertyId) {
        return propertyModule.getManagerEmploymentByUser(propertyId, actorUserId);
    }

    /** Redacted staff directory for managers — names + categories only. */
    @Transactional(readOnly = true)
    public List<StaffMemberSummary> listMembersForManager(UUID actorUserId, UUID propertyId) {
        ensureManager(actorUserId, propertyId);
        Map<UUID, String> categoryNames = staffCategoryRepository.findByPropertyIdAndActiveTrueOrderByNameAsc(propertyId)
                .stream()
                .collect(Collectors.toMap(StaffCategory::getId, StaffCategory::getName));
        return staffMemberRepository.findByPropertyIdAndActiveTrueOrderByFullNameAsc(propertyId)
                .stream()
                .map(member -> StaffMemberSummary.from(member, categoryNames.getOrDefault(member.getCategoryId(), "Former category")))
                .toList();
    }

    private void ensureManager(UUID actorUserId, UUID propertyId) {
        if (!propertyModule.findActiveManagerUserIds(propertyId).contains(actorUserId)) {
            throw new ForbiddenException("Only an assigned manager can view this");
        }
    }

    @Transactional
    public ManagerEmploymentResponse updateManagerEmployment(
            UUID actorUserId,
            UUID propertyId,
            String managerReferenceCode,
            UpdateManagerEmploymentRequest request) {
        ensureOwner(actorUserId, propertyId);
        validateEmploymentDates(request.employmentStartDate(), request.employmentEndDate());
        if (request.salaryRatePaise() <= 0) {
            throw new ValidationException("Manager salary rate must be greater than zero");
        }
        ManagerEmploymentDetails employment = new ManagerEmploymentDetails(
                request.dateOfBirth(),
                request.identityVerificationStatus(),
                verifiedAt(request.identityVerificationStatus()),
                request.salaryStructure(),
                request.salaryRatePaise(),
                optionalText(request.benefitsSummary()),
                request.employmentStartDate(),
                request.employmentEndDate(),
                optionalText(request.employmentNotes()));
        return propertyModule.updateManagerEmployment(actorUserId, propertyId, managerReferenceCode, employment);
    }

    private void ensureSystemCategories(UUID propertyId) {
        for (StaffCategoryType categoryType : StaffCategoryType.values()) {
            if (!staffCategoryRepository.existsByPropertyIdAndSystemKey(propertyId, categoryType.name())) {
                staffCategoryRepository.save(StaffCategory.system(propertyId, categoryType));
            }
        }
    }

    private StaffCategory activeCategory(UUID categoryId, UUID propertyId) {
        StaffCategory category = category(categoryId, propertyId);
        if (!category.isActive()) {
            throw new ValidationException("Choose an active staff category");
        }
        return category;
    }

    private StaffCategory category(UUID categoryId, UUID propertyId) {
        return staffCategoryRepository.findByIdAndPropertyId(categoryId, propertyId)
                .orElseThrow(() -> new NotFoundException("StaffCategory", categoryId));
    }

    private StaffMember member(String referenceCode, UUID propertyId) {
        return staffMemberRepository.findByPropertyIdOrderByFullNameAsc(propertyId)
                .stream()
                .filter(member -> member.getReferenceCode().equalsIgnoreCase(referenceCode))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("StaffMember", referenceCode));
    }

    private void ensureOwner(UUID actorUserId, UUID propertyId) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        if (!property.ownerId().equals(actorUserId)) {
            throw new ForbiddenException("Only the property owner can manage staff records");
        }
    }

    private static void validateEmploymentDates(LocalDate startDate, LocalDate endDate) {
        if (endDate != null && endDate.isBefore(startDate)) {
            throw new ValidationException("Employment end date cannot be before the start date");
        }
    }

    private static Integer age(LocalDate dateOfBirth) {
        if (dateOfBirth == null || dateOfBirth.isAfter(LocalDate.now())) {
            return null;
        }
        return Period.between(dateOfBirth, LocalDate.now()).getYears();
    }

    private static Instant verifiedAt(IdentityVerificationStatus status) {
        return status == IdentityVerificationStatus.VERIFIED ? Instant.now() : null;
    }

    private static String requiredText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new ValidationException(label + " is required");
        }
        return value.trim();
    }

    private static String optionalText(String value) {
        return value == null ? "" : value.trim();
    }
}
