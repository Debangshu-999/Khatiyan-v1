package com.khatiyan.d_modules.servicebalance.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntry;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntryType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceReferenceType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefund;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefundReason;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceRefundStatus;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.provider.razorpay.RazorpayTopUpGateway;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceAccountRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceEntryRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceRefundRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceTopUpRepository;

/**
 * Sending money back.
 *
 * <p><b>Only to the cards it came from.</b> Money leaves this balance the way
 * it arrived or not at all: a payout to an account of the owner's choosing
 * would be a withdrawal, and a balance you can withdraw from is a regulated
 * payment instrument needing an RBI authorisation this business does not have.
 *
 * <p>So a refund walks the top-ups that funded the balance and returns money to
 * each in turn. Newest first, because gateways only refund to source inside a
 * window and the youngest payment has the most of that window left.
 */
@Service
public class ServiceBalanceRefundService {

    private static final Logger log = LoggerFactory.getLogger(ServiceBalanceRefundService.class);

    private final ServiceBalanceAccountRepository accountRepository;
    private final ServiceBalanceEntryRepository entryRepository;
    private final ServiceBalanceRefundRepository refundRepository;
    private final ServiceBalanceTopUpRepository topUpRepository;
    private final RazorpayTopUpGateway gateway;

    public ServiceBalanceRefundService(
            ServiceBalanceAccountRepository accountRepository,
            ServiceBalanceEntryRepository entryRepository,
            ServiceBalanceRefundRepository refundRepository,
            ServiceBalanceTopUpRepository topUpRepository,
            RazorpayTopUpGateway gateway) {
        this.accountRepository = accountRepository;
        this.entryRepository = entryRepository;
        this.refundRepository = refundRepository;
        this.topUpRepository = topUpRepository;
        this.gateway = gateway;
    }

    /**
     * Writes a refund down, and only then sends it.
     *
     * <p><b>Two phases on purpose.</b> Returning Rs 900 drawn from two payments
     * is two calls to the gateway, and making them inside one transaction means
     * a failure on the second rolls back a first that has already left. The
     * ledger would then deny money the card had already received.
     *
     * <p>So this commits the money leaving the balance and the rows saying where
     * it is going. Sending happens after, one transaction each, and a sweep
     * finishes anything this process does not live long enough to send.
     *
     * @param amountPaise how much to return, or null for everything refundable
     */
    @Transactional
    public List<UUID> requestRefund(
            UUID ownerUserId, Long amountPaise, ServiceBalanceRefundReason reason, UUID actorUserId) {
        ServiceBalanceAccount account = accountRepository.findByOwnerUserId(ownerUserId)
                .orElseThrow(() -> new ValidationException("There is no money on this balance to return"));

        if (account.getOutstandingPaise() > 0) {
            // Refunding past dues would mean paying the provider on the owner's
            // behalf and handing back the money we would have collected against.
            throw new ValidationException("Clear your pending charges before returning money");
        }

        long refundable = account.refundablePaise();
        if (refundable <= 0) {
            throw new ValidationException("There is no money on this balance to return");
        }

        long requested = amountPaise == null ? refundable : amountPaise;
        if (requested <= 0) {
            throw new ValidationException("Enter an amount to return");
        }
        if (requested > refundable) {
            // Held money belongs to work already in flight, and spent money is
            // gone. Neither can come back.
            throw new ValidationException("You can return at most " + rupees(refundable));
        }

        List<ServiceBalanceTopUp> lots = new ArrayList<>(
                topUpRepository.findByAccountIdAndRemainingRefundablePaiseGreaterThanOrderByCreatedAtAsc(
                        account.getId(), 0L));
        // Newest first: the refund window at the gateway is finite, and the
        // youngest payment has the most of it left.
        lots.sort(Comparator.comparing(ServiceBalanceTopUp::getCreatedAt).reversed());

        List<UUID> refundIds = new ArrayList<>();
        long remaining = requested;

        for (ServiceBalanceTopUp lot : lots) {
            if (remaining <= 0) {
                break;
            }
            long fromThisLot = lot.consume(remaining);
            if (fromThisLot <= 0) {
                continue;
            }

            ServiceBalanceRefund refund = refundRepository.save(
                    ServiceBalanceRefund.request(account, lot, fromThisLot, reason));

            account.debit(fromThisLot);
            accountRepository.save(account);
            topUpRepository.save(lot);
            entryRepository.save(ServiceBalanceEntry.record(
                    account,
                    ServiceBalanceEntryType.REFUND,
                    -fromThisLot,
                    0L,
                    0L,
                    ServiceBalanceReferenceType.REFUND,
                    refund.getId(),
                    "refund:" + refund.getId(),
                    "Money returned",
                    actorUserId));

            refundIds.add(refund.getId());
            remaining -= fromThisLot;
        }

        if (remaining > 0) {
            // The ledger says this money exists but no payment can carry it
            // back: a lot outside the gateway window, or a balance built by an
            // adjustment rather than a payment. Refusing the whole request is
            // right, because a partial refund nobody asked for is worse.
            throw new ValidationException(
                    "Part of this balance can no longer be returned to the card that paid it. Contact support.");
        }

        log.info(
                "Service balance refund requested ownerUserId={} amountPaise={} refunds={}",
                ownerUserId,
                requested,
                refundIds.size());
        return refundIds;
    }

