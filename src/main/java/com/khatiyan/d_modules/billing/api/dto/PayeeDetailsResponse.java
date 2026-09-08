package com.khatiyan.d_modules.billing.api.dto;

import com.khatiyan.d_modules.billing.model.PropertyPaymentDetails;

/**
 * How a tenant may pay.
 *
 * <p>
 * Carries the bank reference as well as the UPI routes: the pay sheet offers
 * them as two tabs, so a tenant whose bank app is easier than their UPI app can
 * still transfer. The bank half is shown only when the owner filled it in — with
 * nothing there the sheet is UPI alone and shows no tabs at all, rather than a
 * chooser with one real option.
 */
public record PayeeDetailsResponse(
    /** Shown as who they are paying. */
    String payeeName,

    // --- UPI ---
    String upiVpa,
    String upiPhone,
    /** The owner's QR, for scanning from another device. */
    String upiQrImageUrl,

    // --- Bank transfer ---
    String bankAccountNumber,
    String bankIfsc,
    String bankAccountHolder,

    /**
     * Whether the bank tab has anything to show.
     *
     * <p>Sent rather than derived on the client, so "is there a second tab" has
     * one definition and it is the server's — the same reason {@code live} is
     * sent on an intent.
     */
    boolean hasBankDetails
) {

    public static PayeeDetailsResponse from(PropertyPaymentDetails details) {
        if (details == null) {
            return null;
        }
        return new PayeeDetailsResponse(
                details.getPayeeName(),
                details.getUpiVpa(),
                details.getUpiPhone(),
                details.getUpiQrImageUrl(),
                details.getBankAccountNumber(),
                details.getBankIfsc(),
                details.getBankAccountHolder(),
                details.hasBankDetails());
    }
}
