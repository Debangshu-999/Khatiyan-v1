package com.khatiyan.d_modules.tenancy;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.tenancy.api.dto.BlockedBookingResponse;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckDeclarationInput;
import com.khatiyan.d_modules.tenancy.api.dto.TransitionInput;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckedParticulars;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyExitRequestResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyOnboardingResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyRoomChangeRequestResponse;
import com.khatiyan.d_modules.tenancy.service.TenancyExitRequestService;
import com.khatiyan.d_modules.tenancy.service.TenancyRoomChangeRequestService;
import com.khatiyan.d_modules.tenancy.service.TenancyService;
import com.khatiyan.d_modules.tenancy.service.BookingBedInventory;
import com.khatiyan.d_modules.tenancy.api.dto.BookingBedHoldResponse;
import com.khatiyan.d_modules.tenancy.api.dto.BookingFutureVacancyResponse;

/**
 * Public facade for the tenancy module.
 *
 * <p>In this modular monolith, other modules should depend on this
 * class instead of importing tenancy services, repositories, or the
 * {@code Tenancy} entity directly. The facade exposes stable DTOs and
 * module-level questions such as "is this user currently a tenant of
 * this property?", while keeping tenancy internals free to evolve.
 */
@Component
public class TenancyModule {

    private final TenancyService tenancyService;
    private final TenancyExitRequestService tenancyExitRequestService;
    private final TenancyRoomChangeRequestService tenancyRoomChangeRequestService;
    private final BookingBedInventory bookingInventory;
    private final com.khatiyan.d_modules.tenancy.service.MoveInChecklistService moveInChecklists;

