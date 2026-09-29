package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;

import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
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
    boolean acceptsUpi,
    /** The ticked ways to be paid, in display order. Cash only until set. */
    List<ManualPaymentMethod> acceptedMethods,
    boolean cashOtpRequired,
    /**
     * The row's version (2026-09-29), sent back as If-Match on save. 0 before
     * the first save, when there is no row yet.
     */
    long version
) {

    public static PropertyPaymentDetailsResponse from(PropertyPaymentDetails details) {
        if (details == null) {
            // Nothing saved: the defaults every property starts on.
            PropertyPaymentDetails defaults = PropertyPaymentDetails.empty(null);
            return new PropertyPaymentDetailsResponse(
                    null, null, null, null, null, null, null, false,
                    defaults.acceptedMethods(), defaults.isCashOtpRequired(), 0L);
        }
        return new PropertyPaymentDetailsResponse(
                details.getUpiVpa(),
                details.getPayeeName(),
                details.getUpiPhone(),
                details.getUpiQrImageUrl(),
                details.getBankAccountNumber(),
                details.getBankIfsc(),
                details.getBankAccountHolder(),
                details.canAcceptUpi(),
                details.acceptedMethods(),
                details.isCashOtpRequired(),
                details.getVersion());
    }
}
