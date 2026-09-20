package com.khatiyan.d_modules.servicebalance;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.servicebalance.api.dto.ServiceBalanceEntryResponse;
import com.khatiyan.d_modules.servicebalance.api.dto.ServiceBalanceResponse;
import com.khatiyan.d_modules.servicebalance.api.dto.RefundResponse;
import com.khatiyan.d_modules.servicebalance.api.dto.TopUpResponse;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceReferenceType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefundReason;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.model.ServiceCode;
import com.khatiyan.d_modules.servicebalance.model.ServiceSpendOutcome;
import com.khatiyan.d_modules.servicebalance.model.ServiceSpendSplit;
import com.khatiyan.d_modules.servicebalance.service.ServiceBalanceProperties;
import com.khatiyan.d_modules.servicebalance.service.ServiceBalanceRefundService;
import com.khatiyan.d_modules.servicebalance.service.ServiceBalanceService;
import com.khatiyan.d_modules.servicebalance.service.ServiceBalanceTopUpService;

import jakarta.annotation.PostConstruct;

/**
 * The module's front door.
 *
 * <p>Other modules — verification first — call this rather than the services
 * behind it, so the rules about this money stay in one place and a future caller
 * cannot reach past them to the counters.
 */
@Component
public class ServiceBalanceModule {

    private static final Logger log = LoggerFactory.getLogger(ServiceBalanceModule.class);

    private final ServiceBalanceService balanceService;
    private final ServiceBalanceTopUpService topUpService;
    private final ServiceBalanceRefundService refundService;
    private final ServiceBalanceProperties properties;

    public ServiceBalanceModule(
            ServiceBalanceService balanceService,
            ServiceBalanceTopUpService topUpService,
            ServiceBalanceRefundService refundService,
            ServiceBalanceProperties properties) {
        this.balanceService = balanceService;
        this.topUpService = topUpService;
        this.refundService = refundService;
        this.properties = properties;
    }

    /**
     * Says out loud whether owners can actually add money.
     *
     * <p>Both switches, at startup, because "the button is greyed out" is
     * otherwise a question only a debugger can answer — and the answer is
     * always one of these two. Secrets are reported as set or not, never
     * printed.
     */
    @PostConstruct
    void reportConfiguration() {
        log.info(
                "Service balance config enabled={} gatewayKeyPresent={} gatewaySecretPresent={} webhookSecretPresent={} topUpEnabled={}",
                properties.isEnabled(),
                !properties.getRazorpay().getKeyId().isBlank(),
                !properties.getRazorpay().getKeySecret().isBlank(),
                !properties.getRazorpay().getWebhookSecret().isBlank(),
                properties.isEnabled() && properties.getRazorpay().isConfigured());
    }

    public ServiceBalanceResponse summary(UUID ownerUserId) {
        // Before reporting a balance, make sure it is the true one: a payment
        // the app stopped waiting for is still the owner's money.
        topUpService.reconcilePendingFor(ownerUserId);

        ServiceBalanceAccount account = balanceService.readAccount(ownerUserId);
        List<ServiceBalanceEntryResponse> recent = account.getId() == null
                ? List.of()
                : balanceService.recentEntries(account.getId()).stream()
                        .map(ServiceBalanceEntryResponse::from)
                        .toList();
        long minimum = minimumTopUpFor(account.getOutstandingPaise());
        return ServiceBalanceResponse.of(
                account,
                properties.getCurrency(),
                minimum,
                properties.getMaxTopUpPaise(),
                // A suggestion the server would then refuse is worse than no
                // suggestion, so anything under the minimum is dropped.
                properties.getQuickAmountsPaise().stream().filter(amount -> amount >= minimum).toList(),
                properties.isEnabled() && properties.getRazorpay().isConfigured(),
                servicesSuspended(account),
                recent);
    }

