package com.khatiyan.d_modules.payment.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.payment.model.OwnerLinkedAccount;
import com.khatiyan.d_modules.payment.model.OwnerLinkedAccountStatus;

/**
 * One bank an owner has on file. {@code primary} marks the account rent is
 * transferred to; every other account is parked until the owner switches.
 */
public record PayoutAccountResponse(
        UUID id,
        OwnerLinkedAccountStatus status,
        String accountHolderName,
        String accountNumberLast4,
        String ifsc,
        String bankName,
        String branchName,
        String pan,
        boolean primary,
        String failureReason) {

    public static PayoutAccountResponse from(OwnerLinkedAccount account) {
        return new PayoutAccountResponse(
                account.getId(),
                account.getStatus(),
                account.getAccountHolderName(),
                account.getAccountNumberLast4(),
                account.getIfsc(),
                account.getBankName(),
                account.getBranchName(),
                account.getPan(),
                account.isPrimary(),
                account.getFailureReason());
    }
}
