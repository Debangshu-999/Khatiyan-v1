package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyOnboardingResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenantActiveTenancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenantLookupResponse;
import com.khatiyan.d_modules.tenancy.event.TenancyEndedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomTransferredEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyStartedEvent;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

import lombok.extern.slf4j.Slf4j;

@SuppressWarnings("null")
@Slf4j
@Service
public class TenancyService {

    private final TenancyRepository tenancyRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final BillingModule billingModule;
    private final ReferenceCodeGenerator referenceCodeGenerator;

    public TenancyService(
            TenancyRepository tenancyRepository,
            ApplicationEventPublisher eventPublisher,
            PropertyModule propertyModule,
            AuthModule authModule,
            @Lazy BillingModule billingModule,
            ReferenceCodeGenerator referenceCodeGenerator) {
        this.tenancyRepository = tenancyRepository;
        this.eventPublisher = eventPublisher;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.billingModule = billingModule;
        this.referenceCodeGenerator = referenceCodeGenerator;
    }

    private String placeholderTenantName(String tenantPhone) {
        String digitsOnly = tenantPhone.replaceAll("\\D", "");
        if (digitsOnly.length() < 4) {
            return "Tenant";
        }

        return "Tenant " + digitsOnly.substring(digitsOnly.length() - 4);
    }

    private Tenancy getActiveTenancy(UUID tenancyId) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy_", tenancyId));

        if (!tenancy.isCurrentlyActive()) {
            throw new ValidationException("Tenancy is not active");
        }

