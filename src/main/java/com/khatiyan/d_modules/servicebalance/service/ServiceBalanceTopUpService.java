package com.khatiyan.d_modules.servicebalance.service;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.BusinessException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceReferenceType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUpStatus;
import com.khatiyan.d_modules.servicebalance.provider.razorpay.RazorpayTopUpGateway;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceTopUpRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Putting money in.
 *
 * <p><b>Only the webhook credits.</b> The app is told when a checkout finishes
 * so it can refresh, but a client saying "I paid" is a claim, not a fact, and a
 * balance that can be talked into existing is not a balance.
 *
 * <p><b>Nothing is captured until it is matched.</b> A payment that arrives
 * without a top-up we recognise, or after that top-up's window closed, is left
 * authorised and untouched: the gateway returns it on its own within three days
 * and charges us nothing. Capturing everything and refunding the strays would
 * cost the gateway's cut on each one, which is never recovered.
 */
@Service
public class ServiceBalanceTopUpService {

    private static final Logger log = LoggerFactory.getLogger(ServiceBalanceTopUpService.class);
    private static final String PROVIDER = "RAZORPAY";

    /** Checkouts still worth asking the gateway about. */
    private static final List<ServiceBalanceTopUpStatus> UNFINISHED =
            List.of(ServiceBalanceTopUpStatus.CREATED, ServiceBalanceTopUpStatus.AUTHORIZED);

    /**
     * How far back reconciliation looks.
     *
     * <p>Comfortably past the gateway's own three-day window, after which an
     * uncaptured authorisation has been returned and there is nothing to find.
     */
    private static final Duration RECONCILE_WINDOW = Duration.ofDays(4);
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private final ServiceBalanceService balanceService;
    private final ServiceBalanceTopUpRepository topUpRepository;
    private final RazorpayTopUpGateway gateway;
    private final ServiceBalanceRefundService refundService;
    private final ServiceBalanceProperties properties;

    public ServiceBalanceTopUpService(
            ServiceBalanceService balanceService,
            ServiceBalanceTopUpRepository topUpRepository,
            RazorpayTopUpGateway gateway,
            ServiceBalanceRefundService refundService,
            ServiceBalanceProperties properties) {
        this.balanceService = balanceService;
        this.topUpRepository = topUpRepository;
        this.gateway = gateway;
        this.refundService = refundService;
        this.properties = properties;
    }

    /**
     * Starts a checkout.
     *
     * <p>Owner-only, enforced by the controller's role rule. One payer per
     * account is what keeps one refund destination per account.
     */
    @Transactional
    public ServiceBalanceTopUp start(UUID ownerUserId, long amountPaise) {
        if (!properties.isEnabled()) {
            throw new BusinessException("TOP_UP_DISABLED", "Adding money is not available yet");
        }
        if (amountPaise < properties.getMinTopUpPaise()) {
            throw new ValidationException(
                    "The smallest amount you can add is " + rupees(properties.getMinTopUpPaise()));
        }
        if (amountPaise > properties.getMaxTopUpPaise()) {
            throw new ValidationException(
                    "The largest amount you can add at once is " + rupees(properties.getMaxTopUpPaise()));
        }

        ServiceBalanceAccount account = balanceService.accountFor(ownerUserId);
        Instant expiresAt = Instant.now().plus(properties.getCheckoutExpiryMinutes(), ChronoUnit.MINUTES);
        ServiceBalanceTopUp topUp = topUpRepository.save(
                ServiceBalanceTopUp.start(account, amountPaise, PROVIDER, expiresAt));

        // The receipt is our own id, so a payment can always be traced back to
        // the row that asked for it even if the order lookup fails.
        topUp.attachOrder(gateway.createOrder(amountPaise, topUp.getId().toString()));
        log.info(
                "Service balance top-up started ownerUserId={} topUpId={} amountPaise={}",
                ownerUserId,
                topUp.getId(),
                amountPaise);
        return topUpRepository.save(topUp);
    }

