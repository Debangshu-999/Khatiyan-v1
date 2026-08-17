package com.khatiyan.d_modules.tenancy.service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.tenancy.api.dto.ApproveTenancyExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.EndTenancyRequest;
import com.khatiyan.d_modules.tenancy.api.dto.ExitCheckoutWindowResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyExitRequestResponse;
import com.khatiyan.d_modules.tenancy.event.TenancyExitApprovedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitCancelledEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitExecutedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitExpiredEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitRejectedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitRequestedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitWithdrawalDecidedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitWithdrawalRequestedEvent;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;
import com.khatiyan.d_modules.tenancy.repository.TenancyExitRequestRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Handles tenant exit request workflows.
 *
 * <p>
 * Normal notice exits are checked against the active billing cycle's rent
 * window. Premature exits are reviewed manually by owner/manager.
 */
@Slf4j
@Service
public class TenancyExitRequestService {

    /**
     * States that block a second exit request on the same tenancy.
     *
     * <p>WITHDRAWAL_REQUESTED belongs here: the exit is still live and the
     * tenancy still on notice while the owner decides. Omitting it would let a
     * tenant hold an approved exit, ask to withdraw it, and raise a fresh exit
     * alongside. Mirrors the partial unique index on the table.
     */
    private static final List<TenancyExitRequestStatus> OPEN_STATUSES = List.of(
            TenancyExitRequestStatus.REQUESTED,
            TenancyExitRequestStatus.APPROVED,
            TenancyExitRequestStatus.WITHDRAWAL_REQUESTED);

    /** Calendar dates follow the property's timezone, not the server's. */
    private static final ZoneId EXIT_ZONE = ZoneId.of("Asia/Kolkata");

    private final AuthModule authModule;
    private final ReferenceCodeGenerator referenceCodeGenerator;
    private final TenancyExitRequestRepository exitRequestRepository;
    private final TenancyRepository tenancyRepository;
    private final PropertyModule propertyModule;
    private final TenancyAccessPolicy tenancyAccessPolicy;
    private final BillingModule billingModule;
    private final TenancyService tenancyService;
    private final ApplicationEventPublisher eventPublisher;

    public TenancyExitRequestService(
            AuthModule authModule,
            ReferenceCodeGenerator referenceCodeGenerator,
            TenancyExitRequestRepository exitRequestRepository,
            TenancyRepository tenancyRepository,
            PropertyModule propertyModule,
            TenancyAccessPolicy tenancyAccessPolicy,
            @Lazy BillingModule billingModule,
            TenancyService tenancyService,
            ApplicationEventPublisher eventPublisher) {
        this.authModule = authModule;
        this.referenceCodeGenerator = referenceCodeGenerator;
        this.exitRequestRepository = exitRequestRepository;
        this.tenancyRepository = tenancyRepository;
        this.propertyModule = propertyModule;
        this.tenancyAccessPolicy = tenancyAccessPolicy;
        this.billingModule = billingModule;
        this.tenancyService = tenancyService;
        this.eventPublisher = eventPublisher;
    }

    /**
     * The dates a tenant may pick for leaving, given their property's notice
     * period and where they are in the billing cycle.
     *
     * <p>For whole-month notice the two bounds are the same date — the notice
     * lands on a cycle boundary by construction — so the window collapses to a
     * single choice. It is only the sub-month options that offer a real range.
     */
    @Transactional(readOnly = true)
    public ExitCheckoutWindowResponse getExitCheckoutWindow(UUID tenantUserId) {
        Tenancy tenancy = getTenantActiveTenancy(tenantUserId);
        BillingCycleResponse cycle = billingModule.getLatestMyCycle(tenantUserId);
        LocalDate today = LocalDate.now(EXIT_ZONE);

        TenancyExitRequest reRaised = findReRaisableRequest(tenancy.getId(), today, cycle);
        LocalDate anchor = reRaised != null ? reRaised.getNoticeAnchorDate() : today;
        NoticePeriod noticePeriod = propertyModule.getActiveProperty(tenancy.getPropertyId()).noticePeriod();

        return checkoutWindow(tenancy, cycle, noticePeriod, anchor, reRaised != null);
    }

