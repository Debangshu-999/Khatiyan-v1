package com.khatiyan.d_modules.payment.model;

/**
 * Payment rail used by the tenant.
 *
 * <p>Providers may use slightly different names. The service layer should
 * normalize provider values into this enum where possible.
 */
public enum PaymentMethod {
    UPI,
    CARD,
    NETBANKING,
    WALLET,
    EMI,
    PAYLATER,
    UNKNOWN
}