    /**
     * What happened to one checkout, asking the gateway if we do not know yet.
     *
     * <p>The webhook is still the primary route, but it is not the only one:
     * webhooks are delayed, dropped, and on a developer machine cannot reach us
     * at all. Rather than leave an owner staring at money they have paid, an
     * unfinished top-up is reconciled here against the gateway's own record of
     * the order.
     *
     * <p>This is not trusting the client. The client says only "look at this
     * top-up"; the answer comes from the gateway, and the credit uses the same
     * payment-id key the webhook would, so whichever arrives second changes
     * nothing.
     */
    @Transactional
    public ServiceBalanceTopUp read(UUID ownerUserId, UUID topUpId) {
        ServiceBalanceTopUp topUp = topUpRepository.findById(topUpId)
                .orElseThrow(() -> new NotFoundException("Top-up", topUpId));
        if (!topUp.getOwnerUserId().equals(ownerUserId)) {
            throw new NotFoundException("Top-up", topUpId);
        }
        return reconcile(topUp);
    }

    /**
     * Reconciles every unfinished checkout this owner has.
     *
     * <p>Called when the balance screen is read, which is the one moment we
     * know the owner cares. The app cannot be relied on to remember what it was
     * waiting for: the id it held lives in memory, and a reload, a swipe away or
     * a killed process loses it while the money stays very much paid.
     *
     * <p>Bounded to recent checkouts because an authorisation the gateway has
     * already returned is not worth asking about.
     */
    @Transactional
    public void reconcilePendingFor(UUID ownerUserId) {
        topUpRepository
                .findByOwnerUserIdAndStatusInAndCreatedAtAfter(
                        ownerUserId, UNFINISHED, Instant.now().minus(RECONCILE_WINDOW))
                .forEach(this::reconcile);
    }

    /**
     * The same across every owner, for owners who never come back to look.
     *
     * <p>The webhook is still the fast path. This is what makes a lost webhook a
     * delay rather than a loss.
     */
    @Transactional
    public int reconcilePendingSweep() {
        List<ServiceBalanceTopUp> pending = topUpRepository.findByStatusInAndCreatedAtAfter(
                UNFINISHED, Instant.now().minus(RECONCILE_WINDOW));
        pending.forEach(this::reconcile);
        return pending.size();
    }

    /**
     * Brings one top-up up to date with the gateway.
     *
     * <p>Deliberately quiet about failure: the gateway being unreachable must
     * not turn a status read into an error, because the webhook may still be on
     * its way.
     */
    private ServiceBalanceTopUp reconcile(ServiceBalanceTopUp topUp) {
        if (topUp.isPaid()
                || topUp.getProviderOrderId() == null
                || topUp.getStatus() == ServiceBalanceTopUpStatus.FAILED) {
            return topUp;
        }

        try {
            Optional<RazorpayTopUpGateway.OrderPayment> payment =
                    gateway.findPaymentForOrder(topUp.getProviderOrderId());
            if (payment.isEmpty()) {
                return topUp;
            }

            RazorpayTopUpGateway.OrderPayment found = payment.get();
            if (found.amountPaise() != topUp.getAmountPaise()) {
                log.error(
                        "Top-up amount mismatch on reconcile topUpId={} expected={} found={}",
                        topUp.getId(),
                        topUp.getAmountPaise(),
                        found.amountPaise());
                // Crediting a figure nobody agreed is out. If the money is
                // already ours it cannot simply be left either, so it goes back.
                if (found.isCaptured()) {
                    refundService.refundUnappliedPayment(
                            accountOf(topUp), topUp, found.paymentId(), found.amountPaise());
                }
                return topUp;
            }

            // Authorised but not captured is ours to finish: the owner paid, and
            // the capture call is the only thing between them and their balance.
            if (!found.isCaptured()) {
                if (topUp.getStatus() == ServiceBalanceTopUpStatus.EXPIRED) {
                    // Left uncaptured on purpose. The gateway returns it.
                    return topUp;
                }
                topUp.markAuthorized(found.paymentId());
                topUpRepository.save(topUp);
                gateway.capture(found.paymentId(), found.amountPaise());
            }
            // Captured money is ours whatever our own row says, expiry included.
            // Crediting an owner who paid beats returning money they meant to
            // spend.

            creditOnce(topUp, found.paymentId(), found.amountPaise());
            log.info("Top-up reconciled from the gateway topUpId={}", topUp.getId());
        } catch (RuntimeException e) {
            log.warn("Could not reconcile top-up with the gateway topUpId={}", topUp.getId(), e);
        }
        return topUp;
    }

