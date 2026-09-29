package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleLineItemResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.model.BillingCycleCategory;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemStatus;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.billing.model.BillingLineSettlementAction;
import com.khatiyan.d_modules.billing.service.BillReceiptPdfService.ReceiptLetterhead;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

/**
 * A new tenant's first bill: ₹11,000 rent, a ₹10,000 starting deposit and a
 * ₹600 late fee, for ₹21,600.
 *
 * <p>The receipt printed Base Rent, Late Fee and Discount, a Subtotal of
 * ₹11,600, and then a Total of ₹21,600 — ten thousand rupees appearing from
 * nowhere on a document whose one job is to account for money. The deposit
 * was never missing from the bill. The cycle has no field for it, so it
 * exists only as a DEPOSIT line folded into the total, and the receipt only
 * ever itemised EXTRA_CHARGE lines.
 */
class BillReceiptPdfServiceTest {

    private static final UUID CYCLE = UUID.randomUUID();
    private static final ReceiptLetterhead LETTERHEAD =
            new ReceiptLetterhead("Sky Luxury PG", "Gachibowli, Hyderabad", null, null);

    private final BillReceiptPdfService service = new BillReceiptPdfService();

    private static BillingCycleLineItemResponse line(
            BillingCycleLineItemType type, String label, long paise, BillingLineSettlementAction action) {
        return new BillingCycleLineItemResponse(
                UUID.randomUUID(), CYCLE, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                type, BillingCycleLineItemStatus.ADDED, label, null,
                paise, paise, action, true, null, null, null, 1, false, Instant.now(), Instant.now());
    }

    private static BillingCycleResponse firstBill(List<BillingCycleLineItemResponse> lines, long totalPaise) {
        return new BillingCycleResponse(
                CYCLE, "BIL-2026-000234", UUID.randomUUID(), "TEN-2026-000001",
                UUID.randomUUID(), "Test Tenant", null, null, UUID.randomUUID(), UUID.randomUUID(), "202",
                TenancyBillingType.MONTHLY, BillingCycleCategory.RENT_CYCLE, 1,
                LocalDate.of(2026, 9, 18), LocalDate.of(2026, 10, 17), LocalDate.of(2026, 9, 21),
                BillingCollectionTiming.CYCLE_START, 3,
                11_000_00, 0, 600_00, 50_00L, 0, totalPaise,
                BillingCycleStatus.OVERDUE, null, Instant.now(), Instant.now(), lines, null, 0L);
    }

    private static BillingCycleResponse firstBillWithDeposit() {
        return firstBill(List.of(
                line(BillingCycleLineItemType.RENT, "Rent", 11_000_00, BillingLineSettlementAction.SYSTEM_CHARGE),
                line(BillingCycleLineItemType.DEPOSIT, "Deposit", 10_000_00, BillingLineSettlementAction.SYSTEM_CHARGE),
                line(BillingCycleLineItemType.LATE_FEE, "Late fee", 600_00, BillingLineSettlementAction.SYSTEM_CHARGE)),
                21_600_00);
    }

    @Test
    void theDepositIsItemised() {
        String receipt = service.buildXhtml(firstBillWithDeposit(), LETTERHEAD);

        assertThat(receipt).contains("<td>Deposit</td><td class=\"amt\">₹10,000.00</td>");
    }

    /** The whole point: the rows above the total have to add up to it. */
    @Test
    void theSubtotalAgreesWithTheTotal() {
        String receipt = service.buildXhtml(firstBillWithDeposit(), LETTERHEAD);

        assertThat(receipt)
                .contains("<td>Subtotal</td><td class=\"amt\">₹21,600.00</td>")
                .doesNotContain("₹11,600.00");
    }

    /** Printed straight under rent, where the bill itself orders it. */
    @Test
    void theDepositSitsUnderRent() {
        String receipt = service.buildXhtml(firstBillWithDeposit(), LETTERHEAD);

        assertThat(receipt.indexOf("<td>Base Rent</td>"))
                .isLessThan(receipt.indexOf("<td>Deposit</td>"));
        assertThat(receipt.indexOf("<td>Deposit</td>"))
                .isLessThan(receipt.indexOf("<td>Late Fee</td>"));
    }

    /** A later bill has no deposit, and must not grow a ₹0.00 row for one. */
    @Test
    void aBillWithoutADepositPrintsNoDepositRow() {
        String receipt = service.buildXhtml(firstBill(List.of(
                line(BillingCycleLineItemType.RENT, "Rent", 11_000_00, BillingLineSettlementAction.SYSTEM_CHARGE)),
                11_000_00), LETTERHEAD);

        assertThat(receipt).doesNotContain("<td>Deposit</td>");
    }

    /** Waived means undone. It stays on the bill as an audit trail, not on the receipt. */
    @Test
    void aWaivedDepositIsLeftOff() {
        String receipt = service.buildXhtml(firstBill(List.of(
                line(BillingCycleLineItemType.RENT, "Rent", 11_000_00, BillingLineSettlementAction.SYSTEM_CHARGE),
                line(BillingCycleLineItemType.DEPOSIT, "Deposit", 0, BillingLineSettlementAction.WAIVED)),
                11_600_00), LETTERHEAD);

        assertThat(receipt).doesNotContain("<td>Deposit</td>");
    }
}
