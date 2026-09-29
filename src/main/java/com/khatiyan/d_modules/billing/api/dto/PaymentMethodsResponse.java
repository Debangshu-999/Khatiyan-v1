package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;

import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.billing.model.PropertyPaymentDetails;

/**
 * Which ways a property takes money, and whether cash needs the tenant's code
 * (2026-09-28). What Mark paid and the end-tenancy picker list. Carries no
 * payout details, so managers may read it.
 */
public record PaymentMethodsResponse(List<ManualPaymentMethod> acceptedMethods, boolean cashOtpRequired) {

    public static PaymentMethodsResponse from(PropertyPaymentDetails details) {
        return new PaymentMethodsResponse(details.acceptedMethods(), details.isCashOtpRequired());
    }
}