    /**
     * The row behind a checkout page.
     *
     * <p>No owner check: this is opened from the phone's browser, which carries
     * no session. The id is an unguessable UUID and the page shows only the
     * amount and the gateway order — the same posture the parked tenant
     * checkout page took.
     */
    @Transactional(readOnly = true)
    public ServiceBalanceTopUp readForCheckout(UUID topUpId) {
        return topUpRepository.findById(topUpId)
                .orElseThrow(() -> new NotFoundException("Top-up", topUpId));
    }

    /**
     * Handles one gateway event.
     *
     * @return a short word for the log and the response body, never anything a
     *         caller could act on, because this endpoint is public
     */
    @Transactional
    public String handleWebhook(String rawBody, String signature) {
        if (!gateway.signatureValid(rawBody, signature)) {
            throw new ValidationException("Invalid webhook signature");
        }

        JsonNode event = MAPPER.readTree(rawBody);
        String eventName = event.path("event").asString("");
        JsonNode payment = event.path("payload").path("payment").path("entity");
        if (payment.isMissingNode()) {
            return "ignored";
        }

        String paymentId = payment.path("id").asString("");
        String orderId = payment.path("order_id").asString("");
        long amountPaise = payment.path("amount").asLong(0L);

        return switch (eventName) {
            case "payment.authorized" -> authorize(orderId, paymentId, amountPaise);
            case "payment.captured" -> capture(orderId, paymentId, amountPaise);
            case "payment.failed" -> fail(orderId, payment.path("error_description").asString("Payment failed"));
            // The bank has taken a payment back, or is asking about it. Either
            // way no more work runs on that account until a person looks.
            case "payment.dispute.created", "payment.dispute.lost" ->
                    lockForDispute(paymentId, eventName.endsWith("lost"));
            case "payment.dispute.won" -> unlockAfterDispute(paymentId);
            default -> refundEvent(event, eventName);
        };
    }

    /**
     * A refund the gateway has now settled, one way or the other.
     *
     * <p>Refunds can sit pending for days and then fail. Without this the
     * balance stays debited for money that never arrived anywhere.
     */
    private String refundEvent(JsonNode event, String eventName) {
        if (!eventName.startsWith("refund.")) {
            return "ignored";
        }
        JsonNode refund = event.path("payload").path("refund").path("entity");
        String providerRefundId = refund.path("id").asString("");
        if (providerRefundId.isBlank()) {
            return "ignored";
        }

        boolean processed = "refund.processed".equals(eventName);
        refundService.applyProviderOutcome(
                providerRefundId, processed, refund.path("error_description").asString("The refund was refused"));
        return processed ? "refund-processed" : "refund-failed";
    }

    /**
     * Stops an account whose money the bank is pulling back.
     *
     * <p>Locked on the dispute being RAISED, not on losing it. A dispute that we
     * go on to win costs the owner a pause, while one we lose after letting the
     * account keep spending costs us the balance and the services bought with
     * it.
     *
     * <p>The money itself is not moved here. Who owes what after a lost dispute
     * is a decision for a person, and doing it automatically would risk taking
     * money twice.
     */
    private String lockForDispute(String paymentId, boolean lost) {
        return topUpRepository.findByProviderPaymentId(paymentId)
                .map(topUp -> {
                    ServiceBalanceAccount account = balanceService.accountFor(topUp.getOwnerUserId());
                    account.lock(lost ? "A payment was reversed by the bank" : "A payment is being disputed",
                            Instant.now());
                    balanceService.saveAccount(account);
                    log.error(
                            "Service balance locked after a dispute ownerUserId={} paymentId={} lost={}",
                            topUp.getOwnerUserId(),
                            paymentId,
                            lost);
                    return "locked";
                })
                .orElse("unmatched");
    }

    private String unlockAfterDispute(String paymentId) {
        return topUpRepository.findByProviderPaymentId(paymentId)
                .map(topUp -> {
                    ServiceBalanceAccount account = balanceService.accountFor(topUp.getOwnerUserId());
                    account.unlock();
                    balanceService.saveAccount(account);
                    log.info("Service balance unlocked after a dispute was won ownerUserId={}",
                            topUp.getOwnerUserId());
                    return "unlocked";
                })
                .orElse("unmatched");
    }

