package com.khatiyan.d_modules.food.event;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.food.service.FoodSubscriptionService;
import com.khatiyan.d_modules.tenancy.event.TenancyCancelledEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyEndedEvent;

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
}
