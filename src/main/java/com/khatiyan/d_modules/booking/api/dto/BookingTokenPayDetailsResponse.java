package com.khatiyan.d_modules.booking.api.dto;

import java.time.Instant;
import java.util.List;

import com.khatiyan.d_modules.billing.api.dto.PayeeDetailsResponse;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;

/**
 * What a tenant needs to pay a booking token: how much, by when, whether it
 * comes back if they cancel, and where the property takes money. The money
 * itself moves outside the app.
 *
 * @param refundableOnTenantCancel the owner's answer, as the tenant was shown
 *                                 it when they asked for the bed
 * @param payee                    where a token is paid: the property's bill
 *                                 details, or the token's own where the owner
 *                                 gave some. Null where there is neither
 * @param acceptedMethods          every way a token reaches the property. UPI
 *                                 and a bank transfer are what a person may
 *                                 record. Cash, a card and a cheque are handed
 *                                 over in person and recorded by the property
 * @param deskMethods              how a token may be handed over at the desk
 *                                 and recorded as paid there: cash, a card,
 *                                 UPI and a cheque, at every property
 */
public record BookingTokenPayDetailsResponse(
        String referenceCode,
        long amountPaise,
        boolean refundableOnTenantCancel,
        Instant dueAt,
        PayeeDetailsResponse payee,
        List<ManualPaymentMethod> acceptedMethods,
        List<ManualPaymentMethod> deskMethods) {
}