    /**
     * Sends one written-down refund to the gateway.
     *
     * <p>Its own transaction, so one failure cannot undo a sibling that has
     * already gone. A refusal puts the money back on the balance, because the
     * only other way out is a bank transfer and this product does not have that
     * door.
     */
    @Transactional
    public ServiceBalanceRefund send(UUID refundId) {
        ServiceBalanceRefund refund = refundRepository.findById(refundId)
                .orElseThrow(() -> new ValidationException("Refund not found"));
        if (refund.getStatus() != ServiceBalanceRefundStatus.REQUESTED) {
            return refund;
        }

        try {
            String providerRefundId = gateway.refund(
                    refund.getProviderPaymentId(), refund.getAmountPaise(), refund.getId().toString());
            // SENT rather than PROCESSED: a gateway can accept a refund and
            // refuse it later, and its webhook is what settles that.
            refund.markSent(providerRefundId);
            return refundRepository.save(refund);
        } catch (RuntimeException e) {
            log.error("Refund could not be sent refundId={}", refundId, e);
            restore(refund, e.getMessage());
            return refund;
        }
    }

    /**
     * Puts a failed refund's money back where it was.
     *
     * <p>Balance, lot and ledger together. Money that could not be sent has to
     * become spendable again, or the owner has simply lost it.
     */
    @Transactional
    public void restore(ServiceBalanceRefund refund, String failureReason) {
        if (refund.getStatus() == ServiceBalanceRefundStatus.FAILED) {
            return;
        }

        ServiceBalanceAccount account = accountRepository.findById(refund.getAccountId())
                .orElseThrow(() -> new ValidationException("Account not found"));

        account.credit(refund.getAmountPaise());
        accountRepository.save(account);

        if (refund.getTopUpId() != null) {
            topUpRepository.findById(refund.getTopUpId()).ifPresent(lot -> {
                lot.restore(refund.getAmountPaise());
                topUpRepository.save(lot);
            });
        }

        entryRepository.save(ServiceBalanceEntry.record(
                account,
                ServiceBalanceEntryType.ADJUSTMENT,
                refund.getAmountPaise(),
                0L,
                0L,
                ServiceBalanceReferenceType.REFUND,
                refund.getId(),
                "refund-failed:" + refund.getId(),
                "Returned money came back",
                null));

        refund.markFailed(failureReason);
        refundRepository.save(refund);

        log.warn(
                "Refund failed and the money went back onto the balance refundId={} amountPaise={}",
                refund.getId(),
                refund.getAmountPaise());
    }

    /** Finishes refunds this process never got to send. */
    @Transactional
    public int sendPending() {
        List<ServiceBalanceRefund> pending =
                refundRepository.findByStatus(ServiceBalanceRefundStatus.REQUESTED);
        pending.forEach(refund -> send(refund.getId()));
        return pending.size();
    }

    /**
     * The gateway's final word on a refund, from its webhook.
     *
     * <p>A refund can sit pending for days and then fail. Without this the
     * balance would stay debited for money that never arrived anywhere.
     */
    @Transactional
    public void applyProviderOutcome(String providerRefundId, boolean processed, String failureReason) {
        refundRepository.findByProviderRefundId(providerRefundId).ifPresent(refund -> {
            if (processed) {
                refund.markProcessed(providerRefundId, Instant.now());
                refundRepository.save(refund);
                return;
            }
            restore(refund, failureReason);
        });
    }

    /**
     * Returns a payment that reached us but never reached a balance.
     *
     * <p>Capture succeeded and the credit did not: our process died in between,
     * or a captured payment arrived for an order whose row we cannot match. The
     * money is ours, it should not be, and nobody is going to complain about it
     * because the owner never saw it appear.
     *
     * <p><b>No ledger entry.</b> Nothing was credited, so debiting a balance to
     * give it back would charge the owner for our own failure.
     *
     * <p>Quiet on failure: this runs in a sweep, and a gateway that will not
     * take the refund today is a reason to try again, not to break the sweep.
     */
    @Transactional
    public boolean refundUnappliedPayment(
            ServiceBalanceAccount account, ServiceBalanceTopUp topUp, String paymentId, long amountPaise) {
        if (refundRepository.findByProviderPaymentIdAndReason(
                        paymentId, ServiceBalanceRefundReason.UNAPPLIED_PAYMENT)
                .isPresent()) {
            return false;
        }

        ServiceBalanceRefund refund = refundRepository.save(
                ServiceBalanceRefund.unapplied(account, topUp, paymentId, amountPaise));
        try {
            String providerRefundId = gateway.refund(paymentId, amountPaise, refund.getId().toString());
            refund.markProcessed(providerRefundId, Instant.now());
            refundRepository.save(refund);
            log.warn(
                    "Returned a payment that never reached a balance paymentId={} amountPaise={}",
                    paymentId,
                    amountPaise);
            return true;
        } catch (RuntimeException e) {
            refund.markFailed(e.getMessage());
            refundRepository.save(refund);
            log.error("Could not return an unapplied payment paymentId={}", paymentId, e);
            return false;
        }
    }

    /**
     * Returns a captured payment we cannot tie to anything at all.
     *
     * <p>No order we recognise, so no account and no row to hang a record on.
     * The gateway's own idempotency key does the deduplicating instead, keyed on
     * the payment, so a redelivered webhook cannot send the money back twice.
     *
     * <p>Logged as an error because money arriving that we cannot explain is
     * always worth a person looking, even though the money itself is handled.
     */
    public boolean refundOrphanPayment(String paymentId, long amountPaise) {
        try {
            gateway.refund(paymentId, amountPaise, "unapplied:" + paymentId);
            log.error(
                    "Returned a captured payment that matches no top-up paymentId={} amountPaise={}",
                    paymentId,
                    amountPaise);
            return true;
        } catch (RuntimeException e) {
            log.error("Could not return an unmatched captured payment paymentId={}", paymentId, e);
            return false;
        }
    }

    private static String rupees(long paise) {
        return "Rs. " + (paise / 100);
    }
}
