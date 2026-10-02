package com.khatiyan.d_modules.tenancy.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.tenancy.api.dto.BlockedBookingResponse;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckDeclarationInput;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckedParticulars;
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
import com.khatiyan.d_modules.tenancy.event.TenancyCancellationRoute;
import com.khatiyan.d_modules.tenancy.event.TenancyCancelledEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyActivatedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyStartedEvent;
import com.khatiyan.d_modules.tenancy.event.FutureBookingBlockedEvent;
import com.khatiyan.d_modules.tenancy.event.FutureBookingOccupancyEvent;
import com.khatiyan.d_modules.tenancy.model.GuestDetails;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;
import com.khatiyan.d_modules.tenancy.api.dto.StayEnding;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRoomChangeRequestRepository;

import lombok.extern.slf4j.Slf4j;

@SuppressWarnings("null")
@Slf4j
@Service
public class TenancyService {

    private static final ZoneId TENANCY_ZONE = ZoneId.of("Asia/Kolkata");

    private final TenancyRepository tenancyRepository;
    private final TenancyRoomChangeRequestRepository roomChangeRequestRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final PropertyModule propertyModule;
    private final TenancyAccessPolicy tenancyAccessPolicy;
    private final AuthModule authModule;
    private final BillingModule billingModule;
    private final ReferenceCodeGenerator referenceCodeGenerator;
    private final FutureVacancies futureVacancies;

