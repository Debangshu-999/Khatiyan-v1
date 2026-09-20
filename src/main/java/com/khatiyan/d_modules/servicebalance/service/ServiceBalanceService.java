package com.khatiyan.d_modules.servicebalance.service;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntry;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceEntryType;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceReferenceType;
import com.khatiyan.c_shared.exception.BusinessException;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.model.ServiceSpendOutcome;
import com.khatiyan.d_modules.servicebalance.model.ServiceSpendSplit;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceAccountRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceEntryRepository;
import com.khatiyan.d_modules.servicebalance.repository.ServiceBalanceTopUpRepository;

/**
 * The ledger: the only place that moves money on a Service balance.
 *
 * <p>Every movement does the same two things in one transaction — change the
 * account's counters through the entity's own guarded methods, then append an
 * immutable entry recording it. Nothing else in the app may touch the counters,
 * because a counter moved without an entry is money that reconciliation will
 * report forever and nobody can explain.
 *
 * <p><b>Idempotency is the caller's key, not our bookkeeping.</b> Callers do not
 * ask "have I already done this" — they write, and the unique index on the key
 * answers. A duplicate is a no-op, not an error, because the caller that retried
 * a webhook did nothing wrong.
 */
@Service
public class ServiceBalanceService {

    private static final Logger log = LoggerFactory.getLogger(ServiceBalanceService.class);

    private final ServiceBalanceAccountRepository accountRepository;
    private final ServiceBalanceEntryRepository entryRepository;
    private final ServiceBalanceTopUpRepository topUpRepository;
    private final ServiceBalanceProperties properties;

    public ServiceBalanceService(
            ServiceBalanceAccountRepository accountRepository,
            ServiceBalanceEntryRepository entryRepository,
            ServiceBalanceTopUpRepository topUpRepository,
            ServiceBalanceProperties properties) {
        this.accountRepository = accountRepository;
        this.entryRepository = entryRepository;
        this.topUpRepository = topUpRepository;
        this.properties = properties;
    }

    /**
     * The owner's account, opened on first sight.
     *
     * <p>Opening one costs nothing and has no balance, so there is no reason to
     * make a screen handle "no account yet" as a separate state.
     */
    @Transactional
    public ServiceBalanceAccount accountFor(UUID ownerUserId) {
        return accountRepository.findByOwnerUserId(ownerUserId)
                .orElseGet(() -> openAccount(ownerUserId));
    }

    @Transactional(readOnly = true)
    public ServiceBalanceAccount readAccount(UUID ownerUserId) {
        return accountRepository.findByOwnerUserId(ownerUserId)
                .orElseGet(() -> ServiceBalanceAccount.open(ownerUserId));
    }

    /** Persists an account changed by a caller that holds it already. */
    @Transactional
    public void saveAccount(ServiceBalanceAccount account) {
        accountRepository.save(account);
    }

    @Transactional(readOnly = true)
    public List<ServiceBalanceEntry> recentEntries(UUID accountId) {
        return entryRepository.findTop10ByAccountIdOrderByCreatedAtDesc(accountId);
    }

    @Transactional(readOnly = true)
    public Page<ServiceBalanceEntry> statement(UUID accountId, Pageable pageable) {
        return entryRepository.findByAccountIdOrderByCreatedAtDesc(accountId, pageable);
    }

    /**
     * Money in, from a captured payment.
     *
     * @return true when this call credited, false when the key had already been
     *         used — which is the normal answer to a redelivered webhook
     */
    @Transactional
    public boolean credit(
            UUID ownerUserId,
            long amountPaise,
            ServiceBalanceReferenceType referenceType,
            UUID referenceId,
            String idempotencyKey,
            String memo,
            UUID actorUserId) {
        if (entryRepository.existsByIdempotencyKey(idempotencyKey)) {
            log.info("Service balance credit already applied idempotencyKey={}", idempotencyKey);
            return false;
        }

        ServiceBalanceAccount account = accountFor(ownerUserId);
        account.credit(amountPaise);
        accountRepository.save(account);

        try {
            entryRepository.save(ServiceBalanceEntry.record(
                    account,
                    ServiceBalanceEntryType.TOPUP,
                    amountPaise,
                    0L,
                    0L,
                    referenceType,
                    referenceId,
                    idempotencyKey,
                    memo,
                    actorUserId));
        } catch (DataIntegrityViolationException e) {
            // Two deliveries of the same webhook arriving together: the check
            // above passed for both, and the unique index settled it. The losing
            // transaction rolls back, taking its credit with it.
            log.info("Service balance credit lost the idempotency race idempotencyKey={}", idempotencyKey);
            throw e;
        }

        // Dues come off before any of it is spendable. A top-up that left them
        // standing would let somebody top up, spend, and walk away from what
        // they owe.
        settleDues(account, referenceId, idempotencyKey);

        log.info(
                "Service balance credited ownerUserId={} amountPaise={} availablePaise={} outstandingPaise={}",
                ownerUserId,
                amountPaise,
                account.getAvailablePaise(),
                account.getOutstandingPaise());
        return true;
    }

