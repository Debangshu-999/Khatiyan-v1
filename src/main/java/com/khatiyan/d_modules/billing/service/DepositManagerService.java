package com.khatiyan.d_modules.billing.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.CreateDepositCorrectionRequest;
import com.khatiyan.d_modules.billing.api.dto.DepositAccountResponse;
import com.khatiyan.d_modules.billing.api.dto.DepositMovementResponse;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.DepositAccount;
import com.khatiyan.d_modules.billing.model.DepositAccountStatus;
import com.khatiyan.d_modules.billing.model.DepositMovement;
import com.khatiyan.d_modules.billing.model.DepositMovementType;
import com.khatiyan.d_modules.billing.repository.DepositAccountRepository;
import com.khatiyan.d_modules.billing.repository.DepositMovementRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

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

    public DepositManagerService(
            DepositAccountRepository depositAccountRepository,
            DepositMovementRepository depositMovementRepository,
            TenancyModule tenancyModule,
            PropertyModule propertyModule) {
        this.depositAccountRepository = depositAccountRepository;
        this.depositMovementRepository = depositMovementRepository;
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
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
        if (cycle.getCycleNumber() != 1) {
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
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

        DepositAccount account = getAccountByTenancyId(tenancyId);
        return toResponse(account);
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
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());
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
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

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
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

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
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

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
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

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
     * Settles the remaining deposit balance at tenancy exit/refund time.
     */
    @Transactional
    public DepositAccountResponse settleDeposit(UUID actorUserId, UUID tenancyId, String reason) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

        DepositAccount account = getAccountByTenancyId(tenancyId);
        List<DepositMovement> movements = depositMovementRepository.findByDepositAccountId(account.getId());
        long settlementAmountPaise = calculateBalance(movements);

        if (settlementAmountPaise <= 0) {
            throw new ValidationException("Deposit account has no balance to settle");
        }

        account.settle(Instant.now());

        DepositMovement movement = DepositMovement.settlement(
                account.getId(),
                reason,
                settlementAmountPaise,
                actorUserId);

        depositMovementRepository.save(movement);

        log.info(
                "Deposit settled depositAccountId={} tenancyId={} actorUserId={} settlementAmount={}",
                account.getId(),
                tenancyId,
                actorUserId,
                settlementAmountPaise);

        return toResponse(account);
    }

    /**
     * Marks the deposit account settled when an exit request is executed.
     *
     * <p>
     * Unlike the manual settlement endpoint, this is a lifecycle close. A
     * zero-balance account should still become SETTLED so old tenancy deposits do
     * not remain active after checkout.
     */
    @Transactional
    public void settleForExecutedExit(UUID actorUserId, UUID tenancyId) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

        if (tenancy.billingType() != TenancyBillingType.MONTHLY) {
            return;
        }

        Optional<DepositAccount> optionalAccount = depositAccountRepository.findByTenancyId(tenancyId);
        if (optionalAccount.isEmpty()) {
            log.info(
                    "Deposit settlement skipped because no deposit account exists tenancyId={} actorUserId={}",
                    tenancyId,
                    actorUserId);
            return;
        }

        DepositAccount account = optionalAccount.get();
        if (account.getStatus() != DepositAccountStatus.ACTIVE) {
            log.info(
                    "Deposit account already settled for exit execution depositAccountId={} tenancyId={} actorUserId={} status={}",
                    account.getId(),
                    tenancyId,
                    actorUserId,
                    account.getStatus());
            return;
        }

        List<DepositMovement> movements = depositMovementRepository.findByDepositAccountId(account.getId());
        long settlementAmountPaise = calculateBalance(movements);

        account.settle(Instant.now());

        if (settlementAmountPaise > 0) {
            depositMovementRepository.save(DepositMovement.settlement(
                    account.getId(),
                    "Tenancy exit executed",
                    settlementAmountPaise,
                    actorUserId));
        }

        log.info(
                "Deposit account settled after exit execution depositAccountId={} tenancyId={} actorUserId={} settlementAmount={}",
                account.getId(),
                tenancyId,
                actorUserId,
                settlementAmountPaise);
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

        return DepositAccountResponse.from(account, currentBalancePaise, movementResponses);
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
