package com.khatiyan.d_modules.payment.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.payment.event.OwnerTransferFailedEvent;
import com.khatiyan.d_modules.payment.model.OwnerLinkedAccount;
import com.khatiyan.d_modules.payment.model.OwnerTransfer;
import com.khatiyan.d_modules.payment.model.OwnerTransferStatus;
import com.khatiyan.d_modules.payment.model.PaymentOrder;
import com.khatiyan.d_modules.payment.model.PaymentProviderType;
import com.khatiyan.d_modules.payment.model.PaymentTransaction;
import com.khatiyan.d_modules.payment.provider.CreateProviderTransferCommand;
import com.khatiyan.d_modules.payment.provider.PaymentProvider;
import com.khatiyan.d_modules.payment.provider.PaymentProviderRegistry;
import com.khatiyan.d_modules.payment.provider.ProviderPaymentDetails;
import com.khatiyan.d_modules.payment.provider.ProviderTransfer;
import com.khatiyan.d_modules.payment.repository.OwnerLinkedAccountRepository;
import com.khatiyan.d_modules.payment.repository.OwnerTransferRepository;
import com.khatiyan.d_modules.payment.repository.PaymentOrderRepository;
import com.khatiyan.d_modules.payment.repository.PaymentTransactionRepository;
import com.khatiyan.d_modules.property.PropertyModule;

import lombok.extern.slf4j.Slf4j;

/**
 * Moves the owner's share of a captured payment to their linked account.
 *
 * <p>Runs after capture rather than being declared on the order, so the gateway
 * fee passed on to the owner is the one actually charged for that payment
 * instead of an estimate made before the tenant even chose a payment method.
 *
 * <p>Nothing here may throw into the capture path. A payment that succeeded for
 * the tenant must stay succeeded even if the payout cannot be made — the money
 * is safe in the platform account either way, and an unsent transfer is
 * recoverable while a failed capture is not.
 */
@Slf4j
@Service
public class PaymentTransferService {

    private final OwnerTransferRepository ownerTransferRepository;
    private final OwnerLinkedAccountRepository ownerLinkedAccountRepository;
    private final PaymentProviderRegistry paymentProviderRegistry;
    private final PaymentProperties paymentProperties;
    private final PropertyModule propertyModule;
    private final PaymentOrderRepository paymentOrderRepository;
    private final PaymentTransactionRepository paymentTransactionRepository;
    private final ApplicationEventPublisher eventPublisher;

