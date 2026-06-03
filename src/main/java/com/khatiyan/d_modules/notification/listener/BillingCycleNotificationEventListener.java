package com.khatiyan.d_modules.notification.listener;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.billing.event.BillingCycleGeneratedEvent;
import com.khatiyan.d_modules.billing.event.BillingLateFeeAppliedEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;

/**
 * Converts billing-cycle lifecycle events into tenant payment notifications.
 */
@Component
public class BillingCycleNotificationEventListener {

    private final NotificationModule notificationModule;

    public BillingCycleNotificationEventListener(NotificationModule notificationModule) {
        this.notificationModule = notificationModule;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onBillingCycleGenerated(BillingCycleGeneratedEvent event) {
        notificationModule.notifyUser(
                event.tenantUserId(),
                "Rent bill generated",
                "Your billing cycle " + event.cycleNumber() + " is ready. Due date: " + event.rentDueDate() + ".",
                NotificationCategory.PAYMENT,
                NotificationPriority.NORMAL,
                event.billingCycleId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onBillingLateFeeApplied(BillingLateFeeAppliedEvent event) {
        notificationModule.notifyUser(
                event.tenantUserId(),
                "Late fee updated",
                "A late fee of " + formatAmount(event.lateFeeAmountPaise()) + " has been applied to your bill.",
                NotificationCategory.PAYMENT,
                NotificationPriority.HIGH,
                event.billingCycleId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private String formatAmount(long amountPaise) {
        long rupees = amountPaise / 100;
        long paise = Math.abs(amountPaise % 100);
        if (paise == 0) {
            return "Rs. " + rupees;
        }

        return "Rs. " + rupees + "." + String.format("%02d", paise);
    }
}