    /**
     * The single exit route: a tenant serves notice and leaves.
     *
     * <p>Replaces the old split between "normal notice" and "premature", which
     * forced the tenant to know which state they were in — state they could not
     * see. Agreement early exits stay separate, because breaking a lock-in is a
     * different act from serving notice: it carries a penalty and is negotiated.
     *
     * <p>Lock-in remains an internal <em>pricing</em> branch, not a route. A
     * tenant still inside their lock-in owes the penalty however the date was
     * reached; one past it owes nothing. Notably a tenancy whose agreement ended
     * long ago is no longer pushed down a different path — {@code lockInEndDate}
     * is never cleared, so routing on its mere presence barred those tenants from
     * the ordinary route forever.
     *
     * @param chosenCheckoutDate the tenant's preferred last day, which must fall
     *                           inside the window; null takes the earliest, which
     *                           for whole-month notice is the only option anyway
     */
    @Transactional
    public TenancyExitRequestResponse requestExit(
            UUID tenantUserId,
            LocalDate chosenCheckoutDate,
            String reason) {
        Tenancy tenancy = getTenantActiveTenancy(tenantUserId);
        ensureNoOpenRequest(tenancy.getId());

        BillingCycleResponse cycle = billingModule.getLatestMyCycle(tenantUserId);
        LocalDate today = LocalDate.now(EXIT_ZONE);

        TenancyExitRequest reRaised = findReRaisableRequest(tenancy.getId(), today, cycle);
        if (reRaised == null) {
            ensureInsideNoticeWindow(today, cycle);
        }

        // The notice clock starts when the tenant first asked, not when the owner
        // got round to it. On a re-raise that is the original request's date, so
        // an owner who let a request lapse cannot shorten the notice served.
        LocalDate anchor = reRaised != null ? reRaised.getNoticeAnchorDate() : today;
        NoticePeriod noticePeriod = propertyModule.getActiveProperty(tenancy.getPropertyId()).noticePeriod();
        ExitCheckoutWindowResponse window = checkoutWindow(tenancy, cycle, noticePeriod, anchor, reRaised != null);

        LocalDate checkoutDate = chosenCheckoutDate != null ? chosenCheckoutDate : window.earliestCheckoutDate();
        ensureInsideCheckoutWindow(checkoutDate, window);

        // Leaving before the notice is served is allowed but is not the same act,
        // so it is recorded as PREMATURE. The tenant has not served their notice;
        // that is a fact about the request, not a reason to refuse it. Refusing
        // would leave anyone who has to move at short notice with no route, which
        // is exactly the dead end the old split created for non-agreement stays.
        boolean premature = window.isPrematureOn(checkoutDate);
        String referenceCode = referenceCodeGenerator.nextCode("TEX");
        TenancyExitRequest request = premature
                ? TenancyExitRequest.premature(
                        referenceCode,
                        tenancy.getId(),
                        tenancy.getUserId(),
                        tenancy.getPropertyId(),
                        tenancy.getRoomId(),
                        checkoutDate,
                        reason,
                        reRaised)
                : TenancyExitRequest.normalNotice(
                        referenceCode,
                        tenancy.getId(),
                        tenancy.getUserId(),
                        tenancy.getPropertyId(),
                        tenancy.getRoomId(),
                        checkoutDate,
                        reason,
                        reRaised);

        TenancyExitRequest saved = exitRequestRepository.save(request);
        log.info(
                "Tenancy exit requested requestId={} tenancyId={} checkoutDate={} noticePeriod={} anchor={} "
                        + "premature={} supersedes={}",
                saved.getId(), tenancy.getId(), checkoutDate, noticePeriod, anchor, premature,
                saved.getSupersededRequestId());
        publishExitRequested(saved);

        return TenancyExitRequestResponse.from(saved);
    }

