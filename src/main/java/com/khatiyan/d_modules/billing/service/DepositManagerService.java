package com.khatiyan.d_modules.billing.service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.CreateDepositCorrectionRequest;
import com.khatiyan.d_modules.billing.api.dto.DepositAccountResponse;
import com.khatiyan.d_modules.billing.api.dto.DepositMovementResponse;
import com.khatiyan.d_modules.billing.event.DepositPayoutEvent;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.DepositAccount;
import com.khatiyan.d_modules.billing.model.DepositAccountStatus;
import com.khatiyan.d_modules.billing.model.DepositMovement;
import com.khatiyan.d_modules.billing.model.DepositMovementType;
import com.khatiyan.d_modules.billing.repository.DepositAccountRepository;
import com.khatiyan.d_modules.billing.repository.DepositMovementRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyExitPolicyResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;

import lombok.extern.slf4j.Slf4j;

/**
 * Manages tenancy deposit accounts and their movement ledger.
 *
 * <p>
 * DepositAccount stores account identity and lifecycle only. The deposit balance
 * is calculated from DepositMovement rows, so edits/clears only change movement
 * rows and never patch a cached balance.
 */
@Slf4j
@Service
public class DepositManagerService {

    private static final String OPENING_DEPOSIT_REASON = "Opening deposit";

    private final DepositAccountRepository depositAccountRepository;
    private final DepositMovementRepository depositMovementRepository;
    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final BillingAccessPolicy billingAccessPolicy;
    private final AuthModule authModule;
    private final ApplicationEventPublisher eventPublisher;

    public DepositManagerService(
            DepositAccountRepository depositAccountRepository,
            DepositMovementRepository depositMovementRepository,
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            BillingAccessPolicy billingAccessPolicy,
            AuthModule authModule,
            ApplicationEventPublisher eventPublisher) {
        this.depositAccountRepository = depositAccountRepository;
        this.depositMovementRepository = depositMovementRepository;
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.billingAccessPolicy = billingAccessPolicy;
        this.authModule = authModule;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Opens the deposit account only after the first monthly cycle is paid.
     *
     * <p>
     * This keeps the deposit ledger tied to money actually collected. Tenancy
     * creation can create a DEPOSIT billing line, but the account starts only
     * after that first payable cycle is paid successfully.
     */
    @Transactional
    public Optional<DepositAccount> openFromPaidFirstCycleIfNeeded(
            TenancyResponse tenancy,
            BillingCycle cycle,
            long depositAmountPaise) {
        if (tenancy.billingType() != TenancyBillingType.MONTHLY) {
            return Optional.empty();
        }
        if (!Integer.valueOf(1).equals(cycle.getCycleNumber())) {
            return Optional.empty();
        }
        if (!cycle.isPaid()) {
            throw new ValidationException("Deposit account can open only after first cycle payment");
        }
        if (depositAmountPaise <= 0) {
            return Optional.empty();
        }

        Optional<DepositAccount> existingAccount = depositAccountRepository.findByTenancyId(tenancy.id());
        if (existingAccount.isPresent()) {
            return existingAccount;
        }

        DepositAccount account = DepositAccount.open(
                tenancy.id(),
                tenancy.userId(),
                tenancy.propertyId());

        DepositAccount saved = depositAccountRepository.save(account);
        depositMovementRepository.save(DepositMovement.correctionAddition(
                saved.getId(),
                OPENING_DEPOSIT_REASON,
                depositAmountPaise,
                null));

        log.info(
                "Deposit account opened from paid first cycle depositAccountId={} tenancyId={} billingCycleId={} tenantUserId={} openingDeposit={}",
                saved.getId(),
                tenancy.id(),
                cycle.getId(),
                tenancy.userId(),
                depositAmountPaise);

        return Optional.of(saved);
    }

    /**
     * Loads a tenant's active deposit account for the tenant self-view.
     */
    @Transactional(readOnly = true)
    public DepositAccountResponse getMyActiveDepositAccount(UUID tenantUserId) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancy", tenantUserId));

        DepositAccount account = depositAccountRepository
                .findByTenancyId(tenancy.id())
                .orElseThrow(() -> new NotFoundException("DepositAccount", tenancy.id()));

        return toResponse(account);
    }