        return tenancy;
    }

    @Transactional
    public Tenancy create(
            UUID actorUserId,
            String tenantPhone,
            String tenantName,
            UUID propertyId,
            UUID roomId,
            TenancyBillingType billingType,
            Long rentAmountPaise,
            Long depositAmountPaise,
            LocalDate startDate, LocalDate plannedEndDate) {

        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        TenancyBillingType resolvedBillingType = billingType != null ? billingType : TenancyBillingType.MONTHLY;

        String provisionName = (tenantName != null && !tenantName.isBlank())
                ? tenantName.trim()
                : placeholderTenantName(tenantPhone);
        UUID tenantId = authModule.provisionTenantUser(
                tenantPhone,
                provisionName,
                actorUserId);

        // A person who manages this property cannot also be a tenant of it.
        if (propertyModule.findActiveManagerUserIds(propertyId).contains(tenantId)) {
            throw new ValidationException("This person manages this property and cannot also be a tenant here.");
        }

        UserSummaryResponse tenantUser = authModule.findById(tenantId)
                .orElseThrow(() -> new NotFoundException("User_", tenantId));
        if (tenantUser.activeTenant()) {
            throw new ValidationException("User already has an active tenancy");
        }

        if (!tenancyRepository.findActiveByUserId(tenantId).isEmpty()) {
            throw new ValidationException("User already has an active tenancy");
        }

        if (!propertyModule.hasAvailableVacancy(propertyId, roomId)) {
            throw new ValidationException("Room has no available vacancy");
        }

        Tenancy tenancy;
        if (resolvedBillingType == TenancyBillingType.DAILY) {
            tenancy = createDailyTenancy(
                    tenantId,
                    propertyId,
                    roomId,
                    actorUserId,
                    startDate,
                    plannedEndDate,
                    depositAmountPaise);
        } else {
            tenancy = createMonthlyTenancy(
                    tenantId,
                    propertyId,
                    roomId,
                    actorUserId,
                    rentAmountPaise,
                    depositAmountPaise,
                    startDate,
                    plannedEndDate);
        }

        tenancy = tenancyRepository.save(tenancy);
        authModule.markActiveTenant(tenancy.getUserId());
        billingModule.initializeStartedTenancy(actorUserId, TenancyResponse.from(tenancy));

        eventPublisher.publishEvent(new TenancyStartedEvent(
                tenancy.getId(),
                tenancy.getUserId(),
                actorUserId,
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                tenancy.getStartDate()));

        log.info(
                "Tenancy created tenancyId={} userId={} actorUserId={} propertyId={} roomId={} billingType={} startDate={}",
                tenancy.getId(),
                tenancy.getUserId(),
                actorUserId,
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                tenancy.getBillingType(),
                tenancy.getStartDate());

        return tenancy;
    }

    /**
     * Admin onboarding: looks up whether the phone is eligible to become a
     * tenant. Used by the onboarding wizard's first step.
     */
    @Transactional(readOnly = true)
    public TenantLookupResponse lookupTenant(String tenantPhone) {
        return authModule.findByPhone(tenantPhone)
                .map(user -> {
                    if (user.role() != com.khatiyan.a_auth.model.UserRole.USER) {
                        return new TenantLookupResponse(true, user.fullName(), false, false,
                                "This phone belongs to a non-tenant account.");
                    }
                    if (user.activeTenant()) {
                        return new TenantLookupResponse(true, user.fullName(), true, false,
                                "This user already has an active tenancy.");
                    }
                    return new TenantLookupResponse(true, user.fullName(), false, true,
                            "Existing user - a new tenancy will be added.");
                })
                .orElseGet(() -> new TenantLookupResponse(false, null, false, true,
                        "New user - an account will be created."));
    }

    /**
     * Admin onboarding: creates the tenancy (provisioning the tenant account if
     * needed) and reports whether a new account was created, so the wizard can
     * show the right success message.
     */
    @Transactional
    public TenancyOnboardingResponse onboard(
            UUID actorUserId,
            String tenantPhone,
            String tenantName,
            UUID propertyId,
            UUID roomId,
            TenancyBillingType billingType,
            Long rentAmountPaise,
            Long depositAmountPaise,
            LocalDate startDate,
            LocalDate plannedEndDate) {
        boolean existedBefore = authModule.findByPhone(tenantPhone).isPresent();

        Tenancy tenancy = create(
                actorUserId, tenantPhone, tenantName, propertyId, roomId,
                billingType, rentAmountPaise, depositAmountPaise, startDate, plannedEndDate);

        return new TenancyOnboardingResponse(!existedBefore, TenancyResponse.from(tenancy));
    }

    private Tenancy createMonthlyTenancy(
            UUID tenantId,
            UUID propertyId,
            UUID roomId,
            UUID actorUserId,
            Long rentAmountPaise,
            Long depositAmountPaise,
            LocalDate startDate,
            LocalDate plannedEndDate) {
        if (plannedEndDate != null) {
            throw new ValidationException("Planned end date is only allowed for daily tenancy");
        }

        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        RoomResponse room = propertyModule.getActiveRoom(propertyId, roomId);

        // Rent and deposit default from room/property, but the onboarding admin
        // may override either; the overridden values are snapshotted on the
        // tenancy. A blank/zero override falls back to the inventory/policy value.
        long resolvedRent = (rentAmountPaise != null && rentAmountPaise > 0)
                ? rentAmountPaise
                : room.baseRentPaise();
        if (resolvedRent <= 0) {
            throw new ValidationException("Room rent must be configured before starting tenancy");
        }

        long resolvedDeposit = (depositAmountPaise != null && depositAmountPaise >= 0)
                ? depositAmountPaise
                : property.standardDepositPaise();

        return Tenancy.start(
                referenceCodeGenerator.nextCode("TEN"),
                tenantId,
                propertyId,
                roomId,
                actorUserId,
                resolvedRent,
                resolvedDeposit,
                startDate);
    }

    private Tenancy createDailyTenancy(
            UUID tenantId,
            UUID propertyId,
            UUID roomId,
            UUID actorUserId,
            LocalDate startDate,
            LocalDate plannedEndDate,
            Long depositAmountPaise) {
        if (depositAmountPaise != null) {
            throw new ValidationException("Daily tenancy does not accept deposit amount");
        }

        if (plannedEndDate == null) {
            throw new ValidationException("Planned end date is required for daily tenancy");
        }

        long stayDays = ChronoUnit.DAYS.between(startDate, plannedEndDate);
        if (stayDays < 1 || stayDays >= 30) {
            throw new ValidationException("Daily tenancy stay must be between 1 and 29 days");
        }

        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        RoomResponse room = propertyModule.getActiveRoom(propertyId, roomId);
        Long dailyRatePaise = room.conditioning() == com.khatiyan.d_modules.property.model.RoomConditioning.AC
                ? property.dailyGuestAcRatePaise()
                : property.dailyGuestNonAcRatePaise();

        if (dailyRatePaise == null || dailyRatePaise <= 0) {
            throw new ValidationException("Property daily guest rate is not configured for this room conditioning");
        }

        return Tenancy.startDaily(
                referenceCodeGenerator.nextCode("TEN"),
                tenantId,
                propertyId,
                roomId,
                actorUserId,
                dailyRatePaise,
                startDate,
                plannedEndDate);
    }

    @Transactional
    public void end(UUID actorUserId, UUID tenancyId, LocalDate endDate, String reason) {
        Tenancy tenancy = getActiveTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.getPropertyId());
        billingModule.ensureLatestCyclePaidForExit(actorUserId, tenancyId);

        tenancy.end(endDate, reason);
        tenancyRepository.save(tenancy);

        eventPublisher.publishEvent(new TenancyEndedEvent(
                tenancy.getId(),
                tenancy.getUserId(),
                actorUserId,
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                endDate));

        authModule.clearActiveTenant(tenancy.getUserId());

        log.info(
                "Tenancy ended tenancyId={} userId={} actorUserId={} propertyId={} roomId={} endDate={}",
                tenancy.getId(),
                tenancy.getUserId(),
                actorUserId,
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                endDate);

    }

    @Transactional
    public Tenancy updateSetupTerms(
            UUID actorUserId,
            UUID tenancyId,
            Long rentAmountPaise,
            Long depositAmountPaise) {
        Tenancy tenancy = getActiveTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.getPropertyId());

        try {
            tenancy.updateSetupTerms(rentAmountPaise, depositAmountPaise);
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new ValidationException(e.getMessage());
        }

        log.info(
                "Tenancy setup terms updated tenancyId={} userId={} actorUserId={} propertyId={} roomId={}",
                tenancy.getId(),
                tenancy.getUserId(),
                actorUserId,
                tenancy.getPropertyId(),
                tenancy.getRoomId());

        return tenancy;
    }

    @Transactional
    public Tenancy transferRoom(
            UUID actorUserId,
            UUID tenancyId,
            UUID newRoomId,
            LocalDate transferDate) {
        Tenancy tenancy = getActiveTenancy(tenancyId);
        UUID propertyId = tenancy.getPropertyId();
        UUID oldRoomId = tenancy.getRoomId();
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        if (oldRoomId.equals(newRoomId)) {
            throw new ValidationException("New room must be different from the current room");
        }

        if (!propertyModule.hasAvailableVacancy(propertyId, newRoomId)) {
            throw new ValidationException("Room has no available vacancy");
        }

        RoomResponse newRoom = propertyModule.getActiveRoom(propertyId, newRoomId);
        if (newRoom.baseRentPaise() <= 0) {
            throw new ValidationException("New room rent must be configured before transfer");
        }

        LocalDate resolvedTransferDate = transferDate == null ? LocalDate.now() : transferDate;
        if (resolvedTransferDate.isBefore(tenancy.getStartDate())) {
            throw new ValidationException("Transfer date cannot be before tenancy start date");
        }

        try {
            tenancy.transferRoom(newRoomId, newRoom.baseRentPaise());
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new ValidationException(e.getMessage());
        }

        eventPublisher.publishEvent(new TenancyRoomTransferredEvent(
                tenancy.getId(),
                tenancy.getUserId(),
                actorUserId,
                propertyId,
                oldRoomId,
                newRoomId,
                resolvedTransferDate,
                newRoom.baseRentPaise()));

        log.info(
                "Tenancy room transferred tenancyId={} userId={} actorUserId={} propertyId={} oldRoomId={} newRoomId={} newRentAmount={} transferDate={}",
                tenancy.getId(),
                tenancy.getUserId(),
                actorUserId,
                propertyId,
                oldRoomId,
                newRoomId,
                newRoom.baseRentPaise(),
                resolvedTransferDate);

        return tenancy;
    }

    @Transactional
    public void markBillingStarted(UUID tenancyId) {
        Tenancy tenancy = getActiveTenancy(tenancyId);
        tenancy.markBillingStarted();

        log.info(
                "Tenancy billing started tenancyId={} userId={} propertyId={} roomId={}",
                tenancy.getId(),
                tenancy.getUserId(),
                tenancy.getPropertyId(),
                tenancy.getRoomId());
    }

    @Transactional
    public void markOnNotice(UUID tenancyId) {
        Tenancy tenancy = getActiveTenancy(tenancyId);
        tenancy.markOnNotice();

        log.info("Tenancy marked on notice tenancyId={} userId={}", tenancy.getId(), tenancy.getUserId());
    }

    @Transactional
    public void markOnNotice(UUID tenancyId, LocalDate endDate) {
        Tenancy tenancy = getActiveTenancy(tenancyId);
        tenancy.markOnNotice();
        tenancy.scheduleEndDate(endDate);

        log.info(
                "Tenancy marked on notice tenancyId={} userId={} plannedEndDate={}",
                tenancy.getId(),
                tenancy.getUserId(),
                tenancy.getEndDate());
    }

    @Transactional
    public void markOnPrematureNotice(UUID tenancyId) {
        Tenancy tenancy = getActiveTenancy(tenancyId);
        tenancy.markOnPrematureNotice();

        log.info("Tenancy marked on premature notice tenancyId={} userId={}", tenancy.getId(), tenancy.getUserId());
    }

    @Transactional
    public void markOnPrematureNotice(UUID tenancyId, LocalDate endDate) {
        Tenancy tenancy = getActiveTenancy(tenancyId);
        tenancy.markOnPrematureNotice();
        tenancy.scheduleEndDate(endDate);

        log.info(
                "Tenancy marked on premature notice tenancyId={} userId={} plannedEndDate={}",
                tenancy.getId(),
                tenancy.getUserId(),
                tenancy.getEndDate());
    }

    @Transactional(readOnly = true)
    public Optional<Tenancy> findById(UUID tenancyId) {
        return tenancyRepository.findById(tenancyId);
    }

    @Transactional(readOnly = true)
    public Optional<Tenancy> findActiveByUserId(UUID userId) {
        List<Tenancy> tenancies = tenancyRepository.findActiveByUserId(userId);
        if (tenancies.isEmpty()) {
            return Optional.empty();
        }

        return Optional.of(tenancies.get(0));
    }

    @Transactional(readOnly = true)
    public TenantActiveTenancyResponse getTenantActiveTenancyProfile(UUID userId) {
        Tenancy tenancy = findActiveByUserId(userId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancy_", userId));

        UserSummaryResponse user = authModule.findById(userId)
                .orElseThrow(() -> new NotFoundException("User_", userId));

        PropertyResponse property = propertyModule.getActiveProperty(tenancy.getPropertyId());
        RoomResponse room = propertyModule.getActiveRoom(tenancy.getPropertyId(), tenancy.getRoomId());

        return new TenantActiveTenancyResponse(
                user,
                TenancyResponse.from(tenancy),
                property,
                room);
    }

    @Transactional(readOnly = true)
    public List<RoomResponse> listActivePropertyRoomsForTenant(UUID userId) {
        Tenancy tenancy = findActiveByUserId(userId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancy_", userId));

        return propertyModule.listActiveRoomsForProperty(tenancy.getPropertyId());
    }

    @Transactional(readOnly = true)
    public List<Tenancy> findActiveByPropertyId(UUID propertyId) {
        return tenancyRepository.findByPropertyIdAndActiveTrue(propertyId);
    }

    public TenancyResponse toResponse(Tenancy tenancy) {
        UserSummaryResponse user = authModule.findById(tenancy.getUserId()).orElse(null);
        return TenancyResponse.from(tenancy, user);
    }

    @Transactional(readOnly = true)
    public Map<UUID, TenancyResponse> findByIds(Collection<UUID> tenancyIds) {
        if (tenancyIds == null || tenancyIds.isEmpty()) {
            return Collections.emptyMap();
        }

        return tenancyRepository.findAllById(tenancyIds)
                .stream()
                .map(tenancy -> TenancyResponse.from(tenancy))
                .collect(Collectors.toMap(TenancyResponse::id, Function.identity(), (left, right) -> left));
    }

    @Transactional(readOnly = true)
    public List<Tenancy> findInactiveByPropertyId(UUID propertyId) {
        return tenancyRepository.findByPropertyIdAndActiveFalse(propertyId);
    }

    @Transactional(readOnly = true)
    public List<Tenancy> findByPropertyId(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        return tenancyRepository.findByPropertyId(propertyId);
    }

    @Transactional(readOnly = true)
    public PageResponse<TenancyResponse> listActiveForManagedProperty(
            UUID actorUserId,
            UUID propertyId,
            String query,
            int page,
            int size) {
        return listPropertyTenancies(actorUserId, propertyId, true, query, page, size);
    }

    @Transactional(readOnly = true)
    public PageResponse<TenancyResponse> listPastForManagedProperty(
            UUID actorUserId,
            UUID propertyId,
            String query,
            int page,
            int size) {
        return listPropertyTenancies(actorUserId, propertyId, false, query, page, size);
    }

    /**
     * Lists a managed property's tenancies, newest first, optionally filtered by a
     * free-text query matched against tenant name, tenancy reference code and
     * tenancy id. The tenant name lives in the auth module, so responses are built
     * (with a batched name lookup) and filtered in memory before paging.
     */
    private PageResponse<TenancyResponse> listPropertyTenancies(
            UUID actorUserId,
            UUID propertyId,
            boolean active,
            String query,
            int page,
            int size) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        List<Tenancy> tenancies = active
                ? tenancyRepository.findByPropertyIdAndActiveTrue(propertyId)
                : tenancyRepository.findByPropertyIdAndActiveFalse(propertyId);

        Map<UUID, UserSummaryResponse> users = authModule.findByIds(
                tenancies.stream().map(Tenancy::getUserId).toList());

        Comparator<Tenancy> order = active
                ? Comparator.comparing(Tenancy::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                : Comparator.comparing(Tenancy::getEndDate, Comparator.nullsLast(Comparator.<LocalDate>reverseOrder()))
                        .thenComparing(Tenancy::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()));

        List<TenancyResponse> responses = tenancies.stream()
                .sorted(order)
                .map(tenancy -> TenancyResponse.from(tenancy, users.get(tenancy.getUserId())))
                .filter(response -> matchesTenancyQuery(response, normalizedQuery))
                .toList();

        return PageResponse.of(responses, page, size);
    }

    private static boolean matchesTenancyQuery(TenancyResponse response, String normalizedQuery) {
        if (normalizedQuery.isEmpty()) {
            return true;
        }

        String tenantName = response.tenantName() == null ? "" : response.tenantName().toLowerCase();
        String referenceCode = response.referenceCode() == null ? "" : response.referenceCode().toLowerCase();
        String tenancyId = response.id() == null ? "" : response.id().toString().toLowerCase();

        // Phone match ignores the country code: compare the local subscriber digits
        // on both sides, so searching the 10-digit number matches but "91"/"+91"
        // doesn't match every tenant.
        String phoneLocal = localPhoneDigits(response.tenantPhone());
        String queryDigits = localPhoneDigits(normalizedQuery);
        boolean phoneMatch = !queryDigits.isEmpty() && phoneLocal.contains(queryDigits);

        return tenantName.contains(normalizedQuery)
                || referenceCode.contains(normalizedQuery)
                || tenancyId.contains(normalizedQuery)
                || phoneMatch;
    }

    /** Digits of a phone with the +91 country code stripped, so phone search is
     * country-code-agnostic on both the stored number and the query. */
    private static String localPhoneDigits(String value) {
        if (value == null) {
            return "";
        }
        String digits = value.replaceAll("[^0-9]", "");
        if (digits.length() == 12 && digits.startsWith("91")) {
            digits = digits.substring(2);
        }
        return digits;
    }
    @Transactional(readOnly = true)
    public List<Tenancy> findByUserId(UUID userId) {
        return tenancyRepository.findByUserId(userId);
    }

    @Transactional(readOnly = true)
    public List<Tenancy> findActiveBillingStartedMonthlyTenancies() {
        return tenancyRepository.findActiveBillingStartedByBillingType(TenancyBillingType.MONTHLY);
    }

    @Transactional(readOnly = true)
    public List<Tenancy> findActiveEndingBetween(LocalDate startDate, LocalDate endDate) {
        return tenancyRepository.findActiveEndingBetween(startDate, endDate);
    }

    @Transactional(readOnly = true)
    public boolean isUserTenantOfProperty(UUID userId, UUID propertyId) {
        return tenancyRepository.existsActiveTenancy(userId, propertyId);
    }

    @Transactional(readOnly = true)
    public boolean hasActiveTenancyForRoom(UUID roomId) {
        return tenancyRepository.existsActiveTenancyForRoom(roomId);
    }

    @Transactional(readOnly = true)
    public long countActiveTenanciesForRoom(UUID roomId) {
        return tenancyRepository.countByRoomIdAndActiveTrue(roomId);
    }

}
