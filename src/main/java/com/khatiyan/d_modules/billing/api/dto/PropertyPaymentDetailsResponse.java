package com.khatiyan.d_modules.billing.api.dto;

import com.khatiyan.d_modules.billing.model.PropertyPaymentDetails;

/**
 * Where a property's rent should be paid to, as the OWNER sees it.
 *
 * <p>Carries the bank fields, which never reach a tenant — they are the owner's
 * own note of which account the UPI address settles into. The tenant-facing
 * subset is {@link PayeeDetailsResponse}.
 */
public record PropertyPaymentDetailsResponse(
    String upiVpa,
    String payeeName,
    String upiPhone,
    String upiQrImageUrl,
    String bankAccountNumber,
    String bankIfsc,
    String bankAccountHolder,
    /** True when a tenant can be offered payment by any of the three routes. */
    boolean acceptsUpi
) {

    public static PropertyPaymentDetailsResponse from(PropertyPaymentDetails details) {
        if (details == null) {
            return new PropertyPaymentDetailsResponse(null, null, null, null, null, null, null, false);
        }
        return new PropertyPaymentDetailsResponse(
                details.getUpiVpa(),
                details.getPayeeName(),
                details.getUpiPhone(),
                details.getUpiQrImageUrl(),
                details.getBankAccountNumber(),
                details.getBankIfsc(),
                details.getBankAccountHolder(),
                details.canAcceptUpi());
    }
}