    public TenancyService(
            TenancyRepository tenancyRepository,
            TenancyRoomChangeRequestRepository roomChangeRequestRepository,
            ApplicationEventPublisher eventPublisher,
            PropertyModule propertyModule,
            TenancyAccessPolicy tenancyAccessPolicy,
            AuthModule authModule,
            @Lazy BillingModule billingModule,
            ReferenceCodeGenerator referenceCodeGenerator,
            FutureVacancies futureVacancies) {
        this.tenancyRepository = tenancyRepository;
        this.roomChangeRequestRepository = roomChangeRequestRepository;
        this.eventPublisher = eventPublisher;
        this.propertyModule = propertyModule;
        this.tenancyAccessPolicy = tenancyAccessPolicy;
        this.authModule = authModule;
        this.billingModule = billingModule;
        this.referenceCodeGenerator = referenceCodeGenerator;
        this.futureVacancies = futureVacancies;
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
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));

        if (!tenancy.isCurrentlyActive()) {
            throw new ValidationException("Tenancy is not active");
        }

        return tenancy;
    }

    /**
     * Claims one departure from a full room for a monthly agreement booking: an
     * approved room change, or a stay certain to end soon. See {@link FutureVacancies}.
     */
    private FutureVacancies.Claim futureVacancyClaim(UUID propertyId, UUID roomId, LocalDate startDate) {
        if (propertyModule.hasAvailableVacancy(propertyId, roomId)) {
            return null;
        }
        LocalDate today = LocalDate.now(TENANCY_ZONE);
        if (startDate == null || startDate.isBefore(today)) {
            throw new ValidationException("Room has no available vacancy");
        }
        FutureVacancies.Claim claim = futureVacancies.claim(propertyId, roomId, startDate, today);
        if (claim == null) {
            throw new ValidationException("Room has no available vacancy on the selected start date");
        }
        return claim;
    }

    @Transactional(readOnly = true)
    public IdCheckedParticulars findIdCheckedParticulars(UUID tenancyId) {
        return tenancyRepository.findById(tenancyId)
                .map(tenancy -> new IdCheckedParticulars(
                        tenancy.getIdCheckedGender(), tenancy.getIdCheckedDateOfBirth()))
                .orElse(IdCheckedParticulars.NONE);
    }

    /** Full-room beds the owner can book ahead, for the onboarding room picker. */
    @Transactional(readOnly = true)
    public List<FutureVacancies.UpcomingVacancy> listUpcomingVacancies(UUID actorUserId, UUID propertyId) {
        tenancyAccessPolicy.ensureCanCreateTenancy(actorUserId, propertyId);
        return futureVacancies.upcoming(propertyId, LocalDate.now(TENANCY_ZONE));
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
            LocalDate startDate, LocalDate plannedEndDate,
            IdCheckDeclarationInput idCheck) {
        return createInternal(
                actorUserId, tenantPhone, tenantName, propertyId, roomId,
                billingType, rentAmountPaise, depositAmountPaise, startDate, plannedEndDate, false,
                idCheck);
    }

    /**
     * Shared creation body. With {@code holdForAcceptance} the tenancy is saved
     * as {@code PENDING_ACCEPTANCE}. A currently free bed is held immediately;
     * a booked room-change bed is not occupied until the move executes. The
     * user is not marked an active tenant and billing does not initialize yet.
     */
    private Tenancy createInternal(
            UUID actorUserId,
            String tenantPhone,
            String tenantName,
            UUID propertyId,
            UUID roomId,
            TenancyBillingType billingType,
            Long rentAmountPaise,
            Long depositAmountPaise,
            LocalDate startDate, LocalDate plannedEndDate,
            boolean holdForAcceptance,
            IdCheckDeclarationInput idCheck) {

        tenancyAccessPolicy.ensureCanCreateTenancy(actorUserId, propertyId);
        TenancyBillingType resolvedBillingType = billingType != null ? billingType : TenancyBillingType.MONTHLY;

        // Daily stays no longer come through here. They create no account at
        // all, so every line below this — provisioning a user, checking whether
        // that user is already a tenant, marking them one — is meaningless for
        // them. They go through onboardDailyGuest instead.
        if (resolvedBillingType == TenancyBillingType.DAILY) {
            throw new ValidationException("Daily stays are onboarded as guest records, not accounts");
        }

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
                .orElseThrow(() -> new NotFoundException("User", tenantId));
        if (tenantUser.activeTenant()) {
            throw new ValidationException("User already has an active tenancy");
        }

        if (!tenancyRepository.findActiveByUserId(tenantId).isEmpty()) {
            throw new ValidationException("User already has an active tenancy");
        }

        FutureVacancies.Claim claim = futureVacancyClaim(propertyId, roomId, startDate);

        Tenancy tenancy = createMonthlyTenancy(
                tenantId,
                propertyId,
                roomId,
                actorUserId,
                rentAmountPaise,
                depositAmountPaise,
                startDate,
                plannedEndDate);

        if (holdForAcceptance) {
            tenancy.markPendingAcceptance();
        }
        if (claim != null) {
            if (!holdForAcceptance) {
                throw new ValidationException("Booking a bed ahead requires a monthly agreement");
            }
            if (claim.roomChangeRequestId() != null) {
                tenancy.claimFutureVacancy(claim.roomChangeRequestId());
            } else {
                tenancy.claimDepartingStay(claim.departingTenancyId());
            }
        }

        // Stamped before the save and the started event: the declaration is part of
        // the onboarding record, not an afterthought applied to it.
        if (idCheck != null && idCheck.confirmed()) {
            tenancy.confirmIdCheck(
                    actorUserId, Instant.now(), idCheck.documentType(), idCheck.lastFour(),
                    idCheck.gender(), idCheck.dateOfBirth());
        }

        tenancy = tenancyRepository.save(tenancy);
        if (!holdForAcceptance && claim == null) {
            authModule.markActiveTenant(tenancy.getUserId());
            billingModule.initializeStartedTenancy(actorUserId, TenancyResponse.from(tenancy));
        }

        eventPublisher.publishEvent(new TenancyStartedEvent(
                tenancy.getId(),
                tenancy.getUserId(),
                actorUserId,
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                tenancy.getStartDate(),
                // The event starts the agreement/notification workflow. A future
                // booking does not take physical occupancy at creation.
                holdForAcceptance,
                claim != null));

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
    public TenantLookupResponse lookupTenant(String tenantPhone, UUID propertyId) {
        return authModule.findByPhone(tenantPhone)
                .map(user -> {
                    if (user.role() != com.khatiyan.a_auth.model.UserRole.USER) {
                        return TenantLookupResponse.existing(user.fullName(), false, false,
                                "This phone belongs to a non-tenant account.", null);
                    }
                    // Managers hold the USER role, so the check above does not
                    // catch them. Without this the wizard says "a new tenancy
                    // will be added" and only fails at creation, after every
                    // field has been filled in.
                    if (propertyId != null
                            && propertyModule.findActiveManagerUserIds(propertyId).contains(user.id())) {
                        return TenantLookupResponse.existing(user.fullName(), false, false,
                                "This person manages this property and cannot also be a tenant here.", null);
                    }
                    if (user.activeTenant()) {
                        return TenantLookupResponse.existing(user.fullName(), true, false,
                                "This user already has an active tenancy.", null);
                    }
                    // Prefill only on the path that can actually proceed. A
                    // refused lookup has no form to fill, and sending someone's
                    // address alongside "this person manages the property" would
                    // hand it over for no reason at all.
                    return TenantLookupResponse.existing(user.fullName(), false, true,
                            "Existing user - a new tenancy will be added.", prefillFor(user.id()));
                })
                .orElseGet(() -> TenantLookupResponse.newUser("An account will be created."));
    }

    /**
     * What this account already holds, for the onboarding form to prefill.
     *
     * <p>Read through the identity facade rather than the user summary, because
     * a permanent address and a date of birth are not things the summary should
     * be carrying to every screen that names a person.
     */
    private TenantLookupResponse.TenantPrefill prefillFor(UUID userId) {
        return authModule.findIdentity(userId)
                .map(identity -> new TenantLookupResponse.TenantPrefill(
                        identity.permanentAddress(),
                        identity.permanentAddressPincode(),
                        identity.dateOfBirth(),
                        identity.gender()))
                .orElse(null);
    }

    /**
     * Admin onboarding for a daily stay. Creates no account.
     *
     * <p>Somebody staying two nights should not have to install an app, set a
     * PIN and keep a login they will never open again, so nothing here
     * provisions a user. The guest's details go onto the tenancy row the way a
     * hotel register holds them, and the stay is management-side from end to
     * end: the owner raises the bill and marks it paid, and a concern or a
     * request is handled in person.
     *
     * <p>Monthly stays never come through here. That tenant signs an agreement
     * and lives in the app for months, so they go through
     * {@link #onboardPending} and get a real account.
     */
    @Transactional
    public TenancyOnboardingResponse onboardDailyGuest(
            UUID actorUserId,
            UUID propertyId,
            UUID roomId,
            LocalDate startDate,
            LocalDate plannedEndDate,
            GuestDetails guest,
            IdCheckDeclarationInput idCheck) {
        if (guest == null) {
            throw new ValidationException("Guest details are required for a daily stay");
        }

        // Same canonical form an account phone gets. Without this the guest path
        // stored whatever was typed, so a guest's number came back as ten bare
        // digits while every account tenant's carried +91 — and the screens that
        // print the stored value showed a country code for one and none for the
        // other. The onboarding form asks for the number under a +91 flag either
        // way, so the code was always part of what the person entered.
        guest = guest.withPhone(authModule.normalizePhone(guest.phone()));

        tenancyAccessPolicy.ensureCanCreateTenancy(actorUserId, propertyId);

        if (!propertyModule.hasAvailableVacancy(propertyId, roomId)) {
            throw new ValidationException("Room has no available vacancy");
        }

        Tenancy tenancy = createDailyGuestTenancy(
                propertyId, roomId, actorUserId, startDate, plannedEndDate, guest);

        // Stamped before the save and the started event, for the same reason it
        // is on the account path: the declaration is part of the onboarding
        // record rather than something applied to it afterwards.
        if (idCheck != null && idCheck.confirmed()) {
            tenancy.confirmIdCheck(
                    actorUserId, Instant.now(), idCheck.documentType(), idCheck.lastFour(),
                    idCheck.gender(), idCheck.dateOfBirth());
        }

        tenancy = tenancyRepository.save(tenancy);
        billingModule.initializeStartedTenancy(actorUserId, TenancyResponse.from(tenancy));

        // Published with a null userId. Listeners that reserve the bed and write
        // the owner's activity feed still need it; the one that notifies a
        // tenant checks for the account and finds none, which is the right
        // answer rather than a missing one.
        eventPublisher.publishEvent(new TenancyStartedEvent(
                tenancy.getId(),
                null,
                actorUserId,
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                tenancy.getStartDate(),
                // A guest stay begins the moment it is booked. There is nothing
                // to sign and nothing to wait for.
                false,
                false));

        log.info(
                "Daily guest stay created tenancyId={} actorUserId={} propertyId={} roomId={} startDate={} plannedEndDate={}",
                tenancy.getId(),
                actorUserId,
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                tenancy.getStartDate(),
                tenancy.getPlannedEndDate());

        // Never an account, so never a new one to announce.
        return new TenancyOnboardingResponse(false, TenancyResponse.from(tenancy));
    }

    /**
     * Agreement-path onboarding: creates a monthly tenancy held as
     * {@code PENDING_ACCEPTANCE}. For a future room-change booking, the
     * agreement is sent now, while occupancy and billing wait for both its
     * signature and the chosen start date.
     */
    @Transactional
    public TenancyOnboardingResponse onboardPending(
            UUID actorUserId,
            String tenantPhone,
            String tenantName,
            UUID propertyId,
            UUID roomId,
            Long rentAmountPaise,
            Long depositAmountPaise,
            LocalDate startDate,
            IdCheckDeclarationInput idCheck) {
        boolean existedBefore = authModule.findByPhone(tenantPhone).isPresent();

        Tenancy tenancy = createInternal(
                actorUserId, tenantPhone, tenantName, propertyId, roomId,
                TenancyBillingType.MONTHLY, rentAmountPaise, depositAmountPaise, startDate, null, true,
                idCheck);

        return new TenancyOnboardingResponse(!existedBefore, TenancyResponse.from(tenancy));
    }

    /**
     * Tenant accepted the agreement. An ordinary pending tenancy activates
     * immediately; a room-change booking becomes SCHEDULED until its date and
     * outgoing transfer complete. Billing runs as the onboarding manager.
     */
    @Transactional
    public Tenancy acceptTermsAndActivate(UUID tenancyId, UUID tenantUserId) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        if (!tenancy.getUserId().equals(tenantUserId)) {
            throw new ValidationException("Tenancy does not belong to current user");
        }

        tenancy.acceptTos();
        if (tenancy.getStatus() == TenancyStatus.SCHEDULED) {
            // Signing confirms the future booking now; the actual stay waits
            // for both its chosen date and the outgoing room change to execute.
            activateScheduledIfReady(tenancy, LocalDate.now(TENANCY_ZONE));
            return tenancy;
        }
        authModule.markActiveTenant(tenancy.getUserId());
        billingModule.initializeStartedTenancy(tenancy.getCreatedByUserId(), TenancyResponse.from(tenancy));

        // NOW it has started. The bed was taken at creation, so nothing
        // occupancy-related listens to this — only the people who need telling
        // that the waiting is over.
        eventPublisher.publishEvent(new TenancyActivatedEvent(
                tenancy.getId(),
                tenancy.getUserId(),
                tenancy.getCreatedByUserId(),
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                tenancy.getStartDate()));

        log.info(
                "Pending tenancy activated after agreement acceptance tenancyId={} userId={}",
                tenancy.getId(),
                tenancy.getUserId());

        return tenancy;
    }

    /** Due bookings are processed after approved room changes have run. */
    @Transactional(readOnly = true)
    public List<UUID> findDueScheduledIds(LocalDate today, int limit) {
        return tenancyRepository.findDueScheduledIds(today, PageRequest.of(0, Math.max(1, limit)));
    }

    /**
     * Starts a due booking whose bed has freed. One that should have started and
     * cannot is flagged instead: management is told once and the action center
     * lists it. It keeps waiting, and this run retries it every hour.
     */
    @Transactional
    public boolean activateScheduledBooking(UUID tenancyId, LocalDate today) {
        Tenancy tenancy = tenancyRepository.findByIdForUpdate(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        if (activateScheduledIfReady(tenancy, today)) {
            return true;
        }
        if (futureVacancies.isLate(tenancy, today)) {
            flagStartBlocked(tenancy);
        }
        return false;
    }

    /**
     * A booked room change failed its run. The booking cannot count on its date
     * any more, so management hears now, not on the start date. The move stays
     * approved and is retried.
     */
    @Transactional
    public void reportBookedMoveFailed(UUID roomChangeRequestId) {
        tenancyRepository.findFirstByFutureVacancySourceIdAndActiveTrue(roomChangeRequestId)
                .ifPresent(this::flagStartBlocked);
    }

    /**
     * Bookings flagged as unable to start whose bed is still not free, for the
     * action center. One drops off the moment its bed frees.
     */
    @Transactional(readOnly = true)
    public List<BlockedBookingResponse> findBlockedBookings(UUID propertyId) {
        List<Tenancy> bookings = new ArrayList<>();
        List<FutureVacancies.Blocker> blockers = new ArrayList<>();
        for (Tenancy booking : tenancyRepository.findByPropertyIdAndActiveTrueAndStartBlockedAtIsNotNull(propertyId)) {
            if (booking.getStatus() != TenancyStatus.SCHEDULED
                    && booking.getStatus() != TenancyStatus.PENDING_ACCEPTANCE) {
                continue;
            }
            FutureVacancies.Blocker blocker = futureVacancies.blocker(booking);
            if (blocker != null) {
                bookings.add(booking);
                blockers.add(blocker);
            }
        }
        if (bookings.isEmpty()) {
            return List.of();
        }

        List<UUID> userIds = new ArrayList<>();
        for (int i = 0; i < bookings.size(); i++) {
            userIds.add(bookings.get(i).getUserId());
            Tenancy blocking = blockers.get(i).blockingStay();
            if (blocking != null && blocking.getUserId() != null) {
                userIds.add(blocking.getUserId());
            }
        }
        Map<UUID, UserSummaryResponse> users = authModule.findByIds(userIds);

        List<BlockedBookingResponse> blocked = new ArrayList<>();
        for (int i = 0; i < bookings.size(); i++) {
            Tenancy booking = bookings.get(i);
            Tenancy blocking = blockers.get(i).blockingStay();
            blocked.add(new BlockedBookingResponse(
                    booking.getId(),
                    nameOf(users, booking.getUserId()),
                    booking.getRoomId(),
                    booking.getStartDate(),
                    blockers.get(i).reason(),
                    blocking == null ? null : blocking.getId(),
                    blocking == null ? null : nameOf(users, blocking.getUserId())));
        }
        return blocked;
    }

    private static String nameOf(Map<UUID, UserSummaryResponse> users, UUID userId) {
        UserSummaryResponse user = userId == null ? null : users.get(userId);
        return user == null ? null : user.fullName();
    }

    private void flagStartBlocked(Tenancy booking) {
        FutureVacancies.Blocker blocker = futureVacancies.blocker(booking);
        if (blocker == null || !booking.markStartBlocked(Instant.now())) {
            return;
        }
        eventPublisher.publishEvent(new FutureBookingBlockedEvent(
                booking.getId(),
                booking.getPropertyId(),
                booking.getRoomId(),
                booking.getStartDate(),
                blocker.reason(),
                blocker.blockingStay() == null ? null : blocker.blockingStay().getId()));
        log.warn("Future booking cannot start tenancyId={} roomId={} startDate={} reason={}",
                booking.getId(), booking.getRoomId(), booking.getStartDate(), blocker.reason());
    }

    private boolean activateScheduledIfReady(Tenancy tenancy, LocalDate today) {
        if (tenancy.getStatus() != TenancyStatus.SCHEDULED
                || !tenancy.hasFutureVacancyClaim()
                || tenancy.getStartDate().isAfter(today)) {
            return false;
        }
        if (!futureVacancies.bedFreed(tenancy)) {
            return false;
        }

        // Starts today if its bed freed late: never billed for nights it could not move in.
        tenancy.activateScheduled(today);
        authModule.markActiveTenant(tenancy.getUserId());
        billingModule.initializeStartedTenancy(tenancy.getCreatedByUserId(), TenancyResponse.from(tenancy));
        eventPublisher.publishEvent(new FutureBookingOccupancyEvent(tenancy.getPropertyId(), tenancy.getRoomId()));
        eventPublisher.publishEvent(new TenancyActivatedEvent(
                tenancy.getId(), tenancy.getUserId(), tenancy.getCreatedByUserId(),
                tenancy.getPropertyId(), tenancy.getRoomId(), tenancy.getStartDate()));
        return true;
    }

    /**
     * Stamps the accepted agreement's terms onto the tenancy.
     *
     * <p>Null months means indefinite. A fixed term derives its end date here,
     * so the tenancy carries its last day from the moment it starts.
     */
    @Transactional
    public void stampAgreementTerms(UUID tenancyId, Integer validityMonths, String earlyExitRule) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        tenancy.stampAgreementTerms(validityMonths, earlyExitRule);

        log.info(
                "Agreement terms stamped tenancyId={} validityMonths={} agreementEndDate={}",
                tenancyId,
                validityMonths,
                tenancy.getAgreementEndDate());
    }

    /**
     * Tenant declined the agreement: cancels the pending tenancy immediately.
     */
    @Transactional
    public void cancelPendingAsTenant(UUID tenancyId, UUID tenantUserId, String reason) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        if (!tenancy.getUserId().equals(tenantUserId)) {
            throw new ValidationException("Tenancy does not belong to current user");
        }
        cancelPendingInternal(tenancy, TenancyCancellationRoute.TENANT_DECLINED, tenantUserId, reason);
    }

    /**
     * Owner or manager withdraws a pending tenancy — the tenant backed out, or
     * was onboarded by mistake.
     *
     * <p>Only ever a PENDING one. {@code cancelPending} refuses any other
     * status, which is what keeps this from becoming a second, unaudited way to
     * end a live stay: a real tenancy has money and a deposit behind it and must
     * go through the end-tenancy settlement.
     */
    @Transactional
    public void cancelPendingAsManager(UUID actorUserId, UUID tenancyId, String reason) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        tenancyAccessPolicy.ensureCanManageStays(actorUserId, tenancy.getPropertyId());
        cancelPendingInternal(tenancy, TenancyCancellationRoute.MANAGEMENT_WITHDREW, actorUserId, reason);
    }

    /**
     * System cancellation of a pending tenancy (acceptance window expired).
     */
    @Transactional
    public void cancelPendingAsSystem(UUID tenancyId, String reason) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        cancelPendingInternal(tenancy, TenancyCancellationRoute.ACCEPTANCE_EXPIRED, null, reason);
    }

    // Cancels the pending tenancy and frees the reserved bed (the cancelled
    // event's BEFORE_COMMIT listener vacates the room). The user was never
    // marked an active tenant and billing never started, so nothing else needs
    // unwinding.
    private void cancelPendingInternal(
            Tenancy tenancy,
            TenancyCancellationRoute route,
            UUID actorUserId,
            String reason) {
        // A booking holds a bed only once its departure freed it; before that
        // there is nothing to release.
        boolean booking = tenancy.hasFutureVacancyClaim();
        boolean futureBedHeld = booking && futureVacancies.bedFreed(tenancy);
        tenancy.cancelPending(reason);
        eventPublisher.publishEvent(new TenancyCancelledEvent(
                tenancy.getId(),
                tenancy.getUserId(),
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                route,
                actorUserId,
                reason,
                !booking,
                futureBedHeld));

        log.info(
                "Pending tenancy cancelled tenancyId={} userId={} route={} reason={}",
                tenancy.getId(),
                tenancy.getUserId(),
                route,
                reason);
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

    private Tenancy createDailyGuestTenancy(
            UUID propertyId,
            UUID roomId,
            UUID actorUserId,
            LocalDate startDate,
            LocalDate plannedEndDate,
            GuestDetails guest) {
        if (plannedEndDate == null) {
            throw new ValidationException("Checkout date is required for a daily stay");
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

        return Tenancy.startDailyGuest(
                referenceCodeGenerator.nextCode("TEN"),
                propertyId,
                roomId,
                actorUserId,
                dailyRatePaise,
                startDate,
                plannedEndDate,
                guest);
    }

    @Transactional
    public void end(UUID actorUserId, UUID tenancyId, LocalDate endDate, String reason) {
        // Not getActiveTenancy: a stay past its checkout (PENDING_EXIT) is
        // exactly the one waiting to be ended, and that getter refuses it.
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        if (!tenancy.isCurrentlyActive() && tenancy.getStatus() != TenancyStatus.PENDING_EXIT) {
            throw new ValidationException("Tenancy is not active");
        }
        tenancyAccessPolicy.ensureCanManageStays(actorUserId, tenancy.getPropertyId());
        billingModule.ensureLatestCyclePaidForExit(actorUserId, tenancyId);

        // A booking waiting on this bed, directly or through this stay's
        // approved move. Ending no longer refuses a booked mover: leaving frees
        // the bed as surely as moving does, and refusing it left a mover past
        // their checkout (who can no longer move) impossible to end at all.
        Tenancy waitingBooking = futureVacancies.bookingWaitingOn(tenancy);

        tenancy.end(endDate, reason);
        tenancyRepository.save(tenancy);

        eventPublisher.publishEvent(new TenancyEndedEvent(
                tenancy.getId(),
                tenancy.getUserId(),
                actorUserId,
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                endDate,
                waitingBooking != null));

        // Due already: the new tenant moves in now. Otherwise the bed stays
        // held and the hourly run starts the booking on its date.
        if (waitingBooking != null) {
            tenancyRepository.findByIdForUpdate(waitingBooking.getId())
                    .ifPresent(booking -> activateScheduledIfReady(booking, LocalDate.now(TENANCY_ZONE)));
        }

        // A guest stay has no account, so there is no active-tenant flag to
        // clear. Called unconditionally this reached findById(null), which
        // Spring Data throws on rather than returning an empty Optional — so
        // ending ANY daily guest stay failed with "The given id must not be
        // null" and the stay could never be closed.
        if (tenancy.hasTenantAccount()) {
            authModule.clearActiveTenant(tenancy.getUserId());
        }

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
        tenancyAccessPolicy.ensureCanManageStays(actorUserId, tenancy.getPropertyId());

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
        return transferRoom(actorUserId, tenancyId, newRoomId, transferDate, false);
    }

    @Transactional
    public Tenancy transferRoom(
            UUID actorUserId,
            UUID tenancyId,
            UUID newRoomId,
            LocalDate transferDate,
            boolean holdOldRoomForFutureBooking) {
        Tenancy tenancy = getActiveTenancy(tenancyId);
        UUID propertyId = tenancy.getPropertyId();
        UUID oldRoomId = tenancy.getRoomId();
        tenancyAccessPolicy.ensureCanManageRoomChanges(actorUserId, propertyId);
        if (!holdOldRoomForFutureBooking) {
            ensureNoPromisedDeparture(tenancy);
        }

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
                newRoom.baseRentPaise(),
                holdOldRoomForFutureBooking));

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

    /** Do not invalidate an approved outgoing move after its bed was sold forward. */
    private void ensureNoPromisedDeparture(Tenancy tenancy) {
        roomChangeRequestRepository.findOpenByTenancyId(
                tenancy.getId(), List.of(TenancyRoomChangeRequestStatus.APPROVED))
                .filter(request -> request.getCurrentRoomId().equals(tenancy.getRoomId()))
                .filter(request -> tenancyRepository.existsByFutureVacancySourceIdAndActiveTrue(request.getId()))
                .ifPresent(request -> {
                    throw new ValidationException(
                            "This room change already has a future tenant booked into the departing bed");
                });
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

    /**
     * Puts a tenancy back to ACTIVE after an approved exit was withdrawn.
     */
    @Transactional
    public void revertNotice(UUID tenancyId) {
        Tenancy tenancy = getActiveTenancy(tenancyId);
        tenancy.revertNotice();

        log.info("Tenancy notice reverted tenancyId={} userId={}", tenancy.getId(), tenancy.getUserId());
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
                .orElseThrow(() -> new NotFoundException("ActiveTenancy", userId));

        UserSummaryResponse user = authModule.findById(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));

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
                .orElseThrow(() -> new NotFoundException("ActiveTenancy", userId));

        return propertyModule.listActiveRoomsForProperty(tenancy.getPropertyId());
    }

    @Transactional(readOnly = true)
    public List<Tenancy> findActiveByPropertyId(UUID propertyId) {
        return tenancyRepository.findByPropertyIdAndActiveTrue(propertyId);
    }

    public TenancyResponse toResponse(Tenancy tenancy) {
        // Asked BEFORE the lookup, not handled after it. Spring Data throws
        // InvalidDataAccessApiUsageException on a null id rather than returning
        // an empty Optional, so `.orElse(null)` never got the chance to run — a
        // single daily guest in a property took down every list that mapped its
        // tenancies, the tenant-bills screen included.
        UserSummaryResponse user = tenancy.hasTenantAccount()
                ? authModule.findById(tenancy.getUserId()).orElse(null)
                : null;
        return TenancyResponse.from(tenancy, user);
    }

    @Transactional(readOnly = true)
    public Map<UUID, TenancyResponse> findByIds(Collection<UUID> tenancyIds) {
        if (tenancyIds == null || tenancyIds.isEmpty()) {
            return Collections.emptyMap();
        }

        List<Tenancy> tenancies = tenancyRepository.findAllById(tenancyIds);
        Map<UUID, UserSummaryResponse> users = authModule.findByIds(
                tenancies.stream()
                        .map(Tenancy::getUserId)
                        .filter(Objects::nonNull)
                        .toList());

        return tenancies.stream()
                .map(tenancy -> TenancyResponse.from(tenancy, users.get(tenancy.getUserId())))
                .collect(Collectors.toMap(TenancyResponse::id, Function.identity(), (left, right) -> left));
    }

    @Transactional(readOnly = true)
    public List<Tenancy> findInactiveByPropertyId(UUID propertyId) {
        return tenancyRepository.findByPropertyIdAndActiveFalse(propertyId);
    }

    /** Ended stays recent enough to change a this-month or last-month figure. */
    @Transactional(readOnly = true)
    public List<Tenancy> findInactiveEndedOnOrAfter(UUID propertyId, LocalDate endedOnOrAfter) {
        return tenancyRepository.findInactiveEndedOnOrAfter(propertyId, endedOnOrAfter);
    }

    @Transactional(readOnly = true)
    public List<Tenancy> findByPropertyId(UUID actorUserId, UUID propertyId) {
        tenancyAccessPolicy.ensureCanViewStays(actorUserId, propertyId);
        return tenancyRepository.findByPropertyId(propertyId);
    }

    @Transactional(readOnly = true)
    public PageResponse<TenancyResponse> listActiveForManagedProperty(
            UUID actorUserId,
            UUID propertyId,
            String query,
            TenancyStatus status,
            StayEnding ending,
            int page,
            int size) {
        return listPropertyTenancies(actorUserId, propertyId, true, query, status, ending, page, size);
    }

    @Transactional(readOnly = true)
    public PageResponse<TenancyResponse> listPastForManagedProperty(
            UUID actorUserId,
            UUID propertyId,
            String query,
            int page,
            int size) {
        return listPropertyTenancies(actorUserId, propertyId, false, query, null, null, page, size);
    }

    /**
     * Lists a managed property's tenancies, newest first, optionally filtered by a
     * free-text query matched against tenant name, tenancy reference code and
     * tenancy id, and by status or ending when one is given. The tenant name lives in the
     * auth module, so responses are built (with a batched name lookup) and
     * filtered in memory before paging.
     */
    private PageResponse<TenancyResponse> listPropertyTenancies(
            UUID actorUserId,
            UUID propertyId,
            boolean active,
            String query,
            TenancyStatus status,
            StayEnding ending,
            int page,
            int size) {
        tenancyAccessPolicy.ensureCanViewStays(actorUserId, propertyId);

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
                .filter(response -> matchesStatus(response.status(), status))
                .filter(response -> matchesEnding(response, ending, LocalDate.now(TENANCY_ZONE)))
                .toList();

        return PageResponse.of(responses, page, size);
    }

    /**
     * The owner's status filter on the stay list (user, 2026-09-30). ON_NOTICE
     * covers both notice kinds, because the app shows both as "On notice".
     */
    /**
     * The card's "Ends today" and "Ends soon" chips as a filter (user,
     * 2026-09-30), worked out from the one checkout date the way the card does.
     */
    private static boolean matchesEnding(TenancyResponse response, StayEnding ending, LocalDate today) {
        if (ending == null) {
            return true;
        }
        LocalDate checkout = response.checkoutDate();
        if (checkout == null) {
            return false;
        }
        return switch (ending) {
            case TODAY -> checkout.isEqual(today);
            case SOON -> checkout.isAfter(today) && !checkout.isAfter(today.plusDays(response.endingSoonLeadDays()));
        };
    }

    private static boolean matchesStatus(TenancyStatus actual, TenancyStatus wanted) {
        if (wanted == null) {
            return true;
        }
        if (wanted == TenancyStatus.ON_NOTICE) {
            return actual == TenancyStatus.ON_NOTICE || actual == TenancyStatus.ON_PREMATURE_NOTICE;
        }
        return actual == wanted;
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
