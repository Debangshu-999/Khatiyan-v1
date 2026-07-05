package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.modulith.events.ApplicationModuleListener;

import com.khatiyan.d_modules.billing.event.BillingCycleGeneratedEvent;
import com.khatiyan.d_modules.billing.event.BillingLateFeeAppliedEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;

/**
 * Converts billing-cycle lifecycle events into tenant payment notifications.
 */
@Component
public class BillingCycleNotificationEventListener {

    private final NotificationModule notificationModule;

    public BillingCycleNotificationEventListener(NotificationModule notificationModule) {
        this.notificationModule = notificationModule;
    }

    @ApplicationModuleListener
    public void onBillingCycleGenerated(BillingCycleGeneratedEvent event) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("billingCycleId", event.billingCycleId().toString());
        data.put("tenancyId", event.tenancyId().toString());
        data.put("propertyId", event.propertyId().toString());
        data.put("tenantUserId", event.tenantUserId().toString());
        data.put("cycleNumber", Integer.toString(event.cycleNumber()));
        data.put("rentDueDate", event.rentDueDate().toString());
        data.put("totalAmountPaise", Long.toString(event.totalAmountPaise()));

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Rent bill generated",
                "Your billing cycle " + event.cycleNumber() + " is ready. Due date: " + event.rentDueDate() + ".",
                NotificationCategory.PAYMENT,
                NotificationPriority.NORMAL,
                NotificationSubtype.BILLING_CYCLE_GENERATED,
                event.billingCycleId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @ApplicationModuleListener
    public void onBillingLateFeeApplied(BillingLateFeeAppliedEvent event) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("billingCycleId", event.billingCycleId().toString());
        data.put("lineItemId", event.lineItemId().toString());
        data.put("tenancyId", event.tenancyId().toString());
        data.put("propertyId", event.propertyId().toString());
        data.put("tenantUserId", event.tenantUserId().toString());
        data.put("lateFeeAmountPaise", Long.toString(event.lateFeeAmountPaise()));

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Late fee updated",
                "A late fee of " + formatAmount(event.lateFeeAmountPaise()) + " has been applied to your bill.",
                NotificationCategory.PAYMENT,
                NotificationPriority.HIGH,
                NotificationSubtype.BILLING_LATE_FEE_APPLIED,
                event.billingCycleId(),
                data,
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
