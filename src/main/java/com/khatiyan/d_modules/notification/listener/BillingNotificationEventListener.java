package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.modulith.events.ApplicationModuleListener;

import com.khatiyan.d_modules.billing.event.BillingLineItemNotificationAction;
import com.khatiyan.d_modules.billing.event.BillingLineItemNotificationEvent;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemStatus;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;
import com.khatiyan.d_modules.billing.model.BillingLineSettlementAction;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;

/**
 * Converts tenant-visible billing line changes into notifications.
 */
@Component
public class BillingNotificationEventListener {

    private final NotificationModule notificationModule;

    public BillingNotificationEventListener(NotificationModule notificationModule) {
        this.notificationModule = notificationModule;
    }

    @ApplicationModuleListener
    public void onBillingLineItemChanged(BillingLineItemNotificationEvent event) {
        if (!shouldNotifyTenant(event)) {
            return;
        }

        Map<String, String> data = new LinkedHashMap<>();
        data.put("lineItemId", event.lineItemId().toString());
        if (event.billingCycleId() != null) {
            data.put("billingCycleId", event.billingCycleId().toString());
        }
        data.put("tenancyId", event.tenancyId().toString());
        data.put("propertyId", event.propertyId().toString());
        data.put("tenantUserId", event.tenantUserId().toString());
        data.put("lineType", event.type().name());
        if (event.status() != null) {
            data.put("status", event.status().name());
        }
        if (event.settlementAction() != null) {
            data.put("settlementAction", event.settlementAction().name());
        }
        data.put("action", event.action().name());
        if (event.label() != null) {
            data.put("label", event.label());
        }
        data.put("amountPaise", Long.toString(event.amountPaise()));
        data.put("settlementAmountPaise", Long.toString(event.settlementAmountPaise()));

        notificationModule.notifyUser(
                event.tenantUserId(),
                title(event),
                body(event),
                NotificationCategory.PAYMENT,
                priority(event),
                NotificationSubtype.BILLING_LINE_ITEM_CHANGED,
                event.billingCycleId() != null ? event.billingCycleId() : event.lineItemId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private boolean shouldNotifyTenant(BillingLineItemNotificationEvent event) {
        return event.type() == BillingCycleLineItemType.EXTRA_CHARGE
                || event.type() == BillingCycleLineItemType.DISCOUNT
                || event.type() == BillingCycleLineItemType.LATE_FEE;
    }

    private String title(BillingLineItemNotificationEvent event) {
        if (event.type() == BillingCycleLineItemType.DISCOUNT) {
            if (event.action() == BillingLineItemNotificationAction.CLEARED) {
                return "Billing discount cleared";
            }

            return "Billing discount updated";
        }

        if (event.type() == BillingCycleLineItemType.LATE_FEE) {
            return "Late fee updated";
        }

        if (event.action() == BillingLineItemNotificationAction.MOVED_TO_DEPOSIT
                || event.settlementAction() == BillingLineSettlementAction.ADJUSTED_FROM_DEPOSIT) {
            return "Charge adjusted from deposit";
        }

        if (event.action() == BillingLineItemNotificationAction.CLEARED) {
            return "Billing charge cleared";
        }

        return "Billing charge updated";
    }

    private String body(BillingLineItemNotificationEvent event) {
        String lineLabel = event.label() != null && !event.label().isBlank()
                ? event.label()
                : "Billing line";

        if (event.action() == BillingLineItemNotificationAction.CLEARED) {
            return lineLabel + " was cleared.";
        }

        long displayAmount = event.settlementAmountPaise() > 0
                ? event.settlementAmountPaise()
                : event.amountPaise();

        if (event.status() == BillingCycleLineItemStatus.PENDING) {
            return lineLabel + " of " + formatAmount(displayAmount) + " will be applied to the upcoming cycle.";
        }

        if (event.settlementAction() == BillingLineSettlementAction.ADJUSTED_FROM_DEPOSIT) {
            return lineLabel + " of " + formatAmount(displayAmount) + " will be deducted from your deposit.";
        }

        if (event.type() == BillingCycleLineItemType.DISCOUNT) {
            return lineLabel + " of " + formatAmount(displayAmount) + " was applied to your bill.";
        }

        return lineLabel + " of " + formatAmount(displayAmount) + " was applied to your bill.";
    }

    private NotificationPriority priority(BillingLineItemNotificationEvent event) {
        if (event.type() == BillingCycleLineItemType.EXTRA_CHARGE
                || event.type() == BillingCycleLineItemType.LATE_FEE) {
            return NotificationPriority.HIGH;
        }

        return NotificationPriority.NORMAL;
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