    /**
     * Agreement tenant deliberately breaks their lock-in early.
     *
     * <p>Kept separate from {@link #requestExit} because it is not a routine
     * departure: it carries the early-exit penalty and is negotiated rather than
     * served. Gated on actually being <em>inside</em> the lock-in — previously it
     * was gated on merely having one, which trapped every tenant whose agreement
     * had already ended, since {@code lockInEndDate} is never cleared.
     *
     * <p>The end of an agreement is not the end of the tenancy. A tenant whose
     * term has run out simply continues, and uses {@link #requestExit} like
     * anyone else.
     */
    @Transactional
    public TenancyExitRequestResponse requestAgreementExit(
            UUID tenantUserId,
            LocalDate requestedCheckoutDate,
            String reason) {
        Tenancy tenancy = getTenantActiveTenancy(tenantUserId);
        if (requestedCheckoutDate == null || !requestedCheckoutDate.isAfter(LocalDate.now(EXIT_ZONE))) {
            throw new ValidationException("Requested checkout date must be in the future");
        }
        if (!tenancy.isWithinTerm(requestedCheckoutDate)) {
            throw new ValidationException(
                    "This date is not inside a lock-in period. Please raise an ordinary exit request instead.");
        }
        ensureNoOpenRequest(tenancy.getId());

        TenancyExitRequest request = TenancyExitRequest.premature(
                referenceCodeGenerator.nextCode("TEX"),
                tenancy.getId(),
                tenancy.getUserId(),
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                requestedCheckoutDate,
                reason,
                null);

        TenancyExitRequest saved = exitRequestRepository.save(request);
        log.info("Agreement early-exit requested requestId={} tenancyId={} checkoutDate={}",
                saved.getId(), tenancy.getId(), requestedCheckoutDate);
        publishExitRequested(saved);

        return TenancyExitRequestResponse.from(saved);
    }

    @Transactional
    public TenancyExitRequestResponse approve(UUID actorUserId, UUID requestId, ApproveTenancyExitRequest payload) {
        TenancyExitRequest request = getRequest(requestId);
        tenancyAccessPolicy.ensureCanManageExitRequests(actorUserId, request.getPropertyId());

        Tenancy tenancy = tenancyRepository.findById(request.getTenancyId())
                .orElseThrow(() -> new NotFoundException("Tenancy", request.getTenancyId()));

        // Approval fixes the tenant's date or it fixes nothing. It also re-checks
        // that the date is still ahead, because a request can sit here for days.
        LocalDate checkoutDate = resolveApprovedCheckoutDate(request, payload.approvedCheckoutDate());

        // Nothing is priced here any more. What an early exit costs is the
        // property's own policy — the owner's written rule for a fixed term, the
        // property's premature exit policy otherwise — and it is applied by a
        // person at the end-tenancy step, where the deposit and one-off bills
        // are both to hand. Approval only fixes the date.

        // Deposit settlement and final billing happen at the end-tenancy step,
        // not here. Approval fixes the checkout date and applies any penalty as a
        // line on the current unpaid bill, or a new one-off if that bill is paid.
        if (request.isNormalNotice()) {
            // No override branch: the approved date is the requested date, which
            // approveNormal already sets.
            request.approveNormal(actorUserId, null, null, null, payload.adminNotes());
            tenancyService.markOnNotice(request.getTenancyId(), request.getApprovedCheckoutDate());
        } else {
            request.approvePremature(
                    actorUserId,
                    checkoutDate,
                    null,
                    null,
                    null,
                    payload.adminNotes());
            tenancyService.markOnPrematureNotice(request.getTenancyId(), request.getApprovedCheckoutDate());
        }

        log.info(
                "Tenancy exit request approved requestId={} actorUserId={} checkoutDate={} shortenedByOwner={} "
                        + "withinTerm={}",
                requestId,
                actorUserId,
                checkoutDate,
                checkoutDate.isBefore(request.getRequestedCheckoutDate()),
                tenancy.isWithinTerm(request.getRequestedCheckoutDate()));
        publishExitApproved(request);
        return TenancyExitRequestResponse.from(request);
    }

    /**
     * Owner/manager rejects a pending exit request.
     */
    @Transactional
    public TenancyExitRequestResponse reject(UUID actorUserId, UUID requestId, String adminNotes) {
        TenancyExitRequest request = getRequest(requestId);
        tenancyAccessPolicy.ensureCanManageExitRequests(actorUserId, request.getPropertyId());

        request.reject(actorUserId, adminNotes);
        log.info("Tenancy exit request rejected requestId={} actorUserId={}", requestId, actorUserId);
        publishExitRejected(request);

        return TenancyExitRequestResponse.from(request);
    }

