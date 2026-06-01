package com.khatiyan.d_modules.notification.listener;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.payment.event.PaymentFailedEvent;
import com.khatiyan.d_modules.payment.event.PaymentSucceededEvent;

/**
 * Converts durable payment outcomes into tenant notifications.
 */
@Component
public class PaymentNotificationEventListener {

    private final NotificationModule notificationModule;

    public PaymentNotificationEventListener(NotificationModule notificationModule) {
        this.notificationModule = notificationModule;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPaymentSucceeded(PaymentSucceededEvent event) {
        notificationModule.notifyUser(
                event.tenantUserId(),
                "Payment successful",
                "Your payment of " + formatAmount(event.amountPaise()) + " was received.",
                NotificationCategory.PAYMENT,
                NotificationPriority.NORMAL,
                event.paymentOrderId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPaymentFailed(PaymentFailedEvent event) {
        notificationModule.notifyUser(
                event.tenantUserId(),
                "Payment failed",
                failureBody(event),
                NotificationCategory.PAYMENT,
                NotificationPriority.HIGH,
                event.paymentOrderId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private String failureBody(PaymentFailedEvent event) {
        if (event.failureReason() == null || event.failureReason().isBlank()) {
            return "Your payment of " + formatAmount(event.amountPaise()) + " could not be completed.";
        }

        return "Your payment of " + formatAmount(event.amountPaise()) + " failed: " + event.failureReason();
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