    public PaymentTransferService(
            OwnerTransferRepository ownerTransferRepository,
            OwnerLinkedAccountRepository ownerLinkedAccountRepository,
            PaymentProviderRegistry paymentProviderRegistry,
            PaymentProperties paymentProperties,
            PropertyModule propertyModule,
            PaymentOrderRepository paymentOrderRepository,
            PaymentTransactionRepository paymentTransactionRepository,
            ApplicationEventPublisher eventPublisher) {
        this.ownerTransferRepository = ownerTransferRepository;
        this.ownerLinkedAccountRepository = ownerLinkedAccountRepository;
        this.paymentProviderRegistry = paymentProviderRegistry;
        this.paymentProperties = paymentProperties;
        this.propertyModule = propertyModule;
        this.paymentOrderRepository = paymentOrderRepository;
        this.paymentTransactionRepository = paymentTransactionRepository;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Retries payouts that were deferred at capture time.
     *
     * <p>Deferral is the safe outcome of an unknown fee or an unready payout
     * account, but it leaves the owner unpaid, so something has to come back for
     * them. Each attempt goes through the same cycle-level gate, so a payout that
     * did eventually succeed cannot be made twice.
     *
     * @return how many payouts this sweep managed to send
     */
    @Transactional
    public int retryDeferredTransfers(Instant deferredBefore, int batchSize) {
        if (!paymentProperties.routeEnabled()) {
            return 0;
        }

        List<PaymentOrder> pending = paymentOrderRepository.findPaidWithoutOwnerTransfer(
                deferredBefore,
                PageRequest.of(0, Math.max(1, batchSize)));

        int sent = 0;
        for (PaymentOrder order : pending) {
            String providerPaymentId = paymentTransactionRepository
                    .findFirstByPaymentOrderIdOrderByCreatedAtDesc(order.getId())
                    .map(PaymentTransaction::getProviderPaymentId)
                    .orElse(null);
            if (providerPaymentId == null) {
                continue;
            }

            if (transferOwnerShare(order, providerPaymentId, order.getPaidAt()) == TransferAttempt.SENT) {
                sent = sent + 1;
            }
        }

        return sent + retryFailedTransfers();
    }

    /**
     * Re-attempts payouts the gateway rejected.
     *
     * <p>These are invisible to the sweep above — a row already exists for the
     * cycle, so "paid with no transfer" cannot find them. Left alone they would
     * never be retried, which is precisely the case this whole mechanism exists
     * for: the transfer failed, the owner corrected their bank details, and
     * somebody has to try again.
     */
    private int retryFailedTransfers() {
        List<OwnerTransfer> failed = ownerTransferRepository
                .findByStatusOrderByInitiatedAtAsc(OwnerTransferStatus.FAILED);

        int sent = 0;
        for (OwnerTransfer transfer : failed) {
            OwnerLinkedAccount linkedAccount = ownerLinkedAccountRepository
                    .findByOwnerUserIdAndPrimaryTrue(transfer.getOwnerUserId())
                    .filter(OwnerLinkedAccount::isActive)
                    .orElse(null);
            if (linkedAccount == null) {
                // Still nothing to pay into. Retrying would fail identically.
                continue;
            }

            PaymentProvider provider = paymentProviderRegistry.get(transfer.getProvider());
            transfer.markRetrying(linkedAccount.getRazorpayAccountId());

            try {
                ProviderTransfer created = provider.createTransfer(new CreateProviderTransferCommand(
                        transfer.getProviderPaymentId(),
                        linkedAccount.getRazorpayAccountId(),
                        transfer.getOwnerNetPaise(),
                        transfer.getCurrency(),
                        transfer.getBillingCycleId(),
                        transfer.getPaymentOrderId()));
                transfer.attachProviderTransfer(created.providerTransferId());
                sent = sent + 1;

                log.info("Failed owner transfer retried successfully billingCycleId={} ownerUserId={} transferId={}",
                        transfer.getBillingCycleId(), transfer.getOwnerUserId(), created.providerTransferId());
            } catch (RuntimeException exception) {
                transfer.markFailed("Retry could not reach the gateway");
                log.error("Owner transfer retry failed billingCycleId={} ownerUserId={}",
                        transfer.getBillingCycleId(), transfer.getOwnerUserId(), exception);
            }
        }

        return sent;
    }

    /**
     * Applies a Route transfer outcome. Unknown transfer ids are ignored rather
     * than treated as errors: Razorpay sends events for the whole account, and
     * not every transfer on it is necessarily one of ours.
     *
     * @return true when a ledger row was updated
     */
    @Transactional
    public boolean applyTransferOutcome(
            PaymentProviderType provider,
            String providerTransferId,
            String eventType,
            String failureReason,
            Instant occurredAt) {
        if (providerTransferId == null || providerTransferId.isBlank()) {
            return false;
        }

        OwnerTransfer transfer = ownerTransferRepository
                .findByProviderAndProviderTransferId(provider, providerTransferId)
                .orElse(null);
        if (transfer == null) {
            log.warn("Route webhook for an unknown transfer providerTransferId={} event={}",
                    providerTransferId, eventType);
            return false;
        }

        switch (eventType) {
            case "transfer.processed" -> transfer.markProcessed();
            case "settlement.processed" -> transfer.markSettled(occurredAt);
            case "transfer.failed" -> {
                transfer.markFailed(failureReason != null ? failureReason : "The gateway could not complete the transfer");
                // The money never left the platform account, so it is recoverable.
                // Retries only fix transient causes though — wrong bank details
                // need the owner to correct them first, hence the event.
                log.error("Owner transfer FAILED billingCycleId={} ownerUserId={} amount={} reason={}",
                        transfer.getBillingCycleId(),
                        transfer.getOwnerUserId(),
                        transfer.getOwnerNetPaise(),
                        failureReason);
                eventPublisher.publishEvent(new OwnerTransferFailedEvent(
                        transfer.getId(),
                        transfer.getBillingCycleId(),
                        transfer.getOwnerUserId(),
                        transfer.getPropertyId(),
                        transfer.getOwnerNetPaise(),
                        transfer.getCurrency(),
                        transfer.getFailureReason()));
            }
            default -> {
                return false;
            }
        }

        return true;
    }

    /**
     * Pays the owner their net share of a captured payment, at most once per
     * billing cycle.
     *
     * <p>Never throws. Every early return leaves the money in the platform
     * account, which is the safe state: it can still be sent later, whereas a
     * transfer sent twice has to be clawed back from a third party.
     */
    @Transactional
    public TransferAttempt transferOwnerShare(PaymentOrder order, String providerPaymentId, Instant capturedAt) {
        if (!paymentProperties.routeEnabled()) {
            return TransferAttempt.DISABLED;
        }
        if (providerPaymentId == null || providerPaymentId.isBlank()) {
            log.warn("Owner transfer skipped without a provider payment id paymentOrderId={}", order.getId());
            return TransferAttempt.DEFERRED;
        }

        // The idempotency gate. A cycle paid twice must not pay the owner twice:
        // the duplicate is held for tenant refund instead.
        Optional<OwnerTransfer> existing = ownerTransferRepository.findByBillingCycleId(order.getBillingCycleId());
        if (existing.isPresent()) {
            log.warn(
                    "Owner transfer already exists for this cycle - not paying twice billingCycleId={} existingTransferId={}",
                    order.getBillingCycleId(),
                    existing.get().getId());
            return TransferAttempt.ALREADY_TRANSFERRED;
        }

        UUID ownerUserId;
        try {
            ownerUserId = propertyModule.getActiveProperty(order.getPropertyId()).ownerId();
        } catch (RuntimeException exception) {
            log.error("Owner transfer deferred - could not resolve property owner paymentOrderId={} propertyId={}",
                    order.getId(), order.getPropertyId(), exception);
            return TransferAttempt.DEFERRED;
        }

        OwnerLinkedAccount linkedAccount = ownerLinkedAccountRepository
                .findByOwnerUserIdAndPrimaryTrue(ownerUserId)
                .filter(OwnerLinkedAccount::isActive)
                .orElse(null);
        if (linkedAccount == null) {
            log.error("Owner transfer deferred - owner has no active payout account ownerUserId={} paymentOrderId={}",
                    ownerUserId, order.getId());
            return TransferAttempt.DEFERRED;
        }

        PaymentProvider provider = paymentProviderRegistry.get(order.getProvider());

        ProviderPaymentDetails payment;
        try {
            payment = provider.fetchPayment(providerPaymentId);
        } catch (RuntimeException exception) {
            log.error("Owner transfer deferred - could not read the payment paymentOrderId={} providerPaymentId={}",
                    order.getId(), providerPaymentId, exception);
            return TransferAttempt.DEFERRED;
        }

        if (!payment.feeKnown()) {
            // Deliberately not estimated. Substituting a guess here silently
            // overcharges the owner whenever the real fee was lower — which is
            // every UPI payment, where the gateway charges nothing at all.
            log.warn(
                    "Owner transfer deferred - gateway has not published the fee yet paymentOrderId={} providerPaymentId={}",
                    order.getId(),
                    providerPaymentId);
            return TransferAttempt.DEFERRED;
        }

        long platformFee = paymentProperties.platformFeeFor(order.getAmountPaise());
        OwnerTransfer transfer;
        try {
            transfer = OwnerTransfer.pending(
                    order,
                    ownerUserId,
                    linkedAccount.getRazorpayAccountId(),
                    providerPaymentId,
                    payment.feePaise(),
                    payment.taxPaise(),
                    platformFee,
                    capturedAt);
        } catch (RuntimeException exception) {
            log.error("Owner transfer skipped - split did not validate paymentOrderId={} gross={} gatewayFee={} platformFee={}",
                    order.getId(), order.getAmountPaise(), payment.feePaise(), platformFee, exception);
            return TransferAttempt.DEFERRED;
        }

        // Saved before the gateway call so a crash mid-flight leaves a PENDING
        // row to reconcile against, rather than an untracked transfer.
        transfer = ownerTransferRepository.save(transfer);

        try {
            ProviderTransfer created = provider.createTransfer(new CreateProviderTransferCommand(
                    providerPaymentId,
                    linkedAccount.getRazorpayAccountId(),
                    transfer.getOwnerNetPaise(),
                    transfer.getCurrency(),
                    order.getBillingCycleId(),
                    order.getId()));
            transfer.attachProviderTransfer(created.providerTransferId());

            log.info(
                    "Owner transfer initiated billingCycleId={} ownerUserId={} gross={} gatewayFee={} platformFee={} ownerNet={} transferId={}",
                    order.getBillingCycleId(),
                    ownerUserId,
                    transfer.getGrossAmountPaise(),
                    transfer.getGatewayFeePaise(),
                    transfer.getPlatformFeePaise(),
                    transfer.getOwnerNetPaise(),
                    created.providerTransferId());
            return TransferAttempt.SENT;
        } catch (RuntimeException exception) {
            transfer.markFailed("Could not reach the gateway to create the transfer");
            log.error("Owner transfer failed at the gateway billingCycleId={} ownerUserId={}",
                    order.getBillingCycleId(), ownerUserId, exception);
            return TransferAttempt.FAILED;
        }
    }
}
