package com.khatiyan.d_modules.billing.service;

import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.event.PaymentClaimRaisedEvent;
import com.khatiyan.d_modules.billing.event.PaymentClaimRejectedEvent;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.billing.model.PaymentIntent;
import com.khatiyan.d_modules.billing.model.PaymentIntentStatus;
import com.khatiyan.d_modules.billing.model.PropertyPaymentDetails;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.billing.repository.PaymentIntentRepository;
import java.util.stream.Collectors;

import com.khatiyan.d_modules.billing.api.dto.PayeeDetailsResponse;
import com.khatiyan.d_modules.billing.api.dto.PaymentIntentDigestResponse;
import com.khatiyan.d_modules.billing.api.dto.PaymentIntentResponse;
import com.khatiyan.d_modules.billing.api.dto.RecordManualPaymentRequest;
import com.khatiyan.d_modules.billing.api.dto.TenantPaymentStateResponse;
import com.khatiyan.d_modules.billing.repository.PropertyPaymentDetailsRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * The tenant's payment claim, from link to verdict.
 *
 * <p>
 * <b>No money moves through this app.</b> We build a {@code upi://pay} link, the
 * tenant's own banking app pays the owner directly, and this records what was
 * claimed and what the owner decided against their own bank statement. That is
 * the whole reason this is buildable while the gateway module stays parked — we
 * never hold funds, so the Payment Aggregator rules do not reach us.
 *
 * <p>
 * <b>Nothing here counts money.</b> A claim moves a bill to
 * {@code CONFIRMATION_PENDING}, which no collected figure includes, so a
 * rejection has nothing to unwind — it puts the status back and every screen
 * recomputes. Only an owner's approval marks the bill paid, and it does that by
 * going through the ordinary manual-payment path rather than a second one of its
 * own.
 */
@Slf4j
@Service
public class PaymentIntentService {

    /** The two states that block a fresh attempt. */
    /**
     * Month boundaries are Indian ones, like every other month filter here.
     * The server's own zone would move a late-night claim into the wrong month
     * for everyone reading it.
     */
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    /**
     * The only claim states an owner is entitled to see.
     *
     * <p>
     * A CREATED attempt was opened and never answered; a TENANT_CANCELLED one
     * was answered "it did not go through". Neither was ever submitted to the
     * owner, and both are ordinary things that happen while someone is standing
     * in front of a UPI app — a tenant fumbling a payment three times is their
     * business, not a record for their landlord to read. Enforced here rather
     * than in the client, so the rows never leave the server.
     */
    private static final Set<PaymentIntentStatus> OWNER_VISIBLE = Set.of(
            PaymentIntentStatus.TENANT_CONFIRMED,
            PaymentIntentStatus.OWNER_VERIFIED,
            PaymentIntentStatus.OWNER_REJECTED);

    /** A claim the owner has finished with, either way. */
    private static final Set<PaymentIntentStatus> RESOLVED =
            Set.of(PaymentIntentStatus.OWNER_VERIFIED, PaymentIntentStatus.OWNER_REJECTED);

    private static final Set<PaymentIntentStatus> LIVE =
            Set.of(PaymentIntentStatus.CREATED, PaymentIntentStatus.TENANT_CONFIRMED);

    private final PaymentIntentRepository paymentIntentRepository;
    private final PropertyPaymentDetailsRepository paymentDetailsRepository;
    private final BillingCycleRepository billingCycleRepository;
    private final BillingCycleService billingCycleService;
    private final BillingAccessPolicy billingAccessPolicy;
    private final ApplicationEventPublisher eventPublisher;

    public PaymentIntentService(
            PaymentIntentRepository paymentIntentRepository,
            PropertyPaymentDetailsRepository paymentDetailsRepository,
            BillingCycleRepository billingCycleRepository,
            BillingCycleService billingCycleService,
            BillingAccessPolicy billingAccessPolicy,
            ApplicationEventPublisher eventPublisher) {
        this.paymentIntentRepository = paymentIntentRepository;
        this.paymentDetailsRepository = paymentDetailsRepository;
        this.billingCycleRepository = billingCycleRepository;
        this.billingCycleService = billingCycleService;
        this.billingAccessPolicy = billingAccessPolicy;
        this.eventPublisher = eventPublisher;
    }

    // ---- Tenant side -----------------------------------------------------

    /**
     * Opens an attempt and returns the link to fire.
     *
     * <p>
     * Refuses if one is already live. That is also enforced by a partial unique
     * index, which is the real guarantee — this is the readable message.
     */
    @Transactional
    public PaymentIntentWithLink startPayment(UUID tenantUserId, UUID billingCycleId) {
        BillingCycle cycle = billingCycleRepository.findByIdForTenant(billingCycleId, tenantUserId)
                .orElseThrow(() -> new NotFoundException("BillingCycle", billingCycleId));

        if (cycle.isPaid()) {
            throw new ValidationException("This bill is already paid.");
        }
        if (cycle.isCancelled()) {
            throw new ValidationException("This bill was cancelled.");
        }
        if (liveIntentFor(billingCycleId).isPresent()) {
            throw new ValidationException("There is already a payment in progress for this bill.");
        }

        PropertyPaymentDetails details = paymentDetailsRepository.findById(cycle.getPropertyId())
                .orElse(null);
        if (details == null || !details.canAcceptUpi()) {
            throw new ValidationException(
                    "This property has not set up online payment yet. Please pay them directly.");
        }

        PaymentIntent intent = paymentIntentRepository.save(PaymentIntent.open(
                cycle.getId(),
                cycle.getPropertyId(),
                cycle.getTenancyId(),
                tenantUserId,
                cycle.getTotalAmountPaise(),
                cycle.getReferenceCode(),
                details.getUpiVpa()));

        // Only when there is an address to pay to. A property offering just a QR
        // is perfectly able to receive money — the tenant scans it — and there is
        // simply no link to fire in that case.
        String link = details.canBuildPayLink()
                ? UpiDeepLink.build(
                        details.getUpiVpa(),
                        details.getPayeeName(),
                        cycle.getTotalAmountPaise(),
                        cycle.getReferenceCode())
                : null;

        log.info(
                "Payment intent opened intentId={} billingCycleId={} tenantUserId={} amountPaise={}",
                intent.getId(), billingCycleId, tenantUserId, cycle.getTotalAmountPaise());

        return new PaymentIntentWithLink(intent, link, PayeeDetailsResponse.from(details));
    }

    /** The tenant says it did not go through. Frees the bill immediately. */
    @Transactional
    public PaymentIntent cancelByTenant(UUID tenantUserId, UUID intentId) {
        PaymentIntent intent = ownedByTenant(tenantUserId, intentId);
        intent.cancelByTenant();

        log.info("Payment intent cancelled by tenant intentId={} tenantUserId={}", intentId, tenantUserId);
        return intent;
    }

    /**
     * The tenant says the money is sent. The bill goes to the owner to check.
     *
     * <p>
     * Evidence is optional on purpose — see {@code PaymentIntent.confirmByTenant}.
     */
    @Transactional
    public PaymentIntent confirmByTenant(
            UUID tenantUserId,
            UUID intentId,
            String referenceText,
            String note,
            List<String> proofUrls) {
        PaymentIntent intent = ownedByTenant(tenantUserId, intentId);
        intent.confirmByTenant(referenceText, note, proofUrls);

        BillingCycle cycle = billingCycleRepository.findById(intent.getBillingCycleId())
                .orElseThrow(() -> new NotFoundException("BillingCycle", intent.getBillingCycleId()));
        // Not paid, and not counted anywhere. It only leaves the late-fee sweeps
        // behind, which is the freeze the owner's verification time needs.
        cycle.markConfirmationPending();

        eventPublisher.publishEvent(new PaymentClaimRaisedEvent(
                intent.getId(),
                cycle.getId(),
                intent.getPropertyId(),
                intent.getTenantUserId(),
                cycle.getTenantNameSnapshot(),
                intent.getReferenceCode(),
                intent.getAmountPaise(),
                intent.getTenantReferenceText(),
                intent.getProofImageUrls() != null && !intent.getProofImageUrls().isEmpty()));

        log.info(
                "Payment intent confirmed by tenant intentId={} billingCycleId={} hasReference={} proofCount={}",
                intentId, cycle.getId(), referenceText != null && !referenceText.isBlank(),
                proofUrls == null ? 0 : proofUrls.size());
        return intent;
    }

    // ---- Owner side ------------------------------------------------------

    /** How many claims are waiting — the Live Digest's number. */
    @Transactional(readOnly = true)
    public long countAwaitingReview(UUID propertyId) {
        return paymentIntentRepository.countByPropertyIdAndStatus(
                propertyId, PaymentIntentStatus.TENANT_CONFIRMED);
    }

    /**
     * The owner found it. The bill is paid, in the same transaction.
     *
     * <p>
     * Marked paid through {@link BillingCycleService#recordManualPayment} rather
     * than by flipping the status here: that path already validates the amount,
     * opens the first-cycle deposit account, writes the audit row and publishes
     * the paid event. A second way to mark a bill paid is a second way for the
     * two to disagree.
     */
    @Transactional
    public PaymentIntent verifyByOwner(UUID actorUserId, UUID intentId) {
        PaymentIntent intent = awaitingReview(actorUserId, intentId);
        BillingCycle cycle = cycleFor(intent);

        // Back to a payable state first. recordManualPayment refuses anything
        // that is not live, and CONFIRMATION_PENDING is not one of its cases —
        // this is the one place that transition is undone on the way to paid
        // rather than on the way back to unpaid.
        cycle.revertConfirmation();
        billingCycleRepository.saveAndFlush(cycle);

        intent.verifyByOwner(actorUserId);

        billingCycleService.recordManualPayment(
                actorUserId,
                cycle.getId(),
                new RecordManualPaymentRequest(
                        ManualPaymentMethod.UPI,
                        intent.getTenantReferenceText(),
                        intent.getProofImageUrls(),
                        paymentNoteFor(intent)));

        log.info(
                "Payment intent verified by owner intentId={} billingCycleId={} ownerUserId={}",
                intentId, cycle.getId(), actorUserId);
        return intent;
    }

    /**
     * The owner could not find it. The bill goes back to where it was.
     *
     * <p>
     * There is no metric to roll back. Nothing counted this bill while it waited
     * — every collected figure filters on PAID — so returning the status is the
     * whole reversal, and the dashboards and P&amp;L recompute from cycle state
     * on their next read.
     */
    @Transactional
    public PaymentIntent rejectByOwner(UUID actorUserId, UUID intentId) {
        PaymentIntent intent = awaitingReview(actorUserId, intentId);
        BillingCycle cycle = cycleFor(intent);

        intent.rejectByOwner(actorUserId);
        cycle.revertConfirmation();

        eventPublisher.publishEvent(new PaymentClaimRejectedEvent(
                intent.getId(),
                cycle.getId(),
                intent.getPropertyId(),
                intent.getTenantUserId(),
                intent.getReferenceCode(),
                intent.getAmountPaise(),
                actorUserId));

        log.info(
                "Payment intent rejected by owner intentId={} billingCycleId={} ownerUserId={}",
                intentId, cycle.getId(), actorUserId);
        return intent;
    }

    // ---- Reads used by the bill screens -----------------------------------

    /** The open attempt on one bill, if any. */
    @Transactional(readOnly = true)
    public Optional<PaymentIntent> liveIntentFor(UUID billingCycleId) {
        return paymentIntentRepository.findFirstByBillingCycleIdAndStatusIn(billingCycleId, LIVE);
    }

    /** Live attempts across many bills at once, for a list screen. */
    @Transactional(readOnly = true)
    public List<PaymentIntent> liveIntentsFor(List<UUID> billingCycleIds) {
        if (billingCycleIds.isEmpty()) {
            return List.of();
        }
        return paymentIntentRepository.findByBillingCycleIdInAndStatusIn(billingCycleIds, LIVE);
    }

    /**
     * A month of the claims this property's owner may see, newest first.
     *
     * <p>
     * Keyed on when the claim was RAISED, not on the bill it pays. A tenant who
     * settles September's rent in October raises an October claim — October is
     * the statement the owner will be holding, and matching against the statement
     * is the whole job this screen exists for.
     *
     * <p>
     * Scoped to {@link #OWNER_VISIBLE}: attempts the tenant abandoned or
     * withdrew are their own history, readable on their bill and nowhere else.
     */
    @Transactional(readOnly = true)
    public List<PaymentIntentResponse> listForOwnerMonth(UUID actorUserId, UUID propertyId, String month) {
        billingAccessPolicy.ensureOwnsPaymentVerification(actorUserId, propertyId);

        YearMonth window = parseMonth(month);
        List<PaymentIntent> intents = paymentIntentRepository
                .findByPropertyIdAndStatusInAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
                        propertyId, OWNER_VISIBLE, monthStart(window), monthStart(window.plusMonths(1)));
        return withTenantNames(intents);
    }

    /**
     * Projects claims with the tenant each belongs to.
     *
     * <p>The names in one query rather than one per claim. This is a list
     * screen, and a lookup per row is a round trip per row.
     */
    private List<PaymentIntentResponse> withTenantNames(List<PaymentIntent> intents) {
        if (intents.isEmpty()) {
            return List.of();
        }

        Map<UUID, String> namesByCycle = billingCycleRepository
                .findAllById(intents.stream().map(PaymentIntent::getBillingCycleId).toList())
                .stream()
                .collect(Collectors.toMap(BillingCycle::getId, BillingCycle::getTenantNameSnapshot));

        return intents.stream()
                .map(intent -> PaymentIntentResponse.from(intent, namesByCycle.get(intent.getBillingCycleId())))
                .toList();
    }

    /** Defaults to the current IST month, so a missing or unusable param still answers. */
    private YearMonth parseMonth(String month) {
        if (month == null || month.isBlank()) {
            return YearMonth.now(IST);
        }
        try {
            return YearMonth.parse(month.trim());
        } catch (DateTimeParseException ignored) {
            return YearMonth.now(IST);
        }
    }

    private Instant monthStart(YearMonth month) {
        return month.atDay(1).atStartOfDay(IST).toInstant();
    }

    /**
     * The Live digest tile's three numbers.
     *
     * <p>Takes no actor: the digest is assembled behind its own gate and shows
     * the same figures to whoever can already see the dashboard, exactly as the
     * other summaries there do.
     */
    @Transactional(readOnly = true)
    public PaymentIntentDigestResponse digestFor(UUID propertyId) {
        List<PaymentIntent> waiting = paymentIntentRepository
                .findByPropertyIdAndStatusOrderByCreatedAtAsc(propertyId, PaymentIntentStatus.TENANT_CONFIRMED);

        long total = waiting.stream().mapToLong(PaymentIntent::getAmountPaise).sum();
        // Oldest first out of the repository, so the head is the longest wait.
        long oldestDays = waiting.isEmpty()
                ? 0
                : Duration.between(waiting.get(0).getCreatedAt(), Instant.now()).toDays();

        YearMonth thisMonth = YearMonth.now(IST);
        long resolvedThisMonth = paymentIntentRepository
                .countByPropertyIdAndStatusInAndOwnerDecidedAtGreaterThanEqualAndOwnerDecidedAtLessThan(
                        propertyId, RESOLVED, monthStart(thisMonth), monthStart(thisMonth.plusMonths(1)));

        return new PaymentIntentDigestResponse(
                waiting.size(), total, Math.max(0, oldestDays), resolvedThisMonth);
    }

    /** What the tenant's Pay Now button needs: can they pay, and is one open. */
    @Transactional(readOnly = true)
    public TenantPaymentStateResponse tenantStateFor(UUID tenantUserId, UUID billingCycleId) {
        BillingCycle cycle = billingCycleRepository.findByIdForTenant(billingCycleId, tenantUserId)
                .orElseThrow(() -> new NotFoundException("BillingCycle", billingCycleId));

        PropertyPaymentDetails details = paymentDetailsRepository.findById(cycle.getPropertyId())
                .orElse(null);

        return new TenantPaymentStateResponse(
                details != null && details.canAcceptUpi(),
                details != null && details.canBuildPayLink(),
                details != null && details.canAcceptUpi() ? PayeeDetailsResponse.from(details) : null,
                liveIntentFor(billingCycleId)
                        .map(intent -> PaymentIntentResponse.from(intent, null))
                        .orElse(null));
    }

    /**
     * One bill's whole history of attempts — the tenant's intent ledger.
     *
     * <p>
     * Every attempt, not just live ones. A cancelled attempt and a rejected
     * claim are exactly what a tenant needs to see when they are wondering why a
     * bill they thought they had paid is still owing.
     */
    @Transactional(readOnly = true)
    public List<PaymentIntentResponse> listMyIntentsForCycle(UUID tenantUserId, UUID billingCycleId) {
        // Proves the bill is theirs before returning anything about it.
        billingCycleRepository.findByIdForTenant(billingCycleId, tenantUserId)
                .orElseThrow(() -> new NotFoundException("BillingCycle", billingCycleId));

        return paymentIntentRepository
                .findByTenantUserIdAndBillingCycleIdOrderByCreatedAtDesc(tenantUserId, billingCycleId)
                .stream()
                .map(intent -> PaymentIntentResponse.from(intent, null))
                .toList();
    }

    /**
     * Live attempts across a stay, so a bill list can lock the right buttons.
     *
     * <p>
     * Returned as a list rather than a map: the client indexes it by billing
     * cycle, and a map would have to invent a key shape for a payload that is
     * already keyed by the field inside it.
     */
    @Transactional(readOnly = true)
    public List<PaymentIntentResponse> listMyLiveIntentsForTenancy(UUID tenantUserId, UUID tenancyId) {
        return paymentIntentRepository
                .findByTenancyIdAndTenantUserIdAndStatusIn(tenancyId, tenantUserId, LIVE)
                .stream()
                .map(intent -> PaymentIntentResponse.from(intent, null))
                .toList();
    }

    // ---- Plumbing --------------------------------------------------------

    private PaymentIntent ownedByTenant(UUID tenantUserId, UUID intentId) {
        PaymentIntent intent = paymentIntentRepository.findById(intentId)
                .orElseThrow(() -> new NotFoundException("PaymentIntent", intentId));
        if (!intent.getTenantUserId().equals(tenantUserId)) {
            throw new ValidationException("This payment attempt belongs to someone else.");
        }
        return intent;
    }

    private PaymentIntent awaitingReview(UUID actorUserId, UUID intentId) {
        PaymentIntent intent = paymentIntentRepository.findById(intentId)
                .orElseThrow(() -> new NotFoundException("PaymentIntent", intentId));
        billingAccessPolicy.ensureOwnsPaymentVerification(actorUserId, intent.getPropertyId());
        return intent;
    }

    private BillingCycle cycleFor(PaymentIntent intent) {
        return billingCycleRepository.findById(intent.getBillingCycleId())
                .orElseThrow(() -> new NotFoundException("BillingCycle", intent.getBillingCycleId()));
    }

    /**
     * What the manual-payment row says about where this came from.
     *
     * <p>
     * Names the intent so the audit row is traceable back to the claim, and
     * keeps whatever the tenant typed, which is often the only human context on
     * an otherwise numeric record.
     */
    private static String paymentNoteFor(PaymentIntent intent) {
        String base = "Verified against tenant UPI claim " + intent.getId();
        return intent.getTenantNote() == null ? base : base + " — " + intent.getTenantNote();
    }

    /** An opened intent, the link to fire (or null), and how else to pay. */
    public record PaymentIntentWithLink(
            PaymentIntent intent, String upiLink, PayeeDetailsResponse payee) {
    }
}