    /**
     * The payer authorised, so decide whether to take it.
     *
     * <p>Every refusal here ends the same way: we do nothing, and the gateway
     * gives the money back by itself. That is the cheapest possible handling of
     * a payment we cannot explain.
     */
    private String authorize(String orderId, String paymentId, long amountPaise) {
        Optional<ServiceBalanceTopUp> found = topUpRepository.findByProviderOrderId(orderId);
        if (found.isEmpty()) {
            log.warn("Top-up payment has no matching order, leaving it uncaptured orderId={}", orderId);
            return "unmatched";
        }

        ServiceBalanceTopUp topUp = found.get();
        if (topUp.isPaid()) {
            return "already-paid";
        }
        if (topUp.getStatus() == ServiceBalanceTopUpStatus.EXPIRED
                || topUp.getStatus() == ServiceBalanceTopUpStatus.FAILED) {
            log.warn(
                    "Top-up payment arrived after the window closed, leaving it uncaptured topUpId={}",
                    topUp.getId());
            return "closed";
        }
        if (amountPaise != topUp.getAmountPaise()) {
            // Never capture an amount we did not ask for. Letting the gateway
            // return it is safer than crediting a figure nobody agreed to.
            log.error(
                    "Top-up amount mismatch, leaving it uncaptured topUpId={} expected={} received={}",
                    topUp.getId(),
                    topUp.getAmountPaise(),
                    amountPaise);
            return "amount-mismatch";
        }

        topUp.markAuthorized(paymentId);
        topUpRepository.save(topUp);
        gateway.capture(paymentId, amountPaise);
        return creditOnce(topUp, paymentId, amountPaise);
    }

    /** Capture confirmed, by our own call or by the gateway. */
    private String capture(String orderId, String paymentId, long amountPaise) {
        Optional<ServiceBalanceTopUp> found = topUpRepository.findByProviderOrderId(orderId);
        if (found.isEmpty()) {
            // Captured, and belonging to nobody we can identify. Holding money
            // we cannot explain is not an option, so it goes back to the payer.
            refundService.refundOrphanPayment(paymentId, amountPaise);
            return "unmatched-returned";
        }
        return creditOnce(found.get(), paymentId, amountPaise);
    }

    /** The account behind a top-up, for the refund paths. */
    private ServiceBalanceAccount accountOf(ServiceBalanceTopUp topUp) {
        return balanceService.accountFor(topUp.getOwnerUserId());
    }

    private String fail(String orderId, String reason) {
        return topUpRepository.findByProviderOrderId(orderId)
                .map(topUp -> {
                    if (topUp.isPaid()) {
                        return "already-paid";
                    }
                    topUp.markFailed(reason);
                    topUpRepository.save(topUp);
                    return "failed";
                })
                .orElse("unmatched");
    }

    /**
     * Marks the row paid and credits the balance, at most once per payment.
     *
     * <p>The payment id is the idempotency key, so however many times the
     * gateway announces the same payment, the money lands once.
     */
    private String creditOnce(ServiceBalanceTopUp topUp, String paymentId, long amountPaise) {
        topUp.markPaid(paymentId, Instant.now());
        topUpRepository.save(topUp);

        boolean credited = balanceService.credit(
                topUp.getOwnerUserId(),
                amountPaise,
                ServiceBalanceReferenceType.TOP_UP,
                topUp.getId(),
                "topup:" + paymentId,
                "Money added",
                null);
        return credited ? "credited" : "already-credited";
    }

    /**
     * Closes checkouts nobody finished.
     *
     * <p>Only our own row. A payment that shows up afterwards is handled by the
     * rule above: unmatched or closed means uncaptured, and uncaptured means the
     * gateway returns it.
     */
    @Transactional
    public int expireAbandoned() {
        List<ServiceBalanceTopUp> stale = topUpRepository.findByStatusAndExpiresAtBefore(
                ServiceBalanceTopUpStatus.CREATED, Instant.now());

        // Ask the gateway before writing any of them off. Somebody who paid in
        // the last minute of the window has paid, and expiring that row would
        // stop us capturing money they have already handed over.
        stale.forEach(this::reconcile);

        List<ServiceBalanceTopUp> abandoned = stale.stream()
                .filter(topUp -> topUp.getStatus() == ServiceBalanceTopUpStatus.CREATED)
                .toList();
        abandoned.forEach(ServiceBalanceTopUp::markExpired);
        topUpRepository.saveAll(abandoned);
        return abandoned.size();
    }

    private static String rupees(long paise) {
        return "Rs. " + (paise / 100);
    }
}
