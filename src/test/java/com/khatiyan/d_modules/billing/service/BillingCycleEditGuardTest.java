package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.CreateDiscountRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateExtraChargeRequest;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.BillingCycleCategory;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItem;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.billing.repository.BillingCycleLineItemRepository;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

/**
 * The edit gate: who may still change a bill, and when.
 *
 * <p>The rule this pins down is easy to get backwards. A rent cycle is generated
 * ten days ahead as UPCOMING and freezes when it goes live, so that a tenant owes
 * exactly the amount they were shown. Cycle 1 of a tenancy never gets that
 * window — {@code createFirstCycle} creates and activates it in one transaction
 * at onboarding — so it is the one cycle that stays editable while live, until it
 * is paid. Without the exemption it was the only bill nobody could ever change,
 * not even to discount it on the day it was raised.
 *
 * <p>Written against the service rather than {@code BillingCycle} because the
 * gate lives in {@code ensureCycleStillEditable}, and it is reached only through
 * the public add paths. A model-level test would pass while the callers skipped
 * it, which is exactly how the add paths came to bypass the guard entirely.
 */
@ExtendWith(MockitoExtension.class)
class BillingCycleEditGuardTest {

    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID TENANCY_ID = UUID.randomUUID();
    private static final LocalDate PERIOD_START = LocalDate.of(2026, 6, 1);

    @Mock
    private BillingCycleRepository billingCycleRepository;

    @Mock
    private BillingCycleLineItemRepository lineItemRepository;

    @Mock
    private BillingAccessPolicy billingAccessPolicy;

    @Mock
    private DepositManagerService depositManagerService;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private BillingCycleLineItemService service;

    // ---- Cycle 1: live and still editable ---------------------------------

    @Test
    void firstCycleTakesAnExtraChargeWhileLive() {
        givenLatestCycle(rentCycle(1, BillingCycleStatus.UNPAID));
        givenLineItemReadsSucceed();

        assertThatCode(() -> service.addExtraChargeForTenancy(ACTOR_ID, TENANCY_ID, List.of(extraCharge())))
                .doesNotThrowAnyException();

        verify(lineItemRepository).save(any(BillingCycleLineItem.class));
    }

    /**
     * Overdue is not a lock. The gate asks whether the bill is PAID, and an
     * overdue bill is precisely one that is not — so a late tenant can still be
     * given a discount or charged for something.
     */
    @Test
    void firstCycleTakesAnExtraChargeWhileOverdue() {
        givenLatestCycle(rentCycle(1, BillingCycleStatus.OVERDUE));
        givenLineItemReadsSucceed();

        assertThatCode(() -> service.addExtraChargeForTenancy(ACTOR_ID, TENANCY_ID, List.of(extraCharge())))
                .doesNotThrowAnyException();

        verify(lineItemRepository).save(any(BillingCycleLineItem.class));
    }

    @Test
    void firstCycleTakesADiscountWhileLive() {
        BillingCycle cycle = rentCycle(1, BillingCycleStatus.UNPAID);
        cycle.recalculateTotals(12_000_00, 0, 0, 0, 0);
        givenLatestCycle(cycle);
        givenLineItemReadsSucceed();

        service.addDiscountForTenancy(ACTOR_ID, TENANCY_ID, discountOf("10"));

        verify(lineItemRepository).save(any(BillingCycleLineItem.class));
    }

    @Test
    void firstCycleTakesADiscountWhileOverdue() {
        BillingCycle cycle = rentCycle(1, BillingCycleStatus.OVERDUE);
        cycle.recalculateTotals(12_000_00, 0, 0, 0, 0);
        givenLatestCycle(cycle);
        givenLineItemReadsSucceed();

        service.addDiscountForTenancy(ACTOR_ID, TENANCY_ID, discountOf("10"));

        verify(lineItemRepository).save(any(BillingCycleLineItem.class));
    }

