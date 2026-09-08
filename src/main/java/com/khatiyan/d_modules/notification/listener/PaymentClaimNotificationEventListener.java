package com.khatiyan.d_modules.notification.listener;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.billing.event.PaymentClaimRaisedEvent;
import com.khatiyan.d_modules.billing.event.PaymentClaimRejectedEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

/**
 * Turns UPI payment claims into notifications for whoever is now waiting.
 *
 * <p>
 * A claim is the one place in billing where the app asks a person to go and
 * check something in the real world — their bank statement — and until this
 * existed nothing told them to. The bill froze its late-fee clock, the Live
 * digest grew a number, and the owner found out by opening the right screen.
 */
@Component
public class PaymentClaimNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public PaymentClaimNotificationEventListener(
            NotificationModule notificationModule,
            PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    /**
     * A tenant says they have paid. HIGH, because the clock is stopped while it
     * waits — the tenant believes their rent is settled and no late fee is
     * accruing to say otherwise, so a claim nobody looks at is a bill that
     * quietly ages without penalty.
     */
    @ApplicationModuleListener
    public void onClaimRaised(PaymentClaimRaisedEvent event) {
        PropertyResponse property = propertyModule.getActiveProperty(event.propertyId());

        Map<String, String> data = new LinkedHashMap<>();
        data.put("paymentIntentId", event.paymentIntentId().toString());
        data.put("billingCycleId", event.billingCycleId().toString());
        data.put("propertyId", event.propertyId().toString());
        data.put("tenantUserId", event.tenantUserId().toString());
        data.put("referenceCode", event.referenceCode());
        data.put("amountPaise", Long.toString(event.amountPaise()));
        data.put("hasProof", Boolean.toString(event.hasProof()));
        if (event.tenantReferenceText() != null && !event.tenantReferenceText().isBlank()) {
            data.put("tenantReferenceText", event.tenantReferenceText());
        }

        // The UTR is in the body, not just the payload. It is the single thing
        // the owner will search their statement for, and putting it in the push
        // means they can start looking without opening the app.
        StringBuilder body = new StringBuilder()
                .append(name(event.tenantName()))
                .append(" says they paid ")
                .append(money(event.amountPaise()))
                .append(" for ")
                .append(event.referenceCode());
        if (event.tenantReferenceText() != null && !event.tenantReferenceText().isBlank()) {
            body.append(". UPI reference ").append(event.tenantReferenceText());
        }
        body.append(". Check your statement before approving.");

        notificationModule.notifyUsers(
                adminRecipients(property),
                "Payment claim to verify",
                body.toString(),
                NotificationCategory.PAYMENT,
                NotificationPriority.HIGH,
                NotificationSubtype.PAYMENT_CLAIM_RAISED,
                event.paymentIntentId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    /**
     * The owner could not find it.
     *
     * <p>
     * HIGH, and the only notification on this path. The bill has silently gone
     * back to unpaid and its late-fee clock has restarted — without this the
     * first the tenant would know is a penalty appearing on rent they believe
     * they have already paid.
     */
    @ApplicationModuleListener
    public void onClaimRejected(PaymentClaimRejectedEvent event) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("paymentIntentId", event.paymentIntentId().toString());
        data.put("billingCycleId", event.billingCycleId().toString());
        data.put("propertyId", event.propertyId().toString());
        data.put("referenceCode", event.referenceCode());
        data.put("amountPaise", Long.toString(event.amountPaise()));

        notificationModule.notifyUser(
                event.tenantUserId(),
                "Payment not found",
                "Your payment of " + money(event.amountPaise()) + " for " + event.referenceCode()
                        + " could not be matched, so the bill is unpaid again. Check the reference you sent, or"
                        + " raise it again with a screenshot.",
                NotificationCategory.PAYMENT,
                NotificationPriority.HIGH,
                NotificationSubtype.PAYMENT_CLAIM_REJECTED,
                event.paymentIntentId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    /** The owner and every active manager — whoever can act on the claim. */
    private List<UUID> adminRecipients(PropertyResponse property) {
        List<UUID> recipients = new ArrayList<>();
        recipients.add(property.ownerId());
        recipients.addAll(propertyModule.findActiveManagerUserIds(property.id()));
        return recipients.stream()
                .distinct()
                .toList();
    }

    /** Whole rupees. A notification is glanced at, and the paise never matter. */
    private static String money(long paise) {
        return "₹" + String.format("%,d", Math.round(paise / 100.0));
    }

    private static String name(String tenantName) {
        return tenantName == null || tenantName.isBlank() ? "A tenant" : tenantName;
    }
}
