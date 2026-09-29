package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;

import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Owner/manager request to record an offline payment for a billing cycle.
 *
 * <p>No amount is accepted: the payment covers the full cycle total (partial
 * payments are not supported yet). The cycle is marked paid on success.
 */
public record RecordManualPaymentRequest(
    @NotNull ManualPaymentMethod method,
    @Size(max = 120) String referenceText,

    /**
     * Proof photos, at most two.
     *
     * <p>Two because the evidence usually comes in pairs — a cheque's face and
     * counterfoil, a card slip's merchant and customer copies, a UPI screenshot
     * and the bank's SMS. The cap is a form rule and lives here rather than in
     * the schema, so raising it is a number rather than a migration.
     */
    @Size(max = 2, message = "Attach at most two proof photos")
    List<@Size(max = 600) String> proofImageUrls,
    @Size(max = 500) String note,

    /**
     * The tenant's cash-payment code, read out as they hand the money over.
     *
     * <p>Required for CASH recorded against a bill, and ignored for every other
     * method. Six digits, matching what the OTP system issues — checked here so
     * a mistyped five-digit entry is a field error, not a spent attempt.
     */
    @Pattern(regexp = "\\d{6}", message = "Enter the 6-digit code from the tenant's phone")
    String otp
) {

    /**
     * Without a code, for payments recorded by the system itself rather than
     * at a bill — a confirmed UPI claim, or a charge collected at move-out.
     */
    public RecordManualPaymentRequest(
            ManualPaymentMethod method, String referenceText, List<String> proofImageUrls, String note) {
        this(method, referenceText, proofImageUrls, note, null);
    }
}