    /**
     * The smallest useful top-up: dues, plus the ordinary minimum.
     *
     * <p>Dues alone would clear the debt and leave nothing spendable, so the
     * owner would hit the same wall on the very next attempt.
     */
    public long minimumTopUpFor(long outstandingPaise) {
        return properties.getMinTopUpPaise() + outstandingPaise;
    }

    /**
     * Whether paid work may run at all.
     *
     * <p>Owing money is fine — that is the point of letting a service run on an
     * empty balance. Owing more than the ceiling is not, and neither is an
     * account the bank has taken money back from.
     */
    public boolean servicesSuspended(ServiceBalanceAccount account) {
        return account.isLocked() || account.getOutstandingPaise() >= properties.getMaxOutstandingPaise();
    }

    public Page<ServiceBalanceEntryResponse> statement(UUID ownerUserId, Pageable pageable) {
        ServiceBalanceAccount account = balanceService.accountFor(ownerUserId);
        return balanceService.statement(account.getId(), pageable).map(ServiceBalanceEntryResponse::from);
    }

    public TopUpResponse startTopUp(UUID ownerUserId, long amountPaise, String requestBaseUrl) {
        return respond(topUpService.start(ownerUserId, amountPaise), requestBaseUrl);
    }

    public TopUpResponse readTopUp(UUID ownerUserId, UUID topUpId, String requestBaseUrl) {
        return respond(topUpService.read(ownerUserId, topUpId), requestBaseUrl);
    }

    /** The checkout page for one top-up, rendered for the phone's browser. */
    public ServiceBalanceTopUp checkoutTopUp(UUID topUpId) {
        return topUpService.readForCheckout(topUpId);
    }

    /**
     * @param requestBaseUrl where the app just reached us, used when no public
     *                       base URL is configured — see the property's note
     */
    private TopUpResponse respond(ServiceBalanceTopUp topUp, String requestBaseUrl) {
        String configured = properties.getPublicBaseUrl();
        String base = configured == null || configured.isBlank() ? requestBaseUrl : configured;
        return TopUpResponse.of(
                topUp,
                properties.getRazorpay().getKeyId(),
                properties.getCurrency(),
                base + "/api/v1/service-balance/checkout/" + topUp.getId());
    }

    /**
     * Returns everything unused when an account is closed.
     *
     * <p><b>The only route for unused balance, on purpose.</b> An owner cannot
     * ask for their money back on a whim: a refund can be refused per payment
     * by the gateway, and a "return my money" button that half works is a worse
     * experience than not offering it. Closing the account is a deliberate,
     * rare act where a partial return can be explained by a person.
     *
     * <p>Not wired to any endpoint yet — the account deletion flow calls this
     * when it is built.
     */
    public List<RefundResponse> refundOnAccountClosure(UUID ownerUserId) {
        // Written down and committed first, then sent one at a time. See the
        // refund service for why those cannot be the same transaction.
        List<UUID> refundIds = refundService.requestRefund(
                ownerUserId, null, ServiceBalanceRefundReason.UNUSED_BALANCE, ownerUserId);
        return refundIds.stream().map(refundService::send).map(RefundResponse::from).toList();
    }

    // ---- spending, for the modules that sell services ---------------------
    //
    // The three calls below are the whole contract. A caller holds the price
    // while its work runs, then charges it or lets it go — and must do exactly
    // one of those two, because a hold nobody settles is an owner's money
    // frozen indefinitely.
    //
    // Permission is the CALLER's business. This module knows who owns the
    // balance, not who is allowed to spend it on which property: a manager with
    // the right grant may spend, while topping up and closure refunds stay with
    // the owner.

    /** What this service costs today, for showing a price before committing. */
    public long priceOf(ServiceCode service) {
        return properties.priceOf(service);
    }