    /**
     * Tenant cancels their own pending request.
     */
    @Transactional
    public TenancyExitRequestResponse cancel(UUID tenantUserId, UUID requestId) {
        TenancyExitRequest request = getRequest(requestId);
        request.cancel(tenantUserId);

        log.info("Tenancy exit request cancelled requestId={} tenantUserId={}", requestId, tenantUserId);
        publishExitCancelled(request);
        return TenancyExitRequestResponse.from(request);
    }

    /**
     * Tenant asks to undo an exit that was already approved.
     *
     * <p>The tenancy deliberately stays on notice until the owner decides — an
     * approved exit is a commitment the owner may have acted on, so it is not
     * the tenant's alone to reverse.
     */
    @Transactional
    public TenancyExitRequestResponse requestWithdrawal(UUID tenantUserId, UUID requestId, String reason) {
        TenancyExitRequest request = getRequest(requestId);
        request.requestWithdrawal(tenantUserId, reason, LocalDate.now(EXIT_ZONE));

        log.info("Tenancy exit withdrawal requested requestId={} tenantUserId={}", requestId, tenantUserId);
        eventPublisher.publishEvent(new TenancyExitWithdrawalRequestedEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType(),
                request.getApprovedCheckoutDate()));

        return TenancyExitRequestResponse.from(request);
    }

    /**
     * Owner decides on a pending withdrawal.
     *
     * <p>Approving voids the exit and returns the tenancy to ACTIVE. Any cycles
     * the notice caused to be skipped need no repair: the skip never created a
     * row, and generation only skips cycles whose start is still in the future,
     * so the next daily run backfills any whose start has since passed.
     *
     * <p>Refusing leaves the exit approved and the checkout date untouched. The
     * owner needs no reason for that — the veto means only "no".
     */
    @Transactional
    public TenancyExitRequestResponse decideWithdrawal(
            UUID actorUserId,
            UUID requestId,
            boolean approved,
            String adminNotes) {
        TenancyExitRequest request = getRequest(requestId);
        tenancyAccessPolicy.ensureCanManageExitRequests(actorUserId, request.getPropertyId());

        if (approved) {
            request.approveWithdrawal(actorUserId, adminNotes);
            tenancyService.revertNotice(request.getTenancyId());
        } else {
            request.rejectWithdrawal(actorUserId, adminNotes);
        }

        log.info(
                "Tenancy exit withdrawal decided requestId={} actorUserId={} approved={}",
                requestId,
                actorUserId,
                approved);
        eventPublisher.publishEvent(new TenancyExitWithdrawalDecidedEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType(),
                approved,
                request.getApprovedCheckoutDate()));

        return TenancyExitRequestResponse.from(request);
    }

    /**
     * Finds requests left unreviewed past the review window.
     */
    @Transactional(readOnly = true)
    public List<UUID> findStaleRequestIds(Instant now, int limit) {
        int resolvedLimit = limit > 0 ? limit : 50;
        Instant cutoff = now.minus(Duration.ofDays(TenancyExitRequest.REVIEW_WINDOW_DAYS));

        return exitRequestRepository.findStaleForExpiryIds(
                TenancyExitRequestStatus.REQUESTED,
                cutoff,
                PageRequest.of(0, resolvedLimit));
    }

    /**
     * Expires one unreviewed request.
     *
     * <p>Changes nothing but the status. No notice is served, no cycle is
     * skipped, the tenancy is untouched — that inertness is the point, and it is
     * what makes running this unattended safe.
     */
    @Transactional
    public void expireStaleRequest(UUID requestId) {
        TenancyExitRequest request = getRequest(requestId);
        request.expire();

        log.info("Tenancy exit request expired unreviewed requestId={} tenancyId={}",
                requestId, request.getTenancyId());
        eventPublisher.publishEvent(new TenancyExitExpiredEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType()));
    }

    // Approved exits whose checkout has arrived are no longer executed on a
    // schedule. An exit carries assessments only a person can make — the
    // early-exit rule, damages, whether the deposit comes back — and a job
    // running at 00:10 would end the stay before anyone could make them,
    // silently skipping the entire exit policy. They surface instead as the
    // dashboard's upcomingExits / exitsPastDue counts, for a person to complete
    // on the end-tenancy screen.

    /**
     * The "End tenancy" action — the only way a stay ends.
     *
     * <p>Every exit runs through a person on the end-tenancy screen, because
     * every exit carries assessments only a person can make: what the early-exit
     * rule is worth in this case, what was damaged, whether the deposit comes
     * back. Nothing here can be inferred, so nothing here is automated.
     *
     * <p>The whole assessment is applied before the tenancy is marked ended, in
     * this one transaction. A deduction the deposit cannot cover aborts the exit
     * rather than ending a stay with the money half-moved.
     *
     * <p>A tenancy holding an approved exit request is ended through that request
     * so it is marked executed and the usual exit events fire; anything else with
     * a due end date is ended directly. The end date must already have arrived —
     * this never ends a tenancy early.
     */
    @Transactional
    public void endTenancyNow(UUID actorUserId, UUID tenancyId, EndTenancyRequest request) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        tenancyAccessPolicy.ensureCanManageStays(actorUserId, tenancy.getPropertyId());

        if (tenancy.getStatus() == TenancyStatus.EXITED || tenancy.getStatus() == TenancyStatus.EVICTED) {
            throw new ValidationException("Tenancy has already ended");
        }

        // Daily stays have no agreement term and no deposit, so the screen never
        // shows them an early-exit charge. Refuse one rather than apply a charge
        // to a stay whose agreement never promised it.
        if (tenancy.getBillingType() == TenancyBillingType.DAILY
                && request.earlyExitCharges() != null
                && !request.earlyExitCharges().isEmpty()) {
            throw new ValidationException("A daily stay has no agreement term to exit early from");
        }

        TenancyExitRequest approved = exitRequestRepository.findByTenancyId(tenancyId).stream()
                .filter(existing -> existing.getStatus() == TenancyExitRequestStatus.APPROVED)
                .findFirst()
                .orElse(null);
        if (approved != null) {
            executeApprovedRequest(actorUserId, approved, request);
            return;
        }

        // Active daily stays keep their checkout in plannedEndDate (endDate is only
        // stamped once a tenancy actually ends); monthly stays on notice carry it in
        // endDate. A plain active monthly stay has neither and must use the exit flow.
        LocalDate endDate = tenancy.getBillingType() == TenancyBillingType.DAILY
                ? tenancy.getPlannedEndDate()
                : tenancy.getEndDate();
        if (endDate == null) {
            throw new ValidationException("This tenancy must exit through the exit request workflow");
        }
        if (endDate.isAfter(LocalDate.now(EXIT_ZONE))) {
            throw new ValidationException("This tenancy cannot be ended before its end date");
        }

        // Dues first: the gate is what makes "a tenancy never ends owing money"
        // true, and it has to be checked before this step starts adding charges
        // of its own.
        billingModule.ensureLatestCyclePaidForExit(actorUserId, tenancyId);
        billingModule.applyExitPolicy(actorUserId, tenancyId, tenancy.getPropertyId(), request.toExitPolicy());

        tenancyService.end(actorUserId, tenancyId, endDate, "MANUAL_END");

        log.info("Tenancy ended manually tenancyId={} actorUserId={} endDate={} checklistConfirmed={}",
                tenancyId, actorUserId, endDate, checklistCount(request));
    }

    private static int checklistCount(EndTenancyRequest request) {
        return request.checklistConfirmed() != null ? request.checklistConfirmed().size() : 0;
    }

    @Transactional(readOnly = true)
    public List<TenancyExitRequestResponse> listMine(UUID tenantUserId) {
        return withNames(exitRequestRepository.findByTenantUserId(tenantUserId));
    }

    @Transactional(readOnly = true)
    public List<TenancyExitRequestResponse> listForTenancy(UUID actorUserId, UUID tenancyId) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        tenancyAccessPolicy.ensureCanViewExitRequests(actorUserId, tenancy.getPropertyId());

        return withNames(exitRequestRepository.findByTenancyId(tenancyId));
    }

    @Transactional(readOnly = true)
    public List<TenancyExitRequestResponse> listForProperty(UUID actorUserId, UUID propertyId) {
        tenancyAccessPolicy.ensureCanViewExitRequests(actorUserId, propertyId);

        return withNames(exitRequestRepository.findByPropertyId(propertyId));
    }

    private TenancyExitRequestResponse executeApprovedRequest(
            UUID actorUserId, TenancyExitRequest request, EndTenancyRequest endRequest) {
        tenancyAccessPolicy.ensureCanManageExitRequests(actorUserId, request.getPropertyId());

        if (request.getStatus() != TenancyExitRequestStatus.APPROVED) {
            throw new ValidationException("Only approved exit requests can be executed");
        }

        // IST, like every other calendar decision here. LocalDate.now() reads
        // the JVM default, so on a UTC server every exit between 00:00 and
        // 05:30 IST would be refused as "not due" on the day it is due.
        if (request.getApprovedCheckoutDate() == null
                || request.getApprovedCheckoutDate().isAfter(LocalDate.now(EXIT_ZONE))) {
            throw new ValidationException("Exit request is not due for execution");
        }

        billingModule.ensureLatestCyclePaidForExit(actorUserId, request.getTenancyId());
        billingModule.applyExitPolicy(
                actorUserId, request.getTenancyId(), request.getPropertyId(), endRequest.toExitPolicy());

        tenancyService.end(actorUserId, request.getTenancyId(), request.getApprovedCheckoutDate(),
                "TENANCY_EXIT_REQUEST");
        request.markExecuted();

        log.info("Tenancy exit request executed requestId={} actorUserId={}", request.getId(), actorUserId);
        publishExitExecuted(request);
        return TenancyExitRequestResponse.from(request);
    }

    private void publishExitRequested(TenancyExitRequest request) {
        eventPublisher.publishEvent(new TenancyExitRequestedEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType(),
                request.getRequestedCheckoutDate()));
    }

    private void publishExitApproved(TenancyExitRequest request) {
        eventPublisher.publishEvent(new TenancyExitApprovedEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType(),
                request.getApprovedCheckoutDate()));
    }

    private void publishExitRejected(TenancyExitRequest request) {
        eventPublisher.publishEvent(new TenancyExitRejectedEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType()));
    }

    private void publishExitCancelled(TenancyExitRequest request) {
        eventPublisher.publishEvent(new TenancyExitCancelledEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType()));
    }

    private void publishExitExecuted(TenancyExitRequest request) {
        eventPublisher.publishEvent(new TenancyExitExecutedEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType(),
                request.getApprovedCheckoutDate()));
    }

    private Tenancy getTenantActiveTenancy(UUID tenantUserId) {
        return tenancyRepository.findByUserIdAndActiveTrue(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancy", tenantUserId));
    }

    private TenancyExitRequest getRequest(UUID requestId) {
        return exitRequestRepository.findById(requestId)
                .orElseThrow(() -> new NotFoundException("TenancyExitRequest", requestId));
    }

    private void ensureNoOpenRequest(UUID tenancyId) {
        if (exitRequestRepository.findOpenByTenancyId(tenancyId, OPEN_STATUSES).isPresent()) {
            throw new ValidationException("Tenancy already has an open exit request");
        }
    }

    /**
     * Turns a notice period into the dates a tenant may leave on.
     *
     * <p>Two branches, because the two ranges mean different things.
     *
     * <p><b>Whole months — counted in cycles, not days.</b> The checkout is the
     * end of the cycle {@code N - 1} cycles after the current one: one month is
     * served by the cycle the request already sits in, since requests may only be
     * raised in the payment window at its start. So one month adds no cycles, two
     * adds one, three adds two. The result is a cycle boundary by construction —
     * no clamping step, and a partial cycle cannot arise. One month reproduces
     * the old behaviour exactly, so only two and three months are new paths.
     *
     * <p><b>Under a month — a minimum lead time, not a fixed date.</b> The tenant
     * may leave any day from {@code anchor + noticeDays} up to the end of the
     * current cycle. Both bounds sit inside that cycle, so again no extra cycles.
     * This is what makes the short options honest, and it is also what removes
     * the last policy question: under a fixed date the tenant would forfeit most
     * of a month they had already paid for, which would have needed a prorated
     * credit — and a credit can exceed the deposit it settles against. Letting
     * them choose the date means there is nothing to refund.
     *
     * <p>If a wide grace period pushes {@code earliest} past the cycle end, the
     * window collapses to {@code earliest} and the generation gate correctly
     * allows one more cycle. It degrades rather than breaks.
     */
    private ExitCheckoutWindowResponse checkoutWindow(
            Tenancy tenancy,
            BillingCycleResponse cycle,
            NoticePeriod noticePeriod,
            LocalDate anchor,
            boolean reRaise) {
        LocalDate earliestPossible = LocalDate.now(EXIT_ZONE).plusDays(1);

        // A fixed term has no notice to serve — its last day was agreed when the
        // tenancy started, so the window is that one date. Running notice
        // arithmetic here would compute a checkout the agreement already fixed,
        // and could push it past the day the tenancy ends.
        if (tenancy.hasFixedTerm()) {
            LocalDate termEnd = tenancy.getAgreementEndDate();
            return ExitCheckoutWindowResponse.of(
                    noticePeriod, anchor, termEnd, termEnd, earliestPossible, reRaise);
        }

        if (noticePeriod.isWholeMonths()) {
            LocalDate checkout = billingModule.periodEndAfterCycles(
                    tenancy.getId(), cycle.periodStartDate(), noticePeriod.extraCyclesBeyondCurrent());
            return ExitCheckoutWindowResponse.of(
                    noticePeriod, anchor, checkout, checkout, earliestPossible, reRaise);
        }

        LocalDate earliest = anchor.plusDays(noticePeriod.days());
        LocalDate latest = cycle.periodEndDate();
        if (earliest.isAfter(latest)) {
            latest = earliest;
        }

        return ExitCheckoutWindowResponse.of(
                noticePeriod, anchor, earliest, latest, earliestPossible, reRaise);
    }

    /**
     * The checkout date the approval settles on.
     *
     * <p>An owner may move it earlier but never later — a later date would hold
     * the tenant past the notice they served, making departure conditional on
     * permission, which notice periods exist to prevent.
     */
    /**
     * The date an approval fixes: the one the tenant asked for, always.
     *
     * <p>Approval used to accept an owner-chosen date and allow it to be pulled
     * earlier. That made the owner able to move someone's last day without
     * agreement — and with no lower bound it accepted today, or a date already
     * past, ending a tenancy retroactively. Bringing a date forward is a
     * negotiation, and a negotiation belongs in a new request from the tenant,
     * not in the approve button.
     *
     * <p>The date is re-checked here rather than trusted from the raise. A
     * request may sit unreviewed for days: one raised for tomorrow and approved
     * next week would otherwise fix a checkout in the past, which every step
     * downstream — notice, billing, the exit itself — reads as already due.
     */
    private LocalDate resolveApprovedCheckoutDate(TenancyExitRequest request, LocalDate ownerChoice) {
        return resolveApprovedCheckoutDate(
                request.getRequestedCheckoutDate(), ownerChoice, LocalDate.now(EXIT_ZONE));
    }

    /**
     * Static and package-private so the rule can be tested without standing up
     * the service, and against a date rather than the wall clock — the same
     * shape as {@code DepositManagerService.ensureDecidedAtExit}.
     */
    static LocalDate resolveApprovedCheckoutDate(LocalDate requested, LocalDate ownerChoice, LocalDate today) {
        if (ownerChoice != null && !ownerChoice.equals(requested)) {
            throw new ValidationException(
                    "The checkout date cannot be changed while approving. The tenant asked to leave on "
                            + requested + ". Reject this request if that date does not work.");
        }
        if (!requested.isAfter(today)) {
            throw new ValidationException(
                    "This request asked for " + requested
                            + ", which is no longer in the future. Reject it and ask the tenant to raise a new one.");
        }

        return requested;
    }

    /**
     * Bounds the chosen date.
     *
     * <p>Only the <em>upper</em> bound is a rule about notice — a later date would
     * run into a cycle the tenant has not been billed for. The lower bound is
     * merely "not in the past": leaving before the notice is served is permitted
     * and recorded as premature, not refused.
     */
    private void ensureInsideCheckoutWindow(LocalDate checkoutDate, ExitCheckoutWindowResponse window) {
        if (checkoutDate.isBefore(window.earliestPossibleDate())) {
            throw new ValidationException("Your last day has to be in the future.");
        }
        if (checkoutDate.isAfter(window.latestCheckoutDate())) {
            throw new ValidationException(
                    "The latest you can leave on this notice is " + window.latestCheckoutDate()
                            + ". A later date would run into the next billing cycle.");
        }
    }

    private void ensureInsideNoticeWindow(LocalDate today, BillingCycleResponse cycle) {
        if (today.isBefore(cycle.periodStartDate()) || today.isAfter(cycle.rentDueDate())) {
            throw new ValidationException("Normal exit request can only be raised inside the rent window");
        }
    }

    /**
     * The lapsed request this one re-raises, or null if this is an ordinary new
     * request that must obey the payment window.
     *
     * <p>Exit requests may normally only be raised in the payment window, which
     * is 3–4 days wide at the start of a cycle. A 5-day review window therefore
     * always closes after it — so a request that expires leaves the tenant
     * unable to try again for most of a month. An owner who simply ignores a
     * request would cost the tenant a full extra cycle, which is the same harm
     * as auto-rejecting, reached by doing nothing.
     *
     * <p>The carve-out: if the tenant's last request expired or was rejected,
     * they may re-raise outside the window, and the new request inherits the
     * original notice anchor so no notice time is lost. Three conditions bound
     * it — the lapse must be recent, and the re-raise must still be in the same
     * cycle, because from the next cycle the payment window reopens and the
     * ordinary route works again. Neither expiry nor rejection was the tenant's
     * doing; a cancellation was, so it does not qualify.
     */
    private TenancyExitRequest findReRaisableRequest(
            UUID tenancyId,
            LocalDate today,
            BillingCycleResponse cycle) {
        return exitRequestRepository.findLatestByTenancyId(tenancyId)
                .filter(previous -> previous.allowsReRaiseOn(today))
                .filter(previous -> isInsideCycle(previous.getNoticeAnchorDate(), cycle))
                .orElse(null);
    }

    /**
     * Whether the original notice anchor still sits in the cycle being billed.
     *
     * <p>This is what stops a stale anchor producing a checkout date in the
     * past. Once the cycle turns over, the anchor is history and the tenant
     * raises a fresh request through the reopened payment window.
     */
    private boolean isInsideCycle(LocalDate anchorDate, BillingCycleResponse cycle) {
        return !anchorDate.isBefore(cycle.periodStartDate()) && !anchorDate.isAfter(cycle.periodEndDate());
    }

    private LocalDate normalCheckoutDate(BillingCycleResponse cycle) {
        return cycle.periodEndDate();
    }

    private void ensurePrematureCheckoutBeforeCycleEnd(
            LocalDate requestedCheckoutDate,
            BillingCycleResponse cycle) {
        if (!requestedCheckoutDate.isBefore(cycle.periodEndDate())) {
            throw new ValidationException("Premature checkout date must be before the current billing cycle end date");
        }
    }

    /**
     * Maps requests to responses with tenant and decider names attached.
     *
     * <p>One batch lookup for the whole list rather than a query per row — a
     * property's exit history is read as a list far more often than one at a
     * time, and the ids repeat heavily across it.
     */
    private List<TenancyExitRequestResponse> withNames(List<TenancyExitRequest> requests) {
        Set<UUID> userIds = new HashSet<>();
        for (TenancyExitRequest request : requests) {
            userIds.add(request.getTenantUserId());
            if (request.getDecidedByUserId() != null) {
                userIds.add(request.getDecidedByUserId());
            }
            if (request.getWithdrawalDecidedByUserId() != null) {
                userIds.add(request.getWithdrawalDecidedByUserId());
            }
        }

        Map<UUID, String> names = authModule.findByIds(userIds).entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().fullName()));
        LocalDate today = LocalDate.now(EXIT_ZONE);

        return requests.stream()
                .map(request -> TenancyExitRequestResponse.from(request, today, names))
                .toList();
    }
}
