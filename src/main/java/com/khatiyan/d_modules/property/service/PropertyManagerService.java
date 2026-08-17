package com.khatiyan.d_modules.property.service;
import java.time.LocalDate;
import java.time.Period;
import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.c_shared.employment.IdentityVerificationStatus;
import com.khatiyan.c_shared.employment.ManagerEmploymentDetails;
import com.khatiyan.c_shared.employment.SalaryStructure;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.api.dto.AddPropertyManagerRequest;
import com.khatiyan.d_modules.property.api.dto.ManagerEmploymentResponse;
import com.khatiyan.d_modules.property.api.dto.ManagerLookupResponse;
import com.khatiyan.d_modules.property.api.dto.ManagerPayrollView;
import com.khatiyan.d_modules.property.api.dto.PropertyManagerResponse;
import com.khatiyan.d_modules.property.event.ManagerAssignedEvent;
import com.khatiyan.d_modules.property.event.ManagerEmploymentUpdatedEvent;
import com.khatiyan.d_modules.property.event.ManagerRemovedEvent;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.model.PropertyManager;
import com.khatiyan.d_modules.property.repository.PropertyManagerRepository;
import com.khatiyan.d_modules.property.repository.PropertyRepository;
import com.khatiyan.d_modules.tenancy.TenancyModule;

import lombok.extern.slf4j.Slf4j;

/**
 * Application service for assigning manager users to owner properties.
 *
 * <p>Owners always manage their own properties. Managers need an active
 * assignment row in order to manage a property.
 */
@Slf4j
@Service
public class PropertyManagerService {

    private final PropertyService propertyService;
    private final PropertyRepository propertyRepository;
    private final PropertyManagerRepository propertyManagerRepository;
    private final AuthModule authModule;
    private final TenancyModule tenancyModule;
    private final ApplicationEventPublisher eventPublisher;