    /**
     * Holds the price of one piece of work.
     *
     * <p>Held only while it runs, so an attempt that never happens costs
     * nothing. When the balance cannot cover it the work still proceeds and the
     * outcome says so — the cost then lands as dues when it is charged.
     *
     * @param idempotencyKey unique per attempt, so a retry cannot hold twice
     */
    public ServiceSpendOutcome holdForService(
            UUID ownerUserId, ServiceCode service, UUID referenceId, String idempotencyKey, UUID actorUserId) {
        return balanceService.reserveForService(
                ownerUserId,
                properties.priceOf(service),
                ServiceBalanceReferenceType.VERIFICATION,
                referenceId,
                idempotencyKey,
                memoFor(service),
                actorUserId);
    }

    /**
     * Records a paid service the owner has now used.
     *
     * <p><b>This is the charge path.</b> Khatiyan prepays the provider, so the
     * work runs on our money and this balance is never consulted first — it
     * records what the owner used and what they have left. Nothing here can
     * refuse: by the time it is called we have already been billed.
     *
     * <p>Callers gate at {@link #ensureCanOrder} instead, when the owner orders
     * the work. That is the moment where refusing costs nobody a half-finished
     * check.
     *
     * @param idempotencyKey unique per attempt, so a retry cannot charge twice
     * @return how the cost divided between the balance and the owner's dues
     */
    public ServiceSpendSplit spendForService(
            UUID ownerUserId, ServiceCode service, UUID referenceId, String idempotencyKey, UUID actorUserId) {
        return balanceService.spendForService(
                ownerUserId,
                properties.priceOf(service),
                ServiceBalanceReferenceType.VERIFICATION,
                referenceId,
                idempotencyKey,
                memoFor(service),
                actorUserId);
    }

    /**
     * Whether an owner may order more paid work, and the only place to ask.
     *
     * <p>Checks the account lock, the dues ceiling, and how far ahead the owner
     * has already committed beyond what they have paid in. Throws with a
     * message meant for the owner, so a caller can let it surface.
     *
     * @param committedPaise work already ordered for this owner and not yet run
     * @param newOrderPaise  what this order would add
     */
    public void ensureCanOrder(UUID ownerUserId, long committedPaise, long newOrderPaise) {
        balanceService.ensureCanOrder(ownerUserId, committedPaise, newOrderPaise);
    }

    /**
     * The provider billed us for that work.
     *
     * @param outcome what {@link #holdForService} returned, which says whether
     *                there is a hold to take or the cost goes on the tab
     */
    public void chargeForService(
            UUID ownerUserId,
            ServiceCode service,
            ServiceSpendOutcome outcome,
            UUID referenceId,
            String idempotencyKey,
            UUID actorUserId) {
        balanceService.chargeForService(
                ownerUserId,
                outcome.pricePaise(),
                outcome.reserved(),
                ServiceBalanceReferenceType.VERIFICATION,
                referenceId,
                idempotencyKey,
                memoFor(service),
                actorUserId);
    }

    /** The work never ran, so the hold goes back. */
    public void releaseForService(
            UUID ownerUserId,
            ServiceSpendOutcome outcome,
            UUID referenceId,
            String idempotencyKey,
            UUID actorUserId) {
        balanceService.releaseForService(
                ownerUserId,
                outcome.pricePaise(),
                ServiceBalanceReferenceType.VERIFICATION,
                referenceId,
                idempotencyKey,
                "Hold returned",
                actorUserId);
    }

    /**
     * Whether paid work may run on this account at all.
     *
     * <p>Called before offering a paid action, so a manager is told up front
     * rather than halfway through.
     */
    public boolean canSpend(UUID ownerUserId) {
        ServiceBalanceAccount account = balanceService.readAccount(ownerUserId);
        return !servicesSuspended(account);
    }

    private static String memoFor(ServiceCode service) {
        return switch (service) {
            case AADHAAR_OKYC -> "Identity check";
        };
    }

    public String handleRazorpayWebhook(String rawBody, String signature) {
        return topUpService.handleWebhook(rawBody, signature);
    }
}