    /**
     * Holds the price of a service while it runs.
     *
     * <p>The hold lasts only as long as the work: a grant of several attempts
     * holds nothing, and an attempt that never runs costs nothing. That is the
     * whole point of holding per attempt rather than per grant.
     *
     * <p>When the balance cannot cover it, the work still goes ahead and the
     * cost becomes dues. Stranding a manager halfway through onboarding a
     * tenant, over a few rupees, would be a worse product than carrying the
     * charge to the next top-up.
     */
    @Transactional
    public ServiceSpendOutcome reserveForService(
            UUID ownerUserId,
            long pricePaise,
            ServiceBalanceReferenceType referenceType,
            UUID referenceId,
            String idempotencyKey,
            String memo,
            UUID actorUserId) {
        ServiceBalanceAccount account = accountFor(ownerUserId);
        ensureCanSpend(account);

        if (account.getAvailablePaise() < pricePaise) {
            // Nothing to hold. The charge lands on the tab when the work is
            // actually billed, not now — the service may still never run.
            return ServiceSpendOutcome.onTheTab(pricePaise);
        }

        if (entryRepository.existsByIdempotencyKey(idempotencyKey)) {
            return ServiceSpendOutcome.held(pricePaise);
        }

        account.reserve(pricePaise);
        accountRepository.save(account);
        entryRepository.save(ServiceBalanceEntry.record(
                account,
                ServiceBalanceEntryType.RESERVE,
                -pricePaise,
                pricePaise,
                0L,
                referenceType,
                referenceId,
                idempotencyKey,
                memo,
                actorUserId));

        log.info(
                "Service balance reserved ownerUserId={} pricePaise={} availablePaise={}",
                ownerUserId,
                pricePaise,
                account.getAvailablePaise());
        return ServiceSpendOutcome.held(pricePaise);
    }

    /**
     * Records work Khatiyan has already paid the provider for.
     *
     * <p><b>This is the charge path for a paid service.</b> Khatiyan keeps its
     * own prepaid balance with the provider, so the work runs on that money and
     * this balance is never asked for permission — by the time this is called
     * the check has happened and we have been billed. What this records is the
     * owner's consumption: how much of their balance went, and how much of the
     * cost they now owe.
     *
     * <p>Nothing here refuses. The guards that can refuse live where an owner
     * ORDERS checks, which is a moment where saying no strands nobody. Refusing
     * here would only lose a cost we have already paid.
     *
     * <p>Unlike {@link #chargeForService}, this takes no hold. Holds exist for
     * work that was reserved in advance, and a prepaid provider needs no such
     * promise.
     *
     * @return how the cost divided between the balance and the owner's dues
     */
    @Transactional
    public ServiceSpendSplit spendForService(
            UUID ownerUserId,
            long pricePaise,
            ServiceBalanceReferenceType referenceType,
            UUID referenceId,
            String idempotencyKey,
            String memo,
            UUID actorUserId) {
        if (entryRepository.existsByIdempotencyKey(idempotencyKey)) {
            // A retry of a charge we already recorded. Reporting the price back
            // unapplied keeps the caller's arithmetic right without moving the
            // money a second time.
            log.info("Service spend already applied idempotencyKey={}", idempotencyKey);
            return new ServiceSpendSplit(pricePaise, 0L);
        }

        ServiceBalanceAccount account = accountFor(ownerUserId);
        ServiceSpendSplit split = account.spend(pricePaise);
        accountRepository.save(account);

        // Only money that actually left the balance stops being refundable. The
        // part that became a debt was never funded by a payment, so there is no
        // lot of one to consume against it.
        if (split.fromAvailablePaise() > 0) {
            consumeLots(account, split.fromAvailablePaise());
        }

        entryRepository.save(ServiceBalanceEntry.record(
                account,
                ServiceBalanceEntryType.CHARGE,
                -split.fromAvailablePaise(),
                0L,
                split.toOutstandingPaise(),
                referenceType,
                referenceId,
                idempotencyKey,
                memo,
                actorUserId));

        log.info(
                "Service spend ownerUserId={} pricePaise={} fromBalancePaise={} toDuesPaise={} availablePaise={}",
                ownerUserId,
                pricePaise,
                split.fromAvailablePaise(),
                split.toOutstandingPaise(),
                account.getAvailablePaise());
        return split;
    }

