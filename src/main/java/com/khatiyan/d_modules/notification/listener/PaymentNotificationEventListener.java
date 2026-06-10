package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
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
        Map<String, String> data = basePaymentData(event.paymentOrderId(), event.billingCycleId(),
                event.tenancyId(), event.propertyId(), event.tenantUserId(),
                event.amountPaise(), event.currency());
        if (event.providerPaymentId() != null) {
            data.put("providerPaymentId", event.providerPaymentId());
        }

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Payment successful",
                "Your payment of " + formatAmount(event.amountPaise()) + " was received.",
                NotificationCategory.PAYMENT,
                NotificationPriority.NORMAL,
                NotificationSubtype.PAYMENT_SUCCEEDED,
                event.paymentOrderId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPaymentFailed(PaymentFailedEvent event) {
        Map<String, String> data = basePaymentData(event.paymentOrderId(), event.billingCycleId(),
                event.tenancyId(), event.propertyId(), event.tenantUserId(),
                event.amountPaise(), event.currency());
        if (event.failureReason() != null) {
            data.put("failureReason", event.failureReason());
        }

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Payment failed",
                failureBody(event),
                NotificationCategory.PAYMENT,
                NotificationPriority.HIGH,
                NotificationSubtype.PAYMENT_FAILED,
                event.paymentOrderId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private Map<String, String> basePaymentData(java.util.UUID paymentOrderId, java.util.UUID billingCycleId,
                                                 java.util.UUID tenancyId, java.util.UUID propertyId,
                                                 java.util.UUID tenantUserId, long amountPaise, String currency) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("paymentOrderId", paymentOrderId.toString());
        if (billingCycleId != null) {
            data.put("billingCycleId", billingCycleId.toString());
        }
        data.put("tenancyId", tenancyId.toString());
        data.put("propertyId", propertyId.toString());
        data.put("tenantUserId", tenantUserId.toString());
        data.put("amountPaise", Long.toString(amountPaise));
        if (currency != null) {
            data.put("currency", currency);
        }
        return data;
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
