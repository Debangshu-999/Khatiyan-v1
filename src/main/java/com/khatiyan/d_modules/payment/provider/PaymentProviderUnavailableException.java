package com.khatiyan.d_modules.payment.provider;

import com.khatiyan.c_shared.exception.BusinessException;

/**
 * Raised when the configured external payment gateway cannot accept requests.
 */
public class PaymentProviderUnavailableException extends BusinessException {

    public PaymentProviderUnavailableException(String message) {
        super("PAYMENT_PROVIDER_UNAVAILABLE", message);
    }
}