    /**
     * The provider billed us, so the money goes.
     *
     * <p>Takes the hold when there is one, and otherwise puts the cost on the
     * tab. Either way the service ran and was paid for by us, so refusing to
     * record it would lose the cost rather than avoid it.
     */
    @Transactional
    public void chargeForService(
            UUID ownerUserId,
            long pricePaise,
            boolean wasReserved,
            ServiceBalanceReferenceType referenceType,
            UUID referenceId,
            String idempotencyKey,
            String memo,
            UUID actorUserId) {
        if (entryRepository.existsByIdempotencyKey(idempotencyKey)) {
            log.info("Service charge already applied idempotencyKey={}", idempotencyKey);
            return;
        }

        ServiceBalanceAccount account = accountFor(ownerUserId);

        if (wasReserved && account.getReservedPaise() >= pricePaise) {
            account.charge(pricePaise);
            accountRepository.save(account);
            // Only now is the money actually gone, so only now does it stop
            // being refundable to the payment that provided it.
            consumeLots(account, pricePaise);
            entryRepository.save(ServiceBalanceEntry.record(
                    account,
                    ServiceBalanceEntryType.CHARGE,
                    0L,
                    -pricePaise,
                    0L,
                    referenceType,
                    referenceId,
                    idempotencyKey,
                    memo,
                    actorUserId));
        } else {
            account.chargeToOutstanding(pricePaise);
            accountRepository.save(account);
            entryRepository.save(ServiceBalanceEntry.record(
                    account,
                    ServiceBalanceEntryType.CHARGE,
                    0L,
                    0L,
                    pricePaise,
                    referenceType,
                    referenceId,
                    idempotencyKey,
                    memo,
                    actorUserId));
        }

        log.info(
                "Service charged ownerUserId={} pricePaise={} onTheTab={} outstandingPaise={}",
                ownerUserId,
                pricePaise,
                !wasReserved,
                account.getOutstandingPaise());
    }

    /**
     * The work never happened, so the hold goes back.
     *
     * <p>An expired attempt, a provider outage, our own failure. None of those
     * are something an owner should pay for.
     */
    @Transactional
    public void releaseForService(
            UUID ownerUserId,
            long pricePaise,
            ServiceBalanceReferenceType referenceType,
            UUID referenceId,
            String idempotencyKey,
            String memo,
            UUID actorUserId) {
        if (entryRepository.existsByIdempotencyKey(idempotencyKey)) {
            return;
        }

        ServiceBalanceAccount account = accountFor(ownerUserId);
        if (account.getReservedPaise() < pricePaise) {
            // Nothing held: the work ran on the tab, or the hold is already
            // gone. Either way there is nothing to give back.
            return;
        }

        account.release(pricePaise);
        accountRepository.save(account);
        entryRepository.save(ServiceBalanceEntry.record(
                account,
                ServiceBalanceEntryType.RELEASE,
                pricePaise,
                -pricePaise,
                0L,
                referenceType,
                referenceId,
                idempotencyKey,
                memo,
                actorUserId));

        log.info("Service balance hold released ownerUserId={} pricePaise={}", ownerUserId, pricePaise);
    }

    /**
     * Whether paid work may run on this account at all.
     *
     * <p>Owing money is fine, and deliberately so. Owing more than the ceiling
     * is not, and neither is an account the bank has pulled money back from.
     */
    public void ensureCanSpend(ServiceBalanceAccount account) {
        if (account.isLocked()) {
            throw new BusinessException(
                    "SERVICE_BALANCE_LOCKED",
                    "Paid services are paused on this account. Please contact support.");
        }
        if (account.getOutstandingPaise() >= properties.getMaxOutstandingPaise()) {
            throw new BusinessException(
                    "SERVICE_BALANCE_DUES",
                    "Add money to clear your pending charges before using paid services again.");
        }
    }

