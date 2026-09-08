package com.khatiyan.d_modules.billing.api;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.billing.api.dto.ConfirmPaymentIntentRequest;
import com.khatiyan.d_modules.billing.api.dto.PaymentIntentResponse;
import com.khatiyan.d_modules.billing.api.dto.PropertyPaymentDetailsResponse;
import com.khatiyan.d_modules.billing.api.dto.StartPaymentResponse;
import com.khatiyan.d_modules.billing.api.dto.TenantPaymentStateResponse;
import com.khatiyan.d_modules.billing.api.dto.UpdatePropertyPaymentDetailsRequest;
import com.khatiyan.d_modules.billing.service.PaymentIntentService;
import com.khatiyan.d_modules.billing.service.PropertyPaymentDetailsService;

import jakarta.validation.Valid;

/**
 * REST boundary for UPI payment claims.
 *
 * <p>
 * Two audiences on one controller because they are two halves of one exchange:
 * the tenant opens a claim and answers for it, the owner rules on it. Splitting
 * them would put the lifecycle in two files and make the sequence harder to read
 * than it is to implement.
 *
 * <p>
 * <b>No money moves through any of these.</b> The tenant's own banking app pays
 * the owner directly over UPI, and these endpoints record the claim and the
 * verdict.
 */
@RestController
@RequestMapping("/api/v1/billing")
@SuppressWarnings("null")
public class PaymentIntentController {

    private final PaymentIntentService paymentIntentService;
    private final PropertyPaymentDetailsService paymentDetailsService;

    public PaymentIntentController(
            PaymentIntentService paymentIntentService,
            PropertyPaymentDetailsService paymentDetailsService) {
        this.paymentIntentService = paymentIntentService;
        this.paymentDetailsService = paymentDetailsService;
    }

    // ---- Tenant ----------------------------------------------------------

    /** Whether to offer Pay Now, and whether an attempt is already open. */
    @GetMapping("/me/cycles/{billingCycleId}/payment-state")
    public TenantPaymentStateResponse myPaymentState(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId) {
        return paymentIntentService.tenantStateFor(user.userId(), billingCycleId);
    }

    /**
     * Opens an attempt and returns the link to fire.
     *
     * <p>Refused when one is already live — that block is also a database
     * constraint, so a double-tap cannot open two.
     */
    @PostMapping("/me/cycles/{billingCycleId}/payment-intents")
    public StartPaymentResponse startPayment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId) {
        var started = paymentIntentService.startPayment(user.userId(), billingCycleId);
        return new StartPaymentResponse(
                PaymentIntentResponse.from(started.intent(), null), started.upiLink(), started.payee());
    }

    /** "It did not go through." Frees the bill for another attempt. */
    @PostMapping("/me/payment-intents/{intentId}/cancel")
    public PaymentIntentResponse cancelMyPayment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID intentId) {
        return PaymentIntentResponse.from(
                paymentIntentService.cancelByTenant(user.userId(), intentId), null);
    }

    /** "I paid." Evidence optional. Sends the bill to the owner to check. */
    @PostMapping("/me/payment-intents/{intentId}/confirm")
    public PaymentIntentResponse confirmMyPayment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID intentId,
            @Valid @RequestBody ConfirmPaymentIntentRequest request) {
        return PaymentIntentResponse.from(
                paymentIntentService.confirmByTenant(
                        user.userId(),
                        intentId,
                        request.referenceText(),
                        request.note(),
                        request.proofImageUrls()),
                null);
    }

    /** Every attempt on one bill, newest first — the ledger under a bill. */
    @GetMapping("/me/cycles/{billingCycleId}/payment-intents")
    public List<PaymentIntentResponse> myPaymentIntents(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId) {
        return paymentIntentService.listMyIntentsForCycle(user.userId(), billingCycleId);
    }

    /** Live attempts across a stay, so a bill list can lock the right buttons. */
    @GetMapping("/me/tenancies/{tenancyId}/payment-intents/live")
    public List<PaymentIntentResponse> myLivePaymentIntents(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return paymentIntentService.listMyLiveIntentsForTenancy(user.userId(), tenancyId);
    }

    // ---- Owner -----------------------------------------------------------

    /**
     * One month of this property's claims, newest first, decided or not.
     *
     * <p>Was "everything still awaiting review". That list emptied itself as the
     * owner worked through it, so the screen could never answer "what did I
     * approve last week" — and month by month is how an owner reads a statement.
     */
    @GetMapping("/properties/{propertyId}/payment-intents")
    public List<PaymentIntentResponse> claimsForMonth(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String month) {
        return paymentIntentService.listForOwnerMonth(user.userId(), propertyId, month);
    }

    /** Found it in the statement. Marks the bill paid in the same transaction. */
    @PostMapping("/payment-intents/{intentId}/verify")
    public PaymentIntentResponse verify(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID intentId) {
        return PaymentIntentResponse.from(paymentIntentService.verifyByOwner(user.userId(), intentId), null);
    }

    /** Not in the statement. Puts the bill back and frees the tenant to retry. */
    @PostMapping("/payment-intents/{intentId}/reject")
    public PaymentIntentResponse reject(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID intentId) {
        return PaymentIntentResponse.from(paymentIntentService.rejectByOwner(user.userId(), intentId), null);
    }

    // ---- Owner: where the money goes -------------------------------------

    @GetMapping("/properties/{propertyId}/payment-details")
    public PropertyPaymentDetailsResponse paymentDetails(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return paymentDetailsService.get(user.userId(), propertyId);
    }

    /** Replaces the whole set — clearing the UPI address turns payment off. */
    @PutMapping("/properties/{propertyId}/payment-details")
    public PropertyPaymentDetailsResponse updatePaymentDetails(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UpdatePropertyPaymentDetailsRequest request) {
        return paymentDetailsService.update(user.userId(), propertyId, request);
    }
}