    @Test
    void paidFirstCycleRefusesADiscount() {
        BillingCycle cycle = rentCycle(1, BillingCycleStatus.PAID);
        givenLatestCycle(cycle);

        assertThatThrownBy(() -> service.addDiscountForTenancy(ACTOR_ID, TENANCY_ID, discountOf("10")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Paid billing cycle cannot be edited");

        verify(lineItemRepository, never()).save(any(BillingCycleLineItem.class));
    }

    @Test
    void paidFirstCycleIsClosed() {
        givenLatestCycle(rentCycle(1, BillingCycleStatus.PAID));

        assertThatThrownBy(() -> service.addExtraChargeForTenancy(ACTOR_ID, TENANCY_ID, List.of(extraCharge())))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Paid billing cycle cannot be edited");

        verify(lineItemRepository, never()).save(any(BillingCycleLineItem.class));
    }

    /**
     * Cancellation closes even the exempt cycle. The first-cycle exemption is
     * only an exemption from the LIVE lock — a cancelled bill has no total worth
     * changing, and letting one be edited would resurrect it by the back door.
     */
    @Test
    void cancelledFirstCycleIsClosed() {
        givenLatestCycle(rentCycle(1, BillingCycleStatus.CANCELLED));

        assertThatThrownBy(() -> service.addExtraChargeForTenancy(ACTOR_ID, TENANCY_ID, List.of(extraCharge())))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Cancelled billing cycle cannot be edited");

        verify(lineItemRepository, never()).save(any(BillingCycleLineItem.class));
    }

    @Test
    void cancelledFirstCycleRefusesADiscount() {
        givenLatestCycle(rentCycle(1, BillingCycleStatus.CANCELLED));

        assertThatThrownBy(() -> service.addDiscountForTenancy(ACTOR_ID, TENANCY_ID, discountOf("10")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Cancelled billing cycle cannot be edited");

        verify(lineItemRepository, never()).save(any(BillingCycleLineItem.class));
    }

    // ---- Later cycles: the lock still bites -------------------------------

    @Test
    void laterCycleIsEditableWhileUpcoming() {
        givenLatestCycle(rentCycle(2, BillingCycleStatus.UPCOMING));
        givenLineItemReadsSucceed();

        assertThatCode(() -> service.addExtraChargeForTenancy(ACTOR_ID, TENANCY_ID, List.of(extraCharge())))
                .doesNotThrowAnyException();

        verify(lineItemRepository).save(any(BillingCycleLineItem.class));
    }

    /**
     * The whole point of generating a cycle ten days early. Cycle 2 onwards is
     * fully editable during that window — the lock only closes when it activates.
     */
    @Test
    void laterCycleTakesADiscountWhileUpcoming() {
        BillingCycle cycle = rentCycle(2, BillingCycleStatus.UPCOMING);
        cycle.recalculateTotals(12_000_00, 0, 0, 0, 0);
        givenLatestCycle(cycle);
        givenLineItemReadsSucceed();

        service.addDiscountForTenancy(ACTOR_ID, TENANCY_ID, discountOf("10"));

        verify(lineItemRepository).save(any(BillingCycleLineItem.class));
    }

    @Test
    void laterCycleRefusesAnExtraChargeOnceLive() {
        givenLatestCycle(rentCycle(2, BillingCycleStatus.UNPAID));

        assertThatThrownBy(() -> service.addExtraChargeForTenancy(ACTOR_ID, TENANCY_ID, List.of(extraCharge())))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already live")
                .hasMessageContaining("one-off bill");

        verify(lineItemRepository, never()).save(any(BillingCycleLineItem.class));
    }

    /**
     * Overdue is not a second chance at the edit window. It is as locked as
     * UNPAID for a later cycle — {@code isLocked()} is "anything but UPCOMING" —
     * so a tenant running late does not reopen their bill for new charges.
     */
    @Test
    void laterCycleRefusesAnExtraChargeOnceOverdue() {
        givenLatestCycle(rentCycle(2, BillingCycleStatus.OVERDUE));

        assertThatThrownBy(() -> service.addExtraChargeForTenancy(ACTOR_ID, TENANCY_ID, List.of(extraCharge())))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already live");

        verify(lineItemRepository, never()).save(any(BillingCycleLineItem.class));
    }

    /**
     * Refused, not queued. Charges and discounts on a live cycle used to be
     * written as PENDING and attached to the next cycle; that existed because a
     * tenant might be paying the live bill online. With collection manual, the
     * charge belongs on a one-off bill instead.
     */
    @Test
    void laterCycleRefusesADiscountOnceLive() {
        givenLatestCycle(rentCycle(2, BillingCycleStatus.UNPAID));

        assertThatThrownBy(() -> service.addDiscountForTenancy(ACTOR_ID, TENANCY_ID, discountOf("10")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already live");

        verify(lineItemRepository, never()).save(any(BillingCycleLineItem.class));
    }

    @Test
    void laterCycleRefusesADiscountOnceOverdue() {
        givenLatestCycle(rentCycle(2, BillingCycleStatus.OVERDUE));

        assertThatThrownBy(() -> service.addDiscountForTenancy(ACTOR_ID, TENANCY_ID, discountOf("10")))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already live");

        verify(lineItemRepository, never()).save(any(BillingCycleLineItem.class));
    }

    // ---- One-off bills ----------------------------------------------------

    @Test
    void oneOffBillStaysEditableWhileLive() {
        givenLatestCycle(oneOffCycle());
        givenLineItemReadsSucceed();

        assertThatCode(() -> service.addExtraChargeForTenancy(ACTOR_ID, TENANCY_ID, List.of(extraCharge())))
                .doesNotThrowAnyException();

        verify(lineItemRepository).save(any(BillingCycleLineItem.class));
    }

    @Test
    void oneOffBillTakesADiscountWhileLive() {
        BillingCycle cycle = oneOffCycle();
        cycle.recalculateTotals(12_000_00, 0, 0, 0, 0);
        givenLatestCycle(cycle);
        givenLineItemReadsSucceed();

        service.addDiscountForTenancy(ACTOR_ID, TENANCY_ID, discountOf("10"));

        verify(lineItemRepository).save(any(BillingCycleLineItem.class));
    }

    @Test
    void oneOffBillIsNotAFirstCycle() {
        assertThat(oneOffCycle().isFirstCycle()).isFalse();
        assertThat(rentCycle(1, BillingCycleStatus.UNPAID).isFirstCycle()).isTrue();
    }

    // ---- Fixtures ---------------------------------------------------------

    private void givenLatestCycle(BillingCycle cycle) {
        when(billingCycleRepository.findLatestByTenancyId(eq(TENANCY_ID), any())).thenReturn(List.of(cycle));
    }

    /** Only needed once a call gets past the gate and starts writing. */
    private void givenLineItemReadsSucceed() {
        when(lineItemRepository.findMaxDisplayOrder(any())).thenReturn(0);
        when(lineItemRepository.findByBillingCycleId(any())).thenReturn(List.of());
    }

    private static BillingCycle rentCycle(int cycleNumber, BillingCycleStatus status) {
        return baseCycle().category(BillingCycleCategory.RENT_CYCLE).cycleNumber(cycleNumber).status(status).build();
    }

    private static BillingCycle oneOffCycle() {
        return baseCycle().category(BillingCycleCategory.ONE_OFF).status(BillingCycleStatus.UNPAID).build();
    }

    private static BillingCycle.BillingCycleBuilder baseCycle() {
        return BillingCycle.builder()
                .tenancyId(TENANCY_ID)
                .referenceCode("BILL-TEST")
                .tenantUserId(UUID.randomUUID())
                .tenantNameSnapshot("Test Tenant")
                .propertyId(UUID.randomUUID())
                .roomId(UUID.randomUUID())
                .billingType(TenancyBillingType.MONTHLY)
                .periodStartDate(PERIOD_START)
                .periodEndDate(PERIOD_START.plusMonths(1).minusDays(1))
                .rentDueDate(PERIOD_START.plusDays(3))
                .billingCollectionTiming(BillingCollectionTiming.CYCLE_START)
                .rentGraceDays(3);
    }

    private static CreateExtraChargeRequest extraCharge() {
        return new CreateExtraChargeRequest("Broken window", "Replaced pane", 1_500_00, false);
    }

    private static CreateDiscountRequest discountOf(String percent) {
        return new CreateDiscountRequest("Goodwill", "Late handover", new BigDecimal(percent));
    }
}
