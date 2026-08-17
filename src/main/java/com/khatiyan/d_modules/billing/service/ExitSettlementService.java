package com.khatiyan.d_modules.billing.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.CreateExtraChargeRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateOneOffBillRequest;
import com.khatiyan.d_modules.billing.api.dto.ExitChargeInstrument;
import com.khatiyan.d_modules.billing.api.dto.RecordManualPaymentRequest;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.billing.repository.DepositAccountRepository;
import com.khatiyan.d_modules.billing.service.DepositManagerService.ExitDeduction;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Applies everything the end-tenancy screen decided, as one transaction.
 *
 * <p>End-tenancy is the only place money moves at the close of a stay: the
 * early-exit charge, the damage assessment, and the deposit's fate all land
 * here together. They are applied in one transaction because a half-applied
 * exit is the worst outcome available — a deposit deducted against a tenancy
 * that is still running, with no screen left showing the actor what happened.
 *
 * <p>Prices are resolved here, never accepted from the client: damage items
 * arrive as names and are priced from the property's own schedule.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ExitSettlementService {

    private final DepositManagerService depositManagerService;
    private final BillingCycleService billingCycleService;
    private final BillingCycleLineItemService billingCycleLineItemService;
    private final DepositAccountRepository depositAccountRepository;

    /**
     * Applies the exit policy for a tenancy that is about to end.
     *
     * <p>Call order matters and is the caller's responsibility: this runs
     * <em>before</em> the tenancy is marked ended, inside the same transaction,
     * so that a rejected deduction aborts the exit instead of stranding it.
     *
     * @param propertyId the tenancy's property, used to price damage items
     */
    @Transactional
    public void applyExitPolicy(
            UUID actorUserId,
            UUID tenancyId,
            UUID propertyId,
            ApplyExitPolicyRequest request) {

        // Ordered: the early-exit charge is taken first, so the payability
        // question the actor answered was asked of this same remainder.
        List<ExitDeduction> depositDeductions = new ArrayList<>();
        List<BilledCharge> billedCharges = new ArrayList<>();

        if (request.earlyExitCharges() != null) {
            for (ApplyExitPolicyRequest.ExitCharge earlyExit : request.earlyExitCharges()) {
                String reason = earlyExit.reason() != null && !earlyExit.reason().isBlank()
                        ? earlyExit.reason().trim()
                        : "Early exit charge";
                if (earlyExit.instrument() == ExitChargeInstrument.DEPOSIT) {
                    depositDeductions.add(new ExitDeduction(reason, earlyExit.amountPaise()));
                } else {
                    billedCharges.add(new BilledCharge(reason, earlyExit.amountPaise(), earlyExit.collectedVia()));
                }
            }
        }

        ApplyExitPolicyRequest.DamageCharge damages = request.damages();
        if (damages != null) {
            long scheduleTotalPaise = depositManagerService.resolveDamageTotal(propertyId, damages.itemNames());
            boolean fromDeposit = damages.instrument() == ExitChargeInstrument.DEPOSIT;

            if (scheduleTotalPaise > 0) {
                if (fromDeposit) {
                    depositDeductions.add(new ExitDeduction("Damage charges", scheduleTotalPaise));
                } else {
                    billedCharges.add(new BilledCharge("Damage charges", scheduleTotalPaise, damages.collectedVia()));
                }
            }
            if (damages.customCharges() != null) {
                for (ApplyExitPolicyRequest.CustomCharge custom : damages.customCharges()) {
                    if (fromDeposit) {
                        depositDeductions.add(new ExitDeduction(custom.reason().trim(), custom.amountPaise()));
                    } else {
                        billedCharges.add(
                                new BilledCharge(custom.reason().trim(), custom.amountPaise(), damages.collectedVia()));
                    }
                }
            }
        }

        // A stay with no deposit account — every daily stay — has nothing to
        // deduct from and no payability to decide. Anything the actor routed to
        // the deposit would silently vanish, so refuse it rather than drop it.
        boolean hasDepositAccount = depositAccountRepository.findByTenancyId(tenancyId).isPresent();
        if (!hasDepositAccount && !depositDeductions.isEmpty()) {
            throw new ValidationException(
                    "This stay has no deposit to charge against — use a one-off bill instead");
        }

        if (hasDepositAccount) {
            // Null payability only reaches here on a stay that has no deposit, which
            // the branch above already excluded; treat a missing decision as "keep
            // it", never as a forfeit.
            boolean payable = request.depositPayable() == null || request.depositPayable();
            depositManagerService.applyExitDeductions(actorUserId, tenancyId, depositDeductions, payable);
        }

        // ONE bill for everything billed at this exit, not one per charge. The
        // tenant hands over a single sum at move-out, so a single bill is what
        // actually happened; splitting it would leave them holding two receipts
        // for one payment and make the exit look like two collections.
        //
        // Every line must be added BEFORE the payment is recorded: recording
        // marks the whole cycle paid against its total at that moment, so a line
        // added afterwards would sit on a paid bill and reopen it.
        if (!billedCharges.isEmpty()) {
            BilledCharge first = billedCharges.get(0);
            BillingCycleResponse bill = billingCycleService.createOneOffBill(
                    actorUserId, tenancyId, new CreateOneOffBillRequest(first.reason(), first.amountPaise()));

            List<CreateExtraChargeRequest> extras = billedCharges.stream()
                    .skip(1)
                    .map(charge -> new CreateExtraChargeRequest(charge.reason(), null, charge.amountPaise(), false))
                    .toList();
            if (!extras.isEmpty()) {
                billingCycleLineItemService.addExtraCharge(actorUserId, bill.id(), extras);
            }

            // Recorded paid immediately: the charge was settled at move-out. Leaving
            // it open would end the tenancy owing money, which nothing downstream
            // has a state for.
            //
            // The method is the actor's, not an assumption. Defaulting silently to
            // cash would file a wrong payment record that nobody notices until
            // someone reconciles.
            ManualPaymentMethod method = billedCharges.stream()
                    .map(BilledCharge::collectedVia)
                    .filter(java.util.Objects::nonNull)
                    .findFirst()
                    .orElse(ManualPaymentMethod.CASH);
            // The proof rides on this one payment. There is exactly one bill and
            // one payment for the whole exit however many charges fed into it,
            // so a single photo is the honest granularity.
            billingCycleService.recordManualPayment(
                    actorUserId,
                    bill.id(),
                    new RecordManualPaymentRequest(method, null, request.proofImageUrl(), "Collected at move-out"));
        }

        log.info(
                "Exit policy applied tenancyId={} actorUserId={} depositDeductions={} billedCharges={}",
                tenancyId,
                actorUserId,
                depositDeductions.size(),
                billedCharges.size());
    }

    /** A charge collected as a one-off bill, with how the money actually arrived. */
    private record BilledCharge(String reason, long amountPaise, ManualPaymentMethod collectedVia) {
    }
}
