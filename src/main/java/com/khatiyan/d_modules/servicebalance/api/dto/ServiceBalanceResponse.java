package com.khatiyan.d_modules.servicebalance.api.dto;

import java.util.List;

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceAccount;

/**
 * What the owner's balance screen needs in one call.
 *
 * <p>Carries the bounds as well as the money, so the top-up sheet never has to
 * hard-code what the server will accept.
 */
public record ServiceBalanceResponse(
        long availablePaise,
        /** Held against checks already requested. Not spendable, not yet spent. */
        long reservedPaise,
        long totalPaise,
        /** What the owner owes. Shown as pending charges, never as a negative. */
        long outstandingPaise,
        /** Zero while anything is owed. */
        long refundablePaise,
        /** Dues at the ceiling, or the account locked. No new work runs. */
        boolean servicesSuspended,
        String currency,
        long minTopUpPaise,
        long maxTopUpPaise,
        List<Long> quickAmountsPaise,
        boolean topUpEnabled,
        List<ServiceBalanceEntryResponse> recentEntries) {

    public static ServiceBalanceResponse of(
            ServiceBalanceAccount account,
            String currency,
            long minTopUpPaise,
            long maxTopUpPaise,
            List<Long> quickAmountsPaise,
            boolean topUpEnabled,
            boolean servicesSuspended,
            List<ServiceBalanceEntryResponse> recentEntries) {
        return new ServiceBalanceResponse(
                account.getAvailablePaise(),
                account.getReservedPaise(),
                account.totalPaise(),
                account.getOutstandingPaise(),
                account.refundablePaise(),
                servicesSuspended,
                currency,
                minTopUpPaise,
                maxTopUpPaise,
                quickAmountsPaise,
                topUpEnabled,
                recentEntries);
    }
}
