package com.khatiyan.d_modules.expense.api.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Monthly profit-and-loss statement for a property.
 *
 * <p>Income has three sources, all recognised when earned (actual, not projected)
 * so the parts sum to the total:
 * <ul>
 *   <li>Rent bills — {@code billRentCount} cycles totalling {@code billRentPaise};</li>
 *   <li>Other bills (penalties, ad-hoc charges) — {@code billOneOffCount} / {@code billOneOffPaise};</li>
 *   <li>Manual income — owner-entered, not through billing ({@code manualIncomePaise}).</li>
 * </ul>
 * {@code billCollectedPaise} is what has actually been paid; {@code billUncollectedPaise}
 * is billed − collected (money still to come in). {@code expensePaise} comes from the
 * expense module (ledger + projected salary). {@code netPaise} is total income − expense
 * (profit if positive, loss if negative); {@code netRealizedPaise} is the same on a
 * cash basis (collected − expense).
 */
public record PnlStatementResponse(
        LocalDate month,
        boolean hasData,

        int billRentCount,
        long billRentPaise,
        int billOneOffCount,
        long billOneOffPaise,
        long billBilledPaise,
        long billCollectedPaise,
        long billUncollectedPaise,

        long manualIncomePaise,
        List<PnlLine> manualIncomeBreakdown,

        long totalIncomePaise,
        long totalRealizedIncomePaise,

        long expensePaise,
        List<PnlLine> expenseBreakdown,

        long netPaise,
        long netRealizedPaise) {
}
