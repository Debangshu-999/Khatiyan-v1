package com.khatiyan.d_modules.payment.provider;

import java.util.UUID;

/**
 * Provider-neutral request to create/activate an owner payout account
 * (Razorpay Route linked account). The full account number is used only for the
 * gateway call and is not persisted.
 *
 * <p>{@code pan} feeds the gateway's KYC (Razorpay's {@code legal_info.pan} and
 * stakeholder {@code kyc.pan}); without it a linked account stalls in review.
 *
 * <p>The address fields describe the owner's registered address. We default them
 * from the property they let out, which is the same place for most individual PG
 * owners — the alternative is asking every owner to re-enter an address we
 * already hold.
 */
public record CreateLinkedAccountCommand(
        UUID ownerUserId,
        String accountHolderName,
        String accountNumber,
        String ifsc,
        String pan,
        String email,
        String phone,
        String street,
        String city,
        String state,
        String postalCode) {
}
