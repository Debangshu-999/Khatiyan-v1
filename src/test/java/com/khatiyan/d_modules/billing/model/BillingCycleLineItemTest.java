package com.khatiyan.d_modules.billing.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

class BillingCycleLineItemTest {

    @Test
    void pendingExtraChargeAddedToBillDoesNotHaveCycleUntilNextCycleGeneration() {
        BillingCycle cycle = monthlyCycle();
        UUID actorUserId = UUID.randomUUID();

        BillingCycleLineItem lineItem = BillingCycleLineItem.pendingExtraChargeAddedToBill(
                cycle,
                "Damage charge",
                "Broken switchboard",
                500_00,
                actorUserId,
                1);

        assertThat(lineItem.getBillingCycleId()).isNull();
        assertThat(lineItem.getStatus()).isEqualTo(BillingCycleLineItemStatus.PENDING);
        assertThat(lineItem.getAmountPaise()).isEqualTo(500_00);
        assertThat(lineItem.getSettlementAmountPaise()).isEqualTo(500_00);
        assertThat(lineItem.getSettlementAction()).isEqualTo(BillingLineSettlementAction.ADDED_TO_BILL);
    }

    @Test
    void attachingPendingLineMakesItCountForGeneratedCycle() {
        BillingCycle cycle = monthlyCycle();
        BillingCycleLineItem lineItem = BillingCycleLineItem.pendingExtraChargeAddedToBill(
                cycle,
                "Damage charge",
                "Broken switchboard",
                500_00,
                UUID.randomUUID(),
                1);

        lineItem.attachToCycle(cycle.getId(), 3);

        assertThat(lineItem.getBillingCycleId()).isEqualTo(cycle.getId());
        assertThat(lineItem.getStatus()).isEqualTo(BillingCycleLineItemStatus.ADDED);
        assertThat(lineItem.contributesToExtraAmount()).isTrue();
    }

    @Test
    void extraChargeAdjustedFromDepositDoesNotContributeToPayableAmount() {
        BillingCycle cycle = monthlyCycle();
        BillingCycleLineItem lineItem = BillingCycleLineItem.extraChargeAddedToBill(
                cycle,
                "Cleaning charge",
                "Room deep cleaning",
                800_00,
                UUID.randomUUID(),
                2);

        lineItem.adjustFromDeposit(null, UUID.randomUUID());

        assertThat(lineItem.getAmountPaise()).isZero();
        assertThat(lineItem.getSettlementAmountPaise()).isEqualTo(800_00);
        assertThat(lineItem.getSettlementAction()).isEqualTo(BillingLineSettlementAction.ADJUSTED_FROM_DEPOSIT);
        assertThat(lineItem.contributesToExtraAmount()).isFalse();
    }

    @Test
    void adjustedFromDepositLineCanMoveBackToBillWithExistingAmount() {
        BillingCycle cycle = monthlyCycle();
        BillingCycleLineItem lineItem = BillingCycleLineItem.extraChargeAddedToBill(
                cycle,
                "Cleaning charge",
                "Room deep cleaning",
                800_00,
                UUID.randomUUID(),
                2);
        lineItem.adjustFromDeposit(null, UUID.randomUUID());

        lineItem.adjustToBill(null, UUID.randomUUID());

        assertThat(lineItem.getAmountPaise()).isEqualTo(800_00);
        assertThat(lineItem.getSettlementAmountPaise()).isEqualTo(800_00);
        assertThat(lineItem.getSettlementAction()).isEqualTo(BillingLineSettlementAction.ADDED_TO_BILL);
        assertThat(lineItem.contributesToExtraAmount()).isTrue();
    }

    @Test
    void systemRentLineCannotBeManuallyAdjusted() {
        BillingCycle cycle = monthlyCycle();
        BillingCycleLineItem rentLine = BillingCycleLineItem.systemCharge(
                cycle,
                BillingCycleLineItemType.RENT,
                "Rent",
                "Monthly rent",
                12_000_00,
                1);

        assertThatThrownBy(() -> rentLine.adjust(10_000_00, UUID.randomUUID()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("This billing line cannot be edited manually");
    }

    @Test
    void manualLateFeeCannotBeReplacedByScheduler() {
        BillingCycle cycle = monthlyCycle();
        BillingCycleLineItem lateFee = BillingCycleLineItem.lateFee(
                cycle,
                "Late fee",
                "Automatic late fee",
                200_00,
                4);

        lateFee.adjust(100_00, UUID.randomUUID());

        assertThatThrownBy(() -> lateFee.replaceSystemLateFee(300_00))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Manually adjusted late fee cannot be replaced automatically");
    }

    private static BillingCycle monthlyCycle() {
        LocalDate periodStartDate = LocalDate.of(2026, 6, 1);
        return BillingCycle.create(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Test Tenant",
                UUID.randomUUID(),
                UUID.randomUUID(),
                TenancyBillingType.MONTHLY,
                2,
                periodStartDate,
                periodStartDate.plusMonths(1).minusDays(1),
                periodStartDate.plusDays(3),
                BillingCollectionTiming.CYCLE_START,
                3);
    }
}