    /**
     * Loads a tenant's deposit account for one of their own tenancies.
     */
    @Transactional(readOnly = true)
    public DepositAccountResponse getMyDepositAccountForTenancy(UUID tenantUserId, UUID tenancyId) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        if (!tenancy.userId().equals(tenantUserId)) {
            throw new ValidationException("Tenancy does not belong to current user");
        }

        DepositAccount account = getAccountByTenancyId(tenancyId);
        return toResponse(account);
    }

    /**
     * Loads a tenancy deposit account after verifying the actor can manage the
     * tenancy's property.
     */
    @Transactional(readOnly = true)
    public DepositAccountResponse getForManagedTenancy(UUID actorUserId, UUID tenancyId) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        billingAccessPolicy.ensureCanViewDeposits(actorUserId, tenancy.propertyId());

        DepositAccount account = getAccountByTenancyId(tenancyId);
        return toResponse(account);
    }

    /**
     * Lists deposit accounts for a property the actor manages as a page, newest
     * first. Supports an optional status filter and a free-text query matched
     * against tenant name, tenancy reference code and tenancy id. Used by the
     * owner/manager deposit-manager history screen.
     */
    @Transactional(readOnly = true)
    public PageResponse<DepositAccountResponse> listForManagedProperty(
            UUID actorUserId,
            UUID propertyId,
            String query,
            DepositAccountStatus status,
            int page,
            int size) {
        billingAccessPolicy.ensureCanViewDeposits(actorUserId, propertyId);

        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();

        List<DepositAccount> accounts = depositAccountRepository.findByPropertyId(propertyId)
                .stream()
                .filter(account -> status == null || account.getStatus() == status)
                .toList();
        List<DepositAccountResponse> responses = toResponses(accounts)
                .stream()
                .filter(response -> matchesQuery(response, normalizedQuery))
                .toList();

        return PageResponse.of(responses, page, size);
    }

    /**
     * Counts a property's deposit accounts in a given status. Used by the owner
     * action center to surface deposits awaiting settlement.
     */
    @Transactional(readOnly = true)
    public long countByPropertyAndStatus(UUID propertyId, DepositAccountStatus status) {
        // No deposit check: this feeds the dashboard action centre, which shows
        // its counts to every manager and gates only the row's destination.
        return depositAccountRepository.findByPropertyId(propertyId).stream()
                .filter(account -> account.getStatus() == status)
                .count();
    }

    /**
     * Matches a deposit account against a lowercased query across tenant name,
     * tenancy reference code and tenancy id. A blank query matches everything.
     */
    private boolean matchesQuery(DepositAccountResponse response, String normalizedQuery) {
        if (normalizedQuery.isEmpty()) {
            return true;
        }

        String tenantName = response.tenantName() == null ? "" : response.tenantName().toLowerCase();
        String referenceCode = response.tenancyReferenceCode() == null
                ? ""
                : response.tenancyReferenceCode().toLowerCase();
        String tenancyId = response.tenancyId() == null ? "" : response.tenancyId().toString().toLowerCase();

        return tenantName.contains(normalizedQuery)
                || referenceCode.contains(normalizedQuery)
                || tenancyId.contains(normalizedQuery);
    }

    /**
     * Creates or edits the deposit deduction linked to a billing-cycle line item.
     */
    @Transactional
    public DepositMovement upsertBillingLineDeduction(
            UUID actorUserId,
            UUID tenancyId,
            UUID billingCycleId,
            UUID billingCycleLineItemId,
            long amountPaise,
            String reason) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        billingAccessPolicy.ensureCanManageDeposits(actorUserId, tenancy.propertyId());
        validateNonNegativeAmount(amountPaise);

        DepositAccount account = getAccountByTenancyId(tenancyId);
        ensureActive(account);
        List<DepositMovement> movements = depositMovementRepository.findByDepositAccountId(account.getId());
        Optional<DepositMovement> existingMovement = depositMovementRepository
                .findByBillingCycleLineItemId(billingCycleLineItemId);

        if (existingMovement.isPresent()) {
            DepositMovement movement = existingMovement.get();
            ensureMovementBelongsToAccount(account, movement);
            ensureBalanceCanReplaceMovement(movements, movement, amountPaise);
            movement.updateBillingLineMovement(amountPaise, actorUserId);

            log.info(
                    "Deposit billing line movement updated depositAccountId={} tenancyId={} billingCycleId={} lineItemId={} actorUserId={} amount={}",
                    account.getId(),
                    tenancyId,
                    billingCycleId,
                    billingCycleLineItemId,
                    actorUserId,
                    amountPaise);

            return movement;
        }

        ensureBalanceCanApplyMovement(movements, DepositMovementType.DEDUCTION, amountPaise);

        DepositMovement movement = DepositMovement.deduction(
                account.getId(),
                billingCycleId,
                billingCycleLineItemId,
                reason,
                amountPaise,
                actorUserId);

        DepositMovement saved = depositMovementRepository.save(movement);

        log.info(
                "Deposit billing line movement created depositAccountId={} tenancyId={} billingCycleId={} lineItemId={} actorUserId={} amount={}",
                account.getId(),
                tenancyId,
                billingCycleId,
                billingCycleLineItemId,
                actorUserId,
                amountPaise);

        return saved;
    }

    /**
     * Clears the movement linked to a billing-cycle line item by setting its
     * amount to zero.
     */
    @Transactional
    public void clearBillingLineMovement(
            UUID actorUserId,
            UUID tenancyId,
            UUID billingCycleLineItemId) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        billingAccessPolicy.ensureCanManageDeposits(actorUserId, tenancy.propertyId());

        Optional<DepositMovement> existingMovement = depositMovementRepository
                .findByBillingCycleLineItemId(billingCycleLineItemId);
        if (existingMovement.isEmpty()) {
            return;
        }

        DepositAccount account = getAccountByTenancyId(tenancyId);
        ensureActive(account);
        DepositMovement movement = existingMovement.get();
        ensureMovementBelongsToAccount(account, movement);
        movement.clearBillingLineMovement(actorUserId);

        log.info(
                "Deposit billing line movement cleared depositAccountId={} tenancyId={} lineItemId={} actorUserId={}",
                account.getId(),
                tenancyId,
                billingCycleLineItemId,
                actorUserId);
    }

    /**
     * Adds a correction amount directly to the deposit ledger.
     */
    @Transactional
    public DepositAccountResponse addCorrection(
            UUID actorUserId,
            UUID tenancyId,
            CreateDepositCorrectionRequest request) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        billingAccessPolicy.ensureCanManageDeposits(actorUserId, tenancy.propertyId());

        DepositAccount account = getAccountByTenancyId(tenancyId);
        ensureActive(account);
        DepositMovement movement = DepositMovement.correctionAddition(
                account.getId(),
                request.reason().trim(),
                request.amountPaise(),
                actorUserId);

        depositMovementRepository.save(movement);

        log.info(
                "Deposit correction added depositAccountId={} tenancyId={} actorUserId={} amount={}",
                account.getId(),
                tenancyId,
                actorUserId,
                request.amountPaise());

        return toResponse(account);
    }

    /**
     * Deducts a correction amount directly from the deposit ledger.
     */
    @Transactional
    public DepositAccountResponse deductCorrection(
            UUID actorUserId,
            UUID tenancyId,
            CreateDepositCorrectionRequest request) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        billingAccessPolicy.ensureCanManageDeposits(actorUserId, tenancy.propertyId());

        DepositAccount account = getAccountByTenancyId(tenancyId);
        ensureActive(account);
        List<DepositMovement> movements = depositMovementRepository.findByDepositAccountId(account.getId());
        ensureBalanceCanApplyMovement(movements, DepositMovementType.DEDUCTION, request.amountPaise());

        DepositMovement movement = DepositMovement.correctionDeduction(
                account.getId(),
                request.reason().trim(),
                request.amountPaise(),
                actorUserId);

        depositMovementRepository.save(movement);

        log.info(
                "Deposit correction deducted depositAccountId={} tenancyId={} actorUserId={} amount={}",
                account.getId(),
                tenancyId,
                actorUserId,
                request.amountPaise());

        return toResponse(account);
    }

    /**
     * Deducts a manager-approved amount from deposit during premature exit review.
     */
    @Transactional
    public DepositAccountResponse deductForExitApproval(
            UUID actorUserId,
            UUID tenancyId,
            Long amountPaise) {
        if (amountPaise == null || amountPaise == 0) {
            return getForManagedTenancy(actorUserId, tenancyId);
        }
        validateNonNegativeAmount(amountPaise);

        TenancyResponse tenancy = getTenancy(tenancyId);
        // Authorization belongs to the caller: tenancy has already checked
        // EXIT_REQUESTS or TENANCIES. Re-checking on a billing resource here
        // would refuse a move-out the manager is allowed to run.

        DepositAccount account = getAccountByTenancyId(tenancyId);
        ensureActive(account);

        List<DepositMovement> movements = depositMovementRepository.findByDepositAccountId(account.getId());
        ensureBalanceCanApplyMovement(movements, DepositMovementType.DEDUCTION, amountPaise);

        DepositMovement movement = DepositMovement.correctionDeduction(
                account.getId(),
                "Premature exit deposit deduction",
                amountPaise,
                actorUserId);

        depositMovementRepository.save(movement);

        log.info(
                "Deposit deducted for exit approval depositAccountId={} tenancyId={} actorUserId={} amount={}",
                account.getId(),
                tenancyId,
                actorUserId,
                amountPaise);

        return toResponse(account);
    }

    /**
     * Pays out the remaining deposit balance and closes the account.
     *
     * <p>Executes a decision already made — it does not make one. Payability was
     * settled at end-tenancy, with both parties present and the balance final;
     * revisiting it here, weeks later and from one side only, is exactly the
     * thing this design removes. Nothing on this path can change an amount.
     */
    @Transactional
    public DepositAccountResponse settleDeposit(UUID actorUserId, UUID tenancyId, String reason) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        billingAccessPolicy.ensureCanManageDeposits(actorUserId, tenancy.propertyId());
        ensureTenancyEnded(tenancy);

        DepositAccount account = getAccountByTenancyId(tenancyId);
        ensureDecidedAtExit(account, true,
                "This deposit was marked not refundable at exit — close the account instead");

        List<DepositMovement> movements = depositMovementRepository.findByDepositAccountId(account.getId());
        long settlementAmountPaise = calculateBalance(movements);

        // A zero balance is a valid settlement, not an error. Once the exit
        // decided this deposit was refundable, the charges applied there can
        // legitimately consume all of it — the tenant is owed nothing, and the
        // account still has to close. Refusing here left it stuck in
        // PENDING_SETTLEMENT with no action that could clear it: settle was
        // blocked by this guard, and close-unpaid is barred for a refundable
        // deposit.
        account.settle(Instant.now());

        if (settlementAmountPaise > 0) {
            DepositMovement movement = DepositMovement.settlement(
                    account.getId(),
                    reason,
                    settlementAmountPaise,
                    actorUserId);

            depositMovementRepository.save(movement);
            // Only a real payout raises the event — it creates an expense row,
            // and a zero-rupee expense is noise in the owner's ledger.
            publishPayout(movement, account, tenancy, settlementAmountPaise, reason);
        }

        log.info(
                "Deposit settled depositAccountId={} tenancyId={} actorUserId={} settlementAmount={}",
                account.getId(),
                tenancyId,
                actorUserId,
                settlementAmountPaise);

        return toResponse(account);
    }

    /**
     * Closes a deposit that was marked not refundable at exit, paying out nothing.
     *
     * <p>The balance stays on the ledger rather than being zeroed: the record of
     * what was held, and of the decision not to return it, is the only thing that
     * can answer the question later.
     */
    @Transactional
    public DepositAccountResponse closeDepositUnpaid(UUID actorUserId, UUID tenancyId, String reason) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        billingAccessPolicy.ensureCanManageDeposits(actorUserId, tenancy.propertyId());
        ensureTenancyEnded(tenancy);

        DepositAccount account = getAccountByTenancyId(tenancyId);
        ensureDecidedAtExit(account, false,
                "This deposit is refundable — settle it instead of closing it unpaid");

        account.settle(Instant.now());

        log.info(
                "Deposit closed unpaid depositAccountId={} tenancyId={} actorUserId={} reason={}",
                account.getId(),
                tenancyId,
                actorUserId,
                reason);

        return toResponse(account);
    }

    // The deposit secures the stay; releasing it while the tenant still lives
    // there would leave the tenancy unsecured.
    private void ensureTenancyEnded(TenancyResponse tenancy) {
        if (tenancy.status() != TenancyStatus.EXITED && tenancy.status() != TenancyStatus.EVICTED) {
            throw new ValidationException("Deposit can be settled only after the tenancy has ended");
        }
    }

    // Static and package-private: it reads nothing but the account, so it is
    // testable on its own rather than through the whole service graph.
    static void ensureDecidedAtExit(DepositAccount account, boolean expectedPayable, String wrongPathMessage) {
        if (account.isSettled()) {
            throw new ValidationException("Deposit account is already settled");
        }

        Boolean payable = account.getPayableAtExit();
        if (payable == null) {
            // Pre-dates the exit flow, or the tenancy ended without one. Guessing
            // either way moves someone's money on an assumption.
            throw new ValidationException(
                    "No payability decision was recorded when this tenancy ended, so this deposit "
                            + "cannot be settled automatically");
        }
        if (payable != expectedPayable) {
            throw new ValidationException(wrongPathMessage);
        }
    }

    /** One deduction the actor chose to take from the deposit at end-tenancy. */
    public record ExitDeduction(String reason, long amountPaise) {
    }

    /**
     * Applies the end-tenancy deposit decisions in one transaction: the actor's
     * ordered deductions, the payability decision, then PENDING_SETTLEMENT.
     *
     * <p>Deliberately does <em>not</em> settle or close the account. Settlement is
     * a later, separate step that only executes the decision recorded here — so
     * this method's job is to leave the balance final and the decision stamped.
     *
     * <p>Deductions are validated against a <b>running</b> balance: each one is
     * checked against what the earlier ones left, not against the opening balance.
     * Two deductions that are each individually affordable can be unaffordable
     * together, and that is the version of the bug that only shows up in
     * production, on a real deposit, after the money has moved.
     *
     * <p>A forfeited deposit cannot absorb anything. If the balance is not being
     * returned to the tenant, deducting from it is double-charging them.
     */
    @Transactional
    public void applyExitDeductions(
            UUID actorUserId,
            UUID tenancyId,
            List<ExitDeduction> deductions,
            boolean payable) {
        // Authorization belongs to the caller: tenancy has already checked that
        // this actor may end the stay. Re-checking deposit permissions here would
        // refuse a move-out the manager is allowed to run.
        DepositAccount account = getAccountByTenancyId(tenancyId);
        if (account.getStatus() != DepositAccountStatus.ACTIVE) {
            throw new ValidationException("Deposit account is no longer active for this tenancy");
        }

        if (!payable && !deductions.isEmpty()) {
            throw new ValidationException(
                    "A deposit that is not being refunded cannot also be deducted from — "
                            + "charge these to a one-off bill instead");
        }

        List<DepositMovement> movements = depositMovementRepository.findByDepositAccountId(account.getId());
        for (ExitDeduction deduction : deductions) {
            long remainingPaise = calculateBalance(movements);
            if (deduction.amountPaise() > remainingPaise) {
                throw new ValidationException(
                        "\"" + deduction.reason() + "\" is " + rupees(deduction.amountPaise())
                                + " but only " + rupees(remainingPaise)
                                + " is left in the deposit. Charge the excess to a one-off bill.");
            }

            DepositMovement movement = DepositMovement.correctionDeduction(
                    account.getId(), deduction.reason(), deduction.amountPaise(), actorUserId);
            depositMovementRepository.save(movement);
            movements.add(movement);
        }

        account.markPendingSettlement(payable);

        log.info(
                "Deposit exit policy applied depositAccountId={} tenancyId={} actorUserId={} deductions={} payable={}",
                account.getId(),
                tenancyId,
                actorUserId,
                deductions.size(),
                payable);
    }

    private static String rupees(long paise) {
        return "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale.forLanguageTag("en-IN"))
                .format(paise / 100);
    }

    // Sums the property's authoritative charge for each selected damaged item;
    // unknown names are ignored so a stale client selection can't invent charges.
    // Package-private so ExitSettlementService prices damage the same way this
    // service does, rather than growing a second copy of the pricing rule.
    long resolveDamageTotal(UUID propertyId, List<String> damageItemNames) {
        if (damageItemNames == null || damageItemNames.isEmpty()) {
            return 0L;
        }
        Map<String, Long> chargeByName = propertyModule.getExitPolicy(propertyId).damageCharges().stream()
                .collect(Collectors.toMap(
                        PropertyExitPolicyResponse.DamageChargeView::name,
                        PropertyExitPolicyResponse.DamageChargeView::chargePaise,
                        (first, second) -> first));

        long total = 0L;
        for (String name : damageItemNames) {
            Long charge = chargeByName.get(name);
            if (charge != null) {
                total += charge;
            }
        }
        return total;
    }

    // The refund is the property's actual cash outflow; the expense module
    // records it as an AUTO ledger row keyed on the settlement movement id.
    private void publishPayout(
            DepositMovement movement,
            DepositAccount account,
            TenancyResponse tenancy,
            long amountPaise,
            String reason) {
        eventPublisher.publishEvent(new DepositPayoutEvent(
                movement.getId(),
                account.getId(),
                tenancy.id(),
                account.getTenantUserId(),
                tenancy.propertyId(),
                amountPaise,
                LocalDate.now(),
                reason));
    }

    /**
     * Builds the deposit response with movement history and calculated balance.
     */
    private DepositAccountResponse toResponse(DepositAccount account) {
        List<DepositMovement> movements = depositMovementRepository.findByDepositAccountId(account.getId());
        long currentBalancePaise = calculateBalance(movements);

        List<DepositMovementResponse> movementResponses = movements
                .stream()
                .map(movement -> DepositMovementResponse.from(movement))
                .toList();

        String tenancyReferenceCode = tenancyModule.findById(account.getTenancyId())
                .map(TenancyResponse::referenceCode)
                .orElse(null);
        String tenantName = authModule.findById(account.getTenantUserId())
                .map(this::displayUserName)
                .orElse(null);

        return DepositAccountResponse.from(
                account, tenantName, tenancyReferenceCode, currentBalancePaise, movementResponses);
    }

    private List<DepositAccountResponse> toResponses(List<DepositAccount> accounts) {
        if (accounts.isEmpty()) {
            return List.of();
        }

        List<UUID> accountIds = accounts.stream()
                .map(DepositAccount::getId)
                .toList();
        Map<UUID, List<DepositMovement>> movementsByAccountId = depositMovementRepository
                .findByDepositAccountIds(accountIds)
                .stream()
                .collect(Collectors.groupingBy(DepositMovement::getDepositAccountId));

        Set<UUID> tenancyIds = accounts.stream()
                .map(DepositAccount::getTenancyId)
                .collect(Collectors.toSet());
        Map<UUID, String> tenancyReferenceCodes = tenancyModule.findByIds(tenancyIds)
                .entrySet()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().referenceCode()));

        Set<UUID> tenantUserIds = accounts.stream()
                .map(DepositAccount::getTenantUserId)
                .collect(Collectors.toSet());
        Map<UUID, String> tenantNames = authModule.findByIds(tenantUserIds)
                .entrySet()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> displayUserName(entry.getValue())));

        return accounts.stream()
                .map(account -> {
                    List<DepositMovement> movements = movementsByAccountId.getOrDefault(account.getId(), List.of());
                    List<DepositMovementResponse> movementResponses = movements.stream()
                            .map(DepositMovementResponse::from)
                            .toList();
                    long currentBalancePaise = calculateBalance(movements);
                    return DepositAccountResponse.from(
                            account,
                            tenantNames.get(account.getTenantUserId()),
                            tenancyReferenceCodes.get(account.getTenancyId()),
                            currentBalancePaise,
                            movementResponses);
                })
                .toList();
    }

    private String displayUserName(UserSummaryResponse user) {
        if (user.fullName() != null && !user.fullName().isBlank()) {
            return user.fullName();
        }
        return null;
    }

    /**
     * Calculates balance by replaying deposit ledger movements.
     */
    private long calculateBalance(List<DepositMovement> movements) {
        long balancePaise = 0;
        for (DepositMovement movement : movements) {
            balancePaise = applyMovement(balancePaise, movement.getType(), movement.getAmountPaise());
        }

        if (balancePaise < 0) {
            throw new ValidationException("Deposit balance is negative");
        }

        return balancePaise;
    }

    /**
     * Verifies a new movement will not make the ledger balance negative.
     */
    private void ensureBalanceCanApplyMovement(
            List<DepositMovement> movements,
            DepositMovementType type,
            long amountPaise) {
        validateNonNegativeAmount(amountPaise);
        long balancePaise = applyMovement(calculateBalance(movements), type, amountPaise);
        if (balancePaise < 0) {
            throw new ValidationException("Deposit balance is not enough");
        }
    }

    /**
     * Verifies editing an existing movement will not make the ledger balance
     * negative.
     */
    private void ensureBalanceCanReplaceMovement(
            List<DepositMovement> movements,
            DepositMovement movement,
            long newAmountPaise) {
        validateNonNegativeAmount(newAmountPaise);

        long balanceWithoutMovement = reverseMovement(calculateBalance(movements), movement);
        long updatedBalance = applyMovement(balanceWithoutMovement, movement.getType(), newAmountPaise);
        if (updatedBalance < 0) {
            throw new ValidationException("Deposit balance is not enough");
        }
    }

    /**
     * Applies one movement amount to a running balance.
     */
    private long applyMovement(long balancePaise, DepositMovementType type, long amountPaise) {
        if (type == DepositMovementType.ADDITION) {
            return balancePaise + amountPaise;
        }

        return balancePaise - amountPaise;
    }

    /**
     * Removes one existing movement from a running balance.
     */
    private long reverseMovement(long balancePaise, DepositMovement movement) {
        if (movement.getType() == DepositMovementType.ADDITION) {
            return balancePaise - movement.getAmountPaise();
        }

        return balancePaise + movement.getAmountPaise();
    }

    /**
     * Ensures an editable movement is tied to the same deposit account.
     */
    private void ensureMovementBelongsToAccount(DepositAccount account, DepositMovement movement) {
        if (!movement.getDepositAccountId().equals(account.getId())) {
            throw new ValidationException("Deposit movement does not belong to this tenancy");
        }
    }

    /**
     * Blocks edits after the deposit account is settled.
     */
    private void ensureActive(DepositAccount account) {
        if (account.getStatus() != DepositAccountStatus.ACTIVE) {
            throw new ValidationException("Deposit account is not active");
        }
    }

    /**
     * Loads a deposit account by tenancy id.
     */
    private DepositAccount getAccountByTenancyId(UUID tenancyId) {
        return depositAccountRepository.findByTenancyId(tenancyId)
                .orElseThrow(() -> new NotFoundException("DepositAccount", tenancyId));
    }

    /**
     * Loads tenancy data through the tenancy module facade.
     */
    private TenancyResponse getTenancy(UUID tenancyId) {
        return tenancyModule.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
    }

    private static void validateNonNegativeAmount(long amountPaise) {
        if (amountPaise < 0) {
            throw new ValidationException("Deposit movement amount cannot be negative");
        }
    }
}