    // TenancyExitRequestService / TenancyRoomChangeRequestService transitively
    // depend on BillingModule, which depends back on TenancyModule
    // (BillingCycleService needs tenancy reads). @Lazy defers these edges so the
    // bean-init graph stays acyclic; the proxies resolve on first use, by which
    // point all beans exist.
    public TenancyModule(
            TenancyService tenancyService,
            @Lazy TenancyExitRequestService tenancyExitRequestService,
            @Lazy TenancyRoomChangeRequestService tenancyRoomChangeRequestService, BookingBedInventory bookingInventory) {
        this(tenancyService, tenancyExitRequestService, tenancyRoomChangeRequestService, bookingInventory, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public TenancyModule(
            TenancyService tenancyService,
            @Lazy TenancyExitRequestService tenancyExitRequestService,
            @Lazy TenancyRoomChangeRequestService tenancyRoomChangeRequestService, BookingBedInventory bookingInventory,
            com.khatiyan.d_modules.tenancy.service.MoveInChecklistService moveInChecklists) {
        this.moveInChecklists = moveInChecklists;
        this.tenancyService = tenancyService;
        this.tenancyExitRequestService = tenancyExitRequestService;
        this.tenancyRoomChangeRequestService = tenancyRoomChangeRequestService;
        this.bookingInventory = bookingInventory;
    }

    public List<BookingFutureVacancyResponse> bookingFutureVacancies(UUID propertyId, LocalDate minimum, LocalDate maximum) {
        return bookingInventory.futureVacancies(propertyId, minimum, maximum);
    }

    public BookingBedHoldResponse reserveBookingBed(UUID bookingId, UUID propertyId, UUID roomId,
            LocalDate moveInDate, UUID exitRequestId) {
        return bookingInventory.reserve(bookingId, propertyId, roomId, moveInDate, exitRequestId);
    }

    public boolean releaseBookingBed(UUID bookingId, UUID propertyId) {
        return bookingInventory.release(bookingId, propertyId);
    }

    /** Of these bookings, the ones whose bed is free for them now. One read for a page. */
    public java.util.Set<UUID> bookingBedsReady(java.util.Collection<UUID> bookingIds) {
        return bookingInventory.readyBookings(bookingIds);
    }

    public Optional<BookingBedHoldResponse> findBookingBed(UUID bookingId, UUID propertyId) {
        return bookingInventory.find(bookingId, propertyId);
    }

    /**
     * The bed a booking holds passes to the stay about to be created from it,
     * in the caller's transaction. Refused while the bed is still occupied.
     */
    public BookingBedHoldResponse consumeBookingBed(UUID bookingId, UUID propertyId) {
        return bookingInventory.consume(bookingId, propertyId);
    }

    /** A booking's move-in date moves to a later day. Its bed is kept. */
    public BookingBedHoldResponse moveBookingBedDate(UUID bookingId, UUID propertyId, LocalDate moveInDate) {
        return bookingInventory.moveDate(bookingId, propertyId, moveInDate);
    }

    /** A booking takes a bed that is free today in another room, in place of the one it held or waited for. */
    public BookingBedHoldResponse moveBookingBed(UUID bookingId, UUID propertyId, UUID roomId) {
        return bookingInventory.moveBed(bookingId, propertyId, roomId);
    }

    public Optional<TenancyResponse> findById(UUID tenancyId) {
        return tenancyService.findById(tenancyId)
            .map(tenancy -> TenancyResponse.from(tenancy));
    }

    public Map<UUID, TenancyResponse> findByIds(Collection<UUID> tenancyIds) {
        return tenancyService.findByIds(tenancyIds);
    }

    public Optional<TenancyResponse> findActiveByUserId(UUID userId) {
        return tenancyService.findActiveByUserId(userId)
            .map(tenancy -> TenancyResponse.from(tenancy));
    }

    public List<TenancyResponse> findActiveByPropertyId(UUID propertyId) {
        return tenancyService.findActiveByPropertyId(propertyId).stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    /** What the owner confirmed at a manual ID check: gender and date of birth, either may be null. */
    public IdCheckedParticulars findIdCheckedParticulars(UUID tenancyId) {
        return tenancyService.findIdCheckedParticulars(tenancyId);
    }

    /** Booked stays that cannot start because their bed is not free yet, for the action center. */
    public List<BlockedBookingResponse> findBlockedBookings(UUID propertyId) {
        return tenancyService.findBlockedBookings(propertyId);
    }

    public List<TenancyResponse> findInactiveByPropertyId(UUID propertyId) {
        return tenancyService.findInactiveByPropertyId(propertyId).stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    /**
     * Ended stays that ended on or after a date. For the owner dashboard, whose
     * figures reach back one month and no further.
     */
    public List<TenancyResponse> findInactiveEndedOnOrAfter(UUID propertyId, LocalDate endedOnOrAfter) {
        return tenancyService.findInactiveEndedOnOrAfter(propertyId, endedOnOrAfter).stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    public List<TenancyResponse> findActiveBillingStartedMonthlyTenancies() {
        return tenancyService.findActiveBillingStartedMonthlyTenancies().stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    public List<TenancyResponse> findActiveEndingBetween(LocalDate startDate, LocalDate endDate) {
        return tenancyService.findActiveEndingBetween(startDate, endDate).stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    /**
     * Exit requests for a property the actor manages. Used by the owner action
     * center to derive pending / upcoming / ending-today exit counts.
     */
    public List<TenancyExitRequestResponse> listPropertyExitRequests(UUID actorUserId, UUID propertyId) {
        return tenancyExitRequestService.listForProperty(actorUserId, propertyId);
    }

    /**
     * Room-change requests for a property the actor manages. Used by the owner
     * action center to derive the pending room-change count.
     */
    public List<TenancyRoomChangeRequestResponse> listPropertyRoomChangeRequests(UUID actorUserId, UUID propertyId) {
        return tenancyRoomChangeRequestService.listForProperty(actorUserId, propertyId);
    }

    /** Exit requests still live (requested, approved, or with a withdrawal pending), for the owner dashboard's counts. */
    public List<TenancyExitRequestResponse> listOpenPropertyExitRequests(UUID actorUserId, UUID propertyId) {
        return tenancyExitRequestService.listOpenForProperty(actorUserId, propertyId);
    }

    /** Room-change requests still waiting for a decision, for the owner dashboard's count. */
    public List<TenancyRoomChangeRequestResponse> listPendingPropertyRoomChangeRequests(UUID actorUserId, UUID propertyId) {
        return tenancyRoomChangeRequestService.listPendingForProperty(actorUserId, propertyId);
    }

    public boolean isUserTenantOfProperty(UUID userId, UUID propertyId) {
        return tenancyService.isUserTenantOfProperty(userId, propertyId);
    }

    public boolean hasActiveTenancyForRoom(UUID roomId) {
        return tenancyService.hasActiveTenancyForRoom(roomId);
    }

    public long countActiveTenanciesForRoom(UUID roomId) {
        return tenancyService.countActiveTenanciesForRoom(roomId);
    }

    public void markBillingStarted(UUID tenancyId) {
        tenancyService.markBillingStarted(tenancyId);
    }

    // ---- Agreement (compliance) lifecycle -------------------------------
    // Compliance orchestrates agreement-gated onboarding through these; the
    // tenancy module stays ignorant of agreements themselves.

    /**
     * Onboards a monthly tenancy held as {@code PENDING_ACCEPTANCE}: bed
     * reserved, user not yet an active tenant, billing deferred to acceptance.
     */
    public TenancyOnboardingResponse onboardPendingMonthly(
            UUID actorUserId,
            String tenantPhone,
            String tenantName,
            UUID propertyId,
            UUID roomId,
            Long rentAmountPaise,
            Long depositAmountPaise,
            LocalDate startDate,
            IdCheckDeclarationInput idCheck) {
        return tenancyService.onboardPending(
                actorUserId, tenantPhone, tenantName, propertyId, roomId,
                rentAmountPaise, depositAmountPaise, startDate, idCheck);
    }

    /**
     * {@link #onboardPendingMonthly} for a person already living here
     * (2026-10-28): carried over with their move-in date, dues and deposit.
     * The deed signed in the app still waits for them.
     */
    public TenancyOnboardingResponse onboardPendingExisting(
            UUID actorUserId,
            String tenantPhone,
            String tenantName,
            UUID propertyId,
            UUID roomId,
            Long rentAmountPaise,
            Long depositHeldPaise,
            LocalDate firstBillOn,
            IdCheckDeclarationInput idCheck,
            TransitionInput transition) {
        return tenancyService.onboardPending(
                actorUserId, tenantPhone, tenantName, propertyId, roomId,
                rentAmountPaise, depositHeldPaise, firstBillOn, idCheck, transition);
    }

    /**
     * A person already living here whose paper agreement carries over
     * (2026-10-28): no deed to sign, so the stay starts now and billing begins
     * on its first Khatiyan bill.
     */
    public TenancyOnboardingResponse onboardExistingOnPaper(
            UUID actorUserId,
            String tenantPhone,
            String tenantName,
            UUID propertyId,
            UUID roomId,
            Long rentAmountPaise,
            Long depositHeldPaise,
            LocalDate firstBillOn,
            IdCheckDeclarationInput idCheck,
            TransitionInput transition) {
        return tenancyService.onboardExistingOnPaper(
                actorUserId, tenantPhone, tenantName, propertyId, roomId,
                rentAmountPaise, depositHeldPaise, firstBillOn, idCheck, transition);
    }

    /** Activates a pending tenancy after the tenant accepted the agreement. */
    public TenancyResponse acceptTermsAndActivate(UUID tenancyId, UUID tenantUserId) {
        return TenancyResponse.from(tenancyService.acceptTermsAndActivate(tenancyId, tenantUserId));
    }

    /**
     * Stamps the accepted agreement's lock-in / early-exit terms onto the
     * tenancy. Penalty type is a String so compliance stays clear of the tenancy
     * model enum.
     */
    /**
     * Stamps the accepted agreement's terms onto the tenancy.
     *
     * <p>Null {@code validityMonths} means indefinite; a value gives the fixed
     * term whose end date the tenancy derives and carries from day one.
     */
    public void stampAgreementTerms(UUID tenancyId, Integer validityMonths, String earlyExitRule) {
        tenancyService.stampAgreementTerms(tenancyId, validityMonths, earlyExitRule);
    }

    /** Cancels a pending tenancy because the tenant declined the agreement. */
    public void declinePendingTenancy(UUID tenancyId, UUID tenantUserId, String reason) {
        tenancyService.cancelPendingAsTenant(tenancyId, tenantUserId, reason);
    }

    /** Cancels a pending tenancy whose acceptance window expired. */
    public void cancelPendingTenancyBySystem(UUID tenancyId, String reason) {
        tenancyService.cancelPendingAsSystem(tenancyId, reason);
    }

    /** Owner/manager withdraws a tenancy the tenant never accepted. */
    public void cancelPendingTenancyByManager(UUID actorUserId, UUID tenancyId, String reason) {
        tenancyService.cancelPendingAsManager(actorUserId, tenancyId, reason);
    }

    /** Records the move-in checklist with a stay at onboarding (2026-10-29). */
    public void recordMoveInChecklist(UUID tenancyId, UUID recordedBy,
            com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistInput input) {
        moveInChecklists.record(tenancyId, recordedBy, input);
    }

    /** The stay's own move-out checklist, set at onboarding (2026-10-29). */
    public void setMoveOutChecklist(UUID tenancyId, java.util.List<String> items) {
        tenancyService.setMoveOutChecklist(tenancyId, items);
    }

    /** The stay a booking was converted into: management cannot remove it while pending (2026-10-29). */
    public void markFromBooking(UUID tenancyId) {
        tenancyService.markFromBooking(tenancyId);
    }
}