    public PropertyManagerService(
            PropertyService propertyService,
            PropertyRepository propertyRepository,
            PropertyManagerRepository propertyManagerRepository,
            AuthModule authModule,
            // @Lazy: tenancy already depends on property, so eager injection here
            // would form a bean cycle. We only call the facade at request time.
            @Lazy TenancyModule tenancyModule,
            ApplicationEventPublisher eventPublisher) {
        this.propertyService = propertyService;
        this.propertyRepository = propertyRepository;
        this.propertyManagerRepository = propertyManagerRepository;
        this.authModule = authModule;
        this.tenancyModule = tenancyModule;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Assigns a manager to an owner-owned property, provisioning the manager user
     * by phone if needed.
     */
    @Transactional
    public PropertyManagerResponse addManager(
            UUID ownerId,
            UUID propertyId,
            AddPropertyManagerRequest request) {
        Property property = propertyService.getOwnedActiveProperty(ownerId, propertyId);
        ManagerEmploymentDetails employment = employmentDetails(request);
        UUID managerUserId = authModule.provisionManagerUser(request.phone(), request.fullName(), ownerId);

        if (property.getOwnerId().equals(managerUserId)) {
            throw new ValidationException("Owner cannot be assigned as manager");
        }
        if (tenancyModule.isUserTenantOfProperty(managerUserId, property.getId())) {
            throw new ValidationException("This person is a tenant of this property and cannot also be a manager here.");
        }
        if (propertyManagerRepository.existsByPropertyIdAndManagerUserIdAndActiveTrue(
                property.getId(), managerUserId)) {
            throw new ValidationException("Manager is already assigned to this property");
        }

        PropertyManager saved = propertyManagerRepository.save(PropertyManager.assign(
                property.getId(), managerUserId, ownerId, employment));
        log.info("Property manager assigned propertyId={} managerUserId={} ownerId={}",
                property.getId(), managerUserId, ownerId);
        eventPublisher.publishEvent(new ManagerAssignedEvent(property.getId(), managerUserId, ownerId));
        return toResponse(saved);
    }

    /**
     * Looks up a phone number before assignment so the owner can confirm who
     * they are adding, mirroring the tenant-lookup flow.
     */
    @Transactional(readOnly = true)
    public ManagerLookupResponse lookupManager(UUID ownerId, UUID propertyId, String phone) {
        Property property = propertyService.getOwnedActiveProperty(ownerId, propertyId);

        return authModule.findByPhone(phone)
                .map(user -> {
                    if (user.role() != UserRole.USER && user.role() != UserRole.OWNER) {
                        return new ManagerLookupResponse(true, user.fullName(), false, false,
                                "This phone belongs to an account that cannot be a manager.");
                    }
                    if (user.id().equals(property.getOwnerId())) {
                        return new ManagerLookupResponse(true, user.fullName(), false, false,
                                "This is the property owner.");
                    }
                    if (tenancyModule.isUserTenantOfProperty(user.id(), property.getId())) {
                        return new ManagerLookupResponse(true, user.fullName(), false, false,
                                "This person is a tenant of this property and cannot also be a manager here.");
                    }
                    if (propertyManagerRepository.existsByPropertyIdAndManagerUserIdAndActiveTrue(property.getId(), user.id())) {
                        return new ManagerLookupResponse(true, user.fullName(), true, false,
                                "Already a manager of this property.");
                    }
                    return new ManagerLookupResponse(true, user.fullName(), false, true,
                            "Existing user - will be assigned as a manager.");
                })
                .orElseGet(() -> new ManagerLookupResponse(false, null, false, true,
                        "New user - an account will be created and assigned."));
    }

    /**
     * Lists active managers for an owner-owned property.
     */
    @Transactional(readOnly = true)
    public List<PropertyManagerResponse> listManagers(UUID ownerId, UUID propertyId) {
        Property property = propertyService.getOwnedActiveProperty(ownerId, propertyId);

        return propertyManagerRepository.findByPropertyIdAndActiveTrue(property.getId())
                .stream()
                .map(manager -> toResponse(manager))
                .toList();
    }

    /**
     * Lists active manager user ids for module-to-module notification delivery.
     */
    @Transactional(readOnly = true)
    public List<UUID> findActiveManagerUserIds(UUID propertyId) {
        return propertyManagerRepository.findActiveManagerUserIdsByPropertyId(propertyId);
    }

    // --- Manager employment read/edit, surfaced to the staff workspace. ---
    // Access checks live in the caller (the owner-only staff service); these
    // are plain data operations on the property-owned employment snapshot.

    @Transactional(readOnly = true)
    public List<ManagerEmploymentResponse> listManagerEmployment(UUID propertyId) {
        return propertyManagerRepository.findByPropertyIdAndActiveTrue(propertyId)
                .stream()
                .map(this::toEmploymentResponse)
                .toList();
    }

    /** Lightweight payroll terms for all active managers across every property,
     * built without user-profile lookups. For scheduled payroll jobs. */
    @Transactional(readOnly = true)
    public List<ManagerPayrollView> listActiveManagerPayroll() {
        return propertyManagerRepository.findByActiveTrue()
                .stream()
                .map(ManagerPayrollView::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ManagerEmploymentResponse getManagerEmploymentByReference(UUID propertyId, String referenceCode) {
        return toEmploymentResponse(managerByReference(propertyId, referenceCode));
    }

    /** A manager's own employment record. Throws if the actor is not an active
     * manager of the property — doubles as the manager-self access check. */
    @Transactional(readOnly = true)
    public ManagerEmploymentResponse getManagerEmploymentByUser(UUID propertyId, UUID managerUserId) {
        PropertyManager manager = propertyManagerRepository
                .findByPropertyIdAndManagerUserIdAndActiveTrue(propertyId, managerUserId)
                .orElseThrow(() -> new ForbiddenException("You are not a manager of this property"));
        return toEmploymentResponse(manager);
    }

    @Transactional(readOnly = true)
    public ManagerEmploymentResponse getManagerEmploymentById(UUID propertyManagerId) {
        PropertyManager manager = propertyManagerRepository.findById(propertyManagerId)
                .orElseThrow(() -> new NotFoundException("PropertyManager", propertyManagerId));
        return toEmploymentResponse(manager);
    }

    @Transactional
    public ManagerEmploymentResponse updateManagerEmployment(
            UUID actorUserId,
            UUID propertyId,
            String referenceCode,
            ManagerEmploymentDetails employment) {
        PropertyManager manager = managerByReference(propertyId, referenceCode);
        manager.updateEmployment(employment);
        eventPublisher.publishEvent(new ManagerEmploymentUpdatedEvent(propertyId, manager.getManagerUserId(), actorUserId));
        return toEmploymentResponse(manager);
    }

    /** Ends a manager assignment with an exit reason + review, recording the end
     * date for the employee history. Publishes the removal event. */
    @Transactional
    public void endManagerEmployment(UUID ownerId, UUID propertyId, UUID managerUserId, String reason, String review) {
        PropertyManager manager = propertyManagerRepository
                .findByPropertyIdAndManagerUserIdAndActiveTrue(propertyId, managerUserId)
                .orElseThrow(() -> new NotFoundException("PropertyManager", managerUserId));
        manager.endEmployment(LocalDate.now(), reason, review);
        log.info("Property manager employment ended propertyId={} managerUserId={} ownerId={}", propertyId, managerUserId, ownerId);
        eventPublisher.publishEvent(new ManagerRemovedEvent(propertyId, managerUserId, ownerId));
    }

    /**
     * Records a future leaving date without removing the assignment.
     *
     * <p>No ManagerRemovedEvent: nothing has been removed yet, and firing it now
     * would revoke access on a manager who is still working.
     */
    @Transactional
    public void scheduleManagerEnd(
            UUID ownerId, UUID propertyId, UUID managerUserId, LocalDate endDate, String reason, String review) {
        PropertyManager manager = propertyManagerRepository
                .findByPropertyIdAndManagerUserIdAndActiveTrue(propertyId, managerUserId)
                .orElseThrow(() -> new NotFoundException("PropertyManager", managerUserId));
        manager.scheduleEnd(endDate, reason, review);
        log.info("Property manager end scheduled propertyId={} managerUserId={} endDate={} ownerId={}",
                propertyId, managerUserId, endDate, ownerId);
    }

    /**
     * Closes every manager assignment whose scheduled last day has arrived.
     *
     * <p>Publishes ManagerRemovedEvent per manager, which is what actually
     * revokes their access — the scheduling step deliberately did not.
     *
     * @return how many were ended
     */
    @Transactional
    public int endDueScheduledAssignments(LocalDate today) {
        List<PropertyManager> due =
                propertyManagerRepository.findByActiveTrueAndEmploymentEndDateLessThanEqual(today);
        for (PropertyManager manager : due) {
            manager.endScheduled();
            log.info("Scheduled manager end actioned propertyId={} managerUserId={} endDate={}",
                    manager.getPropertyId(), manager.getManagerUserId(), manager.getEmploymentEndDate());
            eventPublisher.publishEvent(new ManagerRemovedEvent(
                    manager.getPropertyId(), manager.getManagerUserId(), manager.getAssignedByUserId()));
        }
        return due.size();
    }

    /** Removed (inactive) managers for the employee history. */
    @Transactional(readOnly = true)
    public List<ManagerEmploymentResponse> listEndedManagerEmployment(UUID propertyId) {
        return propertyManagerRepository.findByPropertyIdAndActiveFalse(propertyId)
                .stream()
                .map(this::toEmploymentResponse)
                .toList();
    }

    private PropertyManager managerByReference(UUID propertyId, String referenceCode) {
        return propertyManagerRepository.findByPropertyIdAndReferenceCodeAndActiveTrue(propertyId, referenceCode)
                .orElseThrow(() -> new NotFoundException("PropertyManager", referenceCode));
    }

    private ManagerEmploymentResponse toEmploymentResponse(PropertyManager manager) {
        UserSummaryResponse user = authModule.findById(manager.getManagerUserId())
                .orElseThrow(() -> new NotFoundException("User", manager.getManagerUserId()));
        return ManagerEmploymentResponse.from(manager, user.fullName(), user.phone(), age(manager.getDateOfBirth()));
    }

    private static Integer age(LocalDate dateOfBirth) {
        if (dateOfBirth == null || dateOfBirth.isAfter(LocalDate.now())) {
            return null;
        }
        return Period.between(dateOfBirth, LocalDate.now()).getYears();
    }

    /**
     * Moves a manager from one owner-owned property to another in a single
     * transaction   deactivates the current assignment and creates a new one.
     */
    @Transactional
    public PropertyManagerResponse shiftManager(
            UUID ownerId,
            UUID fromPropertyId,
            UUID managerUserId,
            UUID toPropertyId) {
        Property fromProperty = propertyService.getOwnedActiveProperty(ownerId, fromPropertyId);
        Property toProperty = propertyService.getOwnedActiveProperty(ownerId, toPropertyId);

        if (fromProperty.getId().equals(toProperty.getId())) {
            throw new ValidationException("Choose a different target property");
        }

        PropertyManager current = propertyManagerRepository
                .findByPropertyIdAndManagerUserIdAndActiveTrue(fromProperty.getId(), managerUserId)
                .orElseThrow(() -> new NotFoundException("PropertyManager", managerUserId));

        if (toProperty.getOwnerId().equals(managerUserId)) {
            throw new ValidationException("Owner cannot be assigned as manager");
        }

        // A tenant of the target property cannot also manage it.
        if (tenancyModule.isUserTenantOfProperty(managerUserId, toProperty.getId())) {
            throw new ValidationException("This person is a tenant of the target property and cannot also be a manager there.");
        }

        if (propertyManagerRepository.existsByPropertyIdAndManagerUserIdAndActiveTrue(toProperty.getId(), managerUserId)) {
            throw new ValidationException("Manager is already assigned to the target property");
        }

        current.deactivate();

        PropertyManager moved = PropertyManager.assign(
                toProperty.getId(),
                managerUserId,
                ownerId,
                new ManagerEmploymentDetails(
                        current.getDateOfBirth(),
                        current.getIdentityVerificationStatus(),
                        current.getIdentityVerifiedAt(),
                        current.getSalaryStructure(),
                        current.getSalaryRatePaise(),
                        current.getBenefitsSummary(),
                        current.getEmploymentStartDate(),
                        current.getEmploymentEndDate(),
                        current.getEmploymentNotes()));
        PropertyManager saved = propertyManagerRepository.save(moved);

        log.info(
                "Property manager shifted fromPropertyId={} toPropertyId={} managerUserId={} ownerId={}",
                fromProperty.getId(),
                toProperty.getId(),
                managerUserId,
                ownerId);

        eventPublisher.publishEvent(new ManagerRemovedEvent(fromProperty.getId(), managerUserId, ownerId));
        eventPublisher.publishEvent(new ManagerAssignedEvent(toProperty.getId(), managerUserId, ownerId));

        return toResponse(saved);
    }

    /**
     * Removes a manager assignment from an owner-owned property.
     */
    @Transactional
    public void removeManager(UUID ownerId, UUID propertyId, UUID managerUserId) {
        Property property = propertyService.getOwnedActiveProperty(ownerId, propertyId);

        PropertyManager manager = propertyManagerRepository
                .findByPropertyIdAndManagerUserIdAndActiveTrue(property.getId(), managerUserId)
                .orElseThrow(() -> new NotFoundException("PropertyManager", managerUserId));

        manager.deactivate();

        log.info(
                "Property manager removed propertyId={} managerUserId={} ownerId={}",
                property.getId(),
                managerUserId,
                ownerId);

        eventPublisher.publishEvent(new ManagerRemovedEvent(
                property.getId(),
                managerUserId,
                ownerId));
    }

    /**
     * Returns true when the actor owns the property or is actively assigned as a
     * manager.
     */
    @Transactional(readOnly = true)
    public boolean canManageProperty(UUID actorUserId, UUID propertyId) {
        if (propertyRepository.existsByIdAndOwnerIdAndActiveTrue(propertyId, actorUserId)) {
            return true;
        }

        return propertyManagerRepository.existsByPropertyIdAndManagerUserIdAndActiveTrue(
                propertyId,
                actorUserId);
    }

    /**
     * Throws when the actor cannot manage the property.
     */
    @Transactional(readOnly = true)
    public void ensureCanManageProperty(UUID actorUserId, UUID propertyId) {
        if (!canManageProperty(actorUserId, propertyId)) {
            throw new ForbiddenException("You cannot manage this property");
        }
    }

    private static ManagerEmploymentDetails employmentDetails(AddPropertyManagerRequest request) {
        if (request.employmentEndDate() != null && request.employmentEndDate().isBefore(request.employmentStartDate())) {
            throw new ValidationException("Employment end date cannot be before the start date");
        }
        return new ManagerEmploymentDetails(
                request.dateOfBirth(),
                IdentityVerificationStatus.NOT_STARTED,
                null,
                request.salaryStructure(),
                request.salaryRatePaise(),
                optionalText(request.benefitsSummary()),
                request.employmentStartDate(),
                request.employmentEndDate(),
                optionalText(request.employmentNotes()));
    }

    private static String optionalText(String value) {
        return value == null ? "" : value.trim();
    }
    private PropertyManagerResponse toResponse(PropertyManager manager) {
        UserSummaryResponse managerUser = authModule.findById(manager.getManagerUserId())
                .orElseThrow(() -> new NotFoundException("User", manager.getManagerUserId()));

        return PropertyManagerResponse.from(manager, managerUser);
    }
}