    /**
     * Whether an owner may ORDER more paid work.
     *
     * <p><b>The only place a paid service is ever refused.</b> An attempt is
     * never refused — by the time one runs, a tenant is mid-verification and
     * Khatiyan has already paid the provider out of its own prepaid balance, so
     * a refusal there would strand a person and lose us the cost anyway. Every
     * limit therefore lands here, where "no, clear your dues first" is a
     * sentence an owner can act on.
     *
     * <p>Three limits, each for a different failure:
     * <ul>
     *   <li><b>Locked</b> — the bank has already pulled money back from this
     *       account. Nothing more goes out on it until a human looks.
     *   <li><b>Dues ceiling</b> — what an owner may owe before they must pay.
     *   <li><b>Exposure</b> — dues plus every attempt already ordered and not
     *       yet run, less what they have paid in. The ceiling alone does not
     *       catch this: an owner ordering five attempts across ten tenancies
     *       owes nothing yet, passes the dues check ten times over, and can
     *       still run up several times the ceiling the moment those tenants
     *       start verifying.
     * </ul>
     *
     * @param committedPaise attempts already ordered across this owner and not
     *                       yet run or cancelled, priced at today's rate
     * @param newOrderPaise  what this order would add
     */
    public void ensureCanOrder(UUID ownerUserId, long committedPaise, long newOrderPaise) {
        ServiceBalanceAccount account = accountFor(ownerUserId);
        ensureCanSpend(account);

        // Money already paid in covers what it covers. Counting it as exposure
        // would punish exactly the owners who prepaid.
        long uncovered = account.getOutstandingPaise()
                + committedPaise
                + newOrderPaise
                - account.getAvailablePaise();
        if (uncovered > properties.getMaxExposurePaise()) {
            throw new BusinessException(
                    "SERVICE_BALANCE_EXPOSURE",
                    "Add money to your Service balance to order more checks. "
                            + "You have more checks waiting to be used than your balance covers.");
        }
    }

    /**
     * Marks spent money as no longer refundable, oldest payment first.
     *
     * <p>Oldest first keeps younger payments refundable for longer, and the
     * gateway's refund window is finite.
     */
    private void consumeLots(ServiceBalanceAccount account, long amountPaise) {
        long remaining = amountPaise;
        for (ServiceBalanceTopUp lot : topUpRepository
                .findByAccountIdAndRemainingRefundablePaiseGreaterThanOrderByCreatedAtAsc(account.getId(), 0L)) {
            if (remaining <= 0) {
                break;
            }
            long taken = lot.consume(remaining);
            if (taken > 0) {
                topUpRepository.save(lot);
                remaining -= taken;
            }
        }
    }

    /**
     * Takes what is owed out of freshly credited money.
     *
     * <p>Its own ledger line rather than a smaller credit: an owner whose Rs 500
     * quietly became Rs 460 should be able to see exactly where the difference
     * went, on the statement, without asking anyone.
     */
    private void settleDues(ServiceBalanceAccount account, UUID referenceId, String creditKey) {
        long settled = account.settleOutstanding();
        if (settled <= 0) {
            return;
        }

        accountRepository.save(account);
        entryRepository.save(ServiceBalanceEntry.record(
                account,
                ServiceBalanceEntryType.DUES_SETTLED,
                -settled,
                0L,
                -settled,
                ServiceBalanceReferenceType.TOP_UP,
                referenceId,
                // Tied to the credit that paid it, so replaying that credit
                // cannot settle the same dues twice.
                creditKey + ":dues",
                "Pending charges cleared",
                null));

        log.info(
                "Service balance dues settled ownerUserId={} settledPaise={} outstandingPaise={}",
                account.getOwnerUserId(),
                settled,
                account.getOutstandingPaise());
    }

    /**
     * Opens the account in its own transaction.
     *
     * <p>Two first requests racing would otherwise both insert, and the unique
     * index on the owner would fail the whole enclosing operation rather than
     * the part that lost.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    protected ServiceBalanceAccount openAccount(UUID ownerUserId) {
        try {
            return accountRepository.save(ServiceBalanceAccount.open(ownerUserId));
        } catch (DataIntegrityViolationException e) {
            return accountRepository.findByOwnerUserId(ownerUserId).orElseThrow(() -> e);
        }
    }
}
