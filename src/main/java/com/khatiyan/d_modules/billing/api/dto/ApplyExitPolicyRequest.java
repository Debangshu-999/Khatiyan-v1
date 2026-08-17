package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;

import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Every money movement the end-tenancy screen decided, applied as one unit.
 *
 * <p>This crosses from tenancy into billing as <em>intent</em>, never as priced
 * amounts: damage items arrive as names and are priced here from the property's
 * own schedule. A client that sends a stale or invented figure cannot make it
 * stick.
 *
 * <p>Order is part of the contract. The early-exit charge is applied before
 * damages, so the deposit question the actor answered — "is the remainder
 * refundable?" — is asked of the same remainder the server computes.
 */
public record ApplyExitPolicyRequest(

        /**
         * The early-exit charge, possibly split across instruments.
         *
         * <p>A list because one charge can outgrow the deposit: a month's rent
         * of Rs 13,000 against a Rs 10,000 deposit is settled as Rs 10,000 taken
         * from the deposit and Rs 3,000 collected as a bill. Forcing a single
         * instrument would make the actor round the figure or abandon the
         * deposit entirely. Applied in the order given.
         */
        @Valid List<ExitCharge> earlyExitCharges,

        @Valid DamageCharge damages,

        /**
         * Whether the remaining deposit is refundable. Null only for stays that
         * have no deposit account at all — daily stays.
         */
        Boolean depositPayable,

        /**
         * Photo of the money actually changing hands at move-out — a receipt, a
         * UPI screenshot, a counterfoil.
         *
         * <p>One proof for the whole exit, not one per charge, because the
         * billed charges collapse into a single bill and a single payment here.
         * Asking per charge would imply records that do not exist.
         *
         * <p>Ignored when nothing is billed: a settlement paid entirely out of
         * the deposit moves no cash and has nothing to photograph.
         */
        @Size(max = 600) String proofImageUrl) {

    /** The owner's written early-exit rule, priced by the actor who applied it. */
    public record ExitCharge(
            @Positive(message = "Early exit charge must be greater than zero") long amountPaise,
            @NotNull(message = "Choose how the early exit charge is collected") ExitChargeInstrument instrument,
            @Size(max = 200) String reason,
            /**
             * How a billed charge was actually collected. Ignored for a deposit
             * deduction. Null falls back to cash rather than failing, so an older
             * client cannot block an exit — but a wrong method here is a wrong
             * payment record, which is why the screen asks.
             */
            ManualPaymentMethod collectedVia) {
    }

    /** Damage assessed at move-out: schedule items by name, plus anything unlisted. */
    public record DamageCharge(
            List<String> itemNames,
            @Valid List<CustomCharge> customCharges,
            @NotNull(message = "Choose how damage charges are collected") ExitChargeInstrument instrument,
            /** How a billed damage charge was collected. Null falls back to cash. */
            ManualPaymentMethod collectedVia) {
    }

    public record CustomCharge(
            @NotBlank(message = "Reason is required") @Size(max = 120) String reason,
            @Positive(message = "Amount must be greater than zero") long amountPaise) {
    }
}
