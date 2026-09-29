package com.khatiyan.d_modules.billing.service;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.money.Money;
import com.khatiyan.d_modules.billing.api.dto.CashPaymentCodeResponse;
import com.khatiyan.d_modules.billing.api.dto.ManualPaymentResponse;
import com.khatiyan.d_modules.billing.api.dto.RecordManualPaymentRequest;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.CashPaymentCode;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.billing.model.PropertyPaymentDetails;
import com.khatiyan.d_modules.billing.repository.PropertyPaymentDetailsRepository;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.billing.repository.CashPaymentCodeRepository;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Cash recorded against a bill only with the tenant's say-so.
 *
 * <p>Cash has no trail of its own. A UPI payment has a reference and a bank
 * line; a cheque has a counterfoil. Cash has the owner's word, and nothing
 * else. So the owner sends a code to the tenant's phone, the tenant reads it
 * out as they hand the money over, and the bill is marked paid only when that
 * code is entered. Was strict for everyone (2026-09-25). Since 2026-09-28 it
 * is the property's choice: the code is asked for only when "Verify cash with
 * OTP" is on in Payment setup, and every method recorded here must be one the
 * property takes.
 *
 * <p><b>Only the bill's own payment action.</b> Move-out charges are also
 * recorded as manual payments and default to cash, but they go through the
 * end-tenancy flow, which is atomic and has no step for a code. They call
 * {@link BillingCycleService#recordManualPayment} directly and are not gated
 * here.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CashPaymentConfirmationService {

    /**
     * How long a sent code can be entered. The OTP store expires the code
     * itself at the same point; this is the bill's copy of that fact.
     */
    static final Duration CODE_LIFETIME = Duration.ofMinutes(10);

    private final BillingCycleRepository billingCycleRepository;
    private final BillingAccessPolicy billingAccessPolicy;
    private final CashPaymentCodeRepository cashPaymentCodeRepository;
    private final BillingCycleService billingCycleService;
    private final AuthModule authModule;
    private final TenancyModule tenancyModule;
    /** Which ways the property takes money, and whether cash needs the code (2026-09-28). */
    private final PropertyPaymentDetailsRepository paymentDetailsRepository;

    /**
     * Sends the tenant a code for this bill at its current total.
     *
     * <p>The message states the amount and the bill number. The code is the
     * tenant agreeing that this much changed hands for this bill, and a bare
     * "your code is 482913" would let them agree to a number they never saw.
     */
    @Transactional
    public CashPaymentCodeResponse sendCode(UUID actorUserId, UUID billingCycleId, String requestIpAddress) {
        BillingCycle cycle = payableCycle(actorUserId, billingCycleId);
        // Checked, not bumped: a bill that changed since the screen loaded it
        // gets no code sent, and Mark paid on the same screen still matches.
        VersionGuard.verify(cycle);
        String phone = payerPhone(cycle);
        Instant now = Instant.now();

        // The OTP store keeps one live cash code per NUMBER, not per bill. A
        // tenant with two unpaid bills who is sent a code for the second would
        // otherwise have it pass on the first as well.
        cashPaymentCodeRepository.findByPhoneAndConsumedAtIsNullAndExpiresAtAfter(phone, now)
                .forEach(outstanding -> outstanding.supersede(now));

        long amountPaise = cycle.getTotalAmountPaise();
        String detail = "Share this code only if you have paid %s in cash for bill %s."
                .formatted(Money.ofPaise(amountPaise).formatRupees(), cycle.getReferenceCode());
        String sentTo = authModule.startCashPaymentConfirmation(phone, requestIpAddress, detail);

        CashPaymentCode code = cashPaymentCodeRepository.save(CashPaymentCode.sent(
                cycle.getId(), amountPaise, phone, actorUserId, now, CODE_LIFETIME));

        log.info(
                "Cash payment code sent billingCycleId={} actorUserId={} amountPaise={}",
                cycle.getId(), actorUserId, amountPaise);
        return new CashPaymentCodeResponse(sentTo, amountPaise, code.getExpiresAt());
    }

    /**
     * Records a payment made at the bill — with the tenant's code when it is
     * cash, as before when it is anything else.
     */
    @Transactional
    public ManualPaymentResponse record(UUID actorUserId, UUID billingCycleId, RecordManualPaymentRequest request) {
        // Only the ways this property takes money (2026-09-28). The picker shows
        // no others, and this keeps a stale or scripted request to the same list.
        BillingCycle target = payableCycle(actorUserId, billingCycleId);
        // The bill as the screen saw it (2026-09-29), before anything is recorded.
        VersionGuard.claim(target);
        PropertyPaymentDetails settings = paymentDetailsRepository.findById(target.getPropertyId())
                .orElseGet(() -> PropertyPaymentDetails.empty(target.getPropertyId()));
        if (request.method() == null || !settings.accepts(request.method())) {
            throw new ValidationException("This property does not take that way of paying. Turn it on in Payment setup.");
        }

        // Cash needs the tenant's code only when the property has switched that on.
        if (request.method() != ManualPaymentMethod.CASH || !settings.isCashOtpRequired()) {
            return billingCycleService.recordManualPayment(actorUserId, billingCycleId, request);
        }

        // Checked before the code is spent: a code burned on a bill that turns
        // out to be already paid is one the tenant then has to be sent again.
        BillingCycle cycle = payableCycle(actorUserId, billingCycleId);
        if (request.otp() == null || request.otp().isBlank()) {
            throw new ValidationException("Ask the tenant for the code sent to their phone");
        }

        Instant now = Instant.now();
        CashPaymentCode code = cashPaymentCodeRepository
                .findFirstByBillingCycleIdOrderByRequestedAtDesc(cycle.getId())
                .filter(sent -> sent.isUsableAt(now))
                .orElseThrow(() -> new ValidationException(
                        "No active code for this bill. Send the tenant a new one."));

        // The code confirms the total as it stood when it was sent. A late fee
        // posting overnight, or a charge added since, means the tenant has not
        // agreed to what would now be recorded.
        if (code.getAmountPaise() != cycle.getTotalAmountPaise()) {
            throw new ValidationException(
                    "This bill has changed since the code was sent. Send the tenant a new code.");
        }

        authModule.completeCashPaymentConfirmation(code.getPhone(), request.otp());
        code.consume(now);

        ManualPaymentResponse payment =
                billingCycleService.recordManualPayment(actorUserId, cycle.getId(), request, now);
        log.info(
                "Cash payment confirmed by tenant billingCycleId={} actorUserId={} manualPaymentId={}",
                cycle.getId(), actorUserId, payment.id());
        return payment;
    }

    /** The bill, if this person may take money for it and there is money to take. */
    private BillingCycle payableCycle(UUID actorUserId, UUID billingCycleId) {
        BillingCycle cycle = billingCycleRepository.findById(billingCycleId)
                .orElseThrow(() -> new NotFoundException("BillingCycle", billingCycleId));
        billingAccessPolicy.ensureCanManageBilling(actorUserId, cycle.getPropertyId());

        if (cycle.isCancelled()) {
            throw new ValidationException("Cancelled billing cycle cannot be paid");
        }
        if (cycle.isPaid()) {
            throw new ValidationException("Billing cycle is already paid");
        }
        if (cycle.getTotalAmountPaise() <= 0) {
            throw new ValidationException("There is nothing to collect on this bill");
        }
        return cycle;
    }

    /**
     * The number the code goes to — always from our own records.
     *
     * <p>An account tenant's is their login number, which they have proved they
     * hold by signing in with it. A daily guest stay has no account, so it is
     * the number recorded for the stay at check-in. Never a number from the
     * request: a code sent to a phone the collector chose proves only that the
     * collector has a phone.
     */
    private String payerPhone(BillingCycle cycle) {
        String phone = cycle.getTenantUserId() != null
                ? authModule.findById(cycle.getTenantUserId()).map(UserSummaryResponse::phone).orElse(null)
                : tenancyModule.findById(cycle.getTenancyId()).map(TenancyResponse::tenantPhone).orElse(null);
        if (phone == null || phone.isBlank()) {
            throw new ValidationException(
                    "There is no phone number on record for this tenant, so a code cannot be sent");
        }
        return phone;
    }
}
