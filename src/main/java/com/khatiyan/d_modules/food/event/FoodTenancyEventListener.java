package com.khatiyan.d_modules.food.event;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.food.service.FoodSubscriptionService;
import com.khatiyan.d_modules.tenancy.event.TenancyCancelledEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyEndedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyPendingExitEvent;

@Component
public class FoodTenancyEventListener {

    private final FoodSubscriptionService subscriptionService;

    public FoodTenancyEventListener(FoodSubscriptionService subscriptionService) {
        this.subscriptionService = subscriptionService;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyEnded(TenancyEndedEvent event) {
        subscriptionService.endForTenancy(event.tenancyId(), "Tenancy ended");
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyCancelled(TenancyCancelledEvent event) {
        subscriptionService.endForTenancy(event.tenancyId(), "Tenancy cancelled");
    }

    /** Past its checkout date a stay's account halts, meals included. Ends with the flip, in its transaction. */
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyPendingExit(TenancyPendingExitEvent event) {
        subscriptionService.endForTenancy(event.tenancyId(), "Stay past its checkout date");
    }
}
