package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.billing.damage.DamageRecordChangedEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;

/**
 * Tells each tenant a damage record names that it was made, changed or
 * removed (2026-10-29). There is no dispute in the app: they take it up with
 * the owner in person, and the owner edits or deletes the record.
 */
@Component
public class DamageRecordNotificationEventListener {

    private final NotificationModule notificationModule;

    public DamageRecordNotificationEventListener(NotificationModule notificationModule) {
        this.notificationModule = notificationModule;
    }

    @ApplicationModuleListener
    public void onDamageRecordChanged(DamageRecordChangedEvent event) {
        for (DamageRecordChangedEvent.Recipient recipient : event.recipients()) {
            Map<String, String> data = new LinkedHashMap<>();
            data.put("damageRecordId", event.recordId().toString());
            data.put("damageRecordCode", event.code());
            data.put("tenancyId", recipient.tenancyId().toString());
            data.put("propertyId", event.propertyId().toString());
            data.put("amountPaise", Long.toString(recipient.amountPaise()));

            String amount = formatAmount(recipient.amountPaise());
            String title;
            String body;
            NotificationSubtype subtype;
            switch (event.kind()) {
                case CREATED -> {
                    title = "Damage recorded";
                    body = event.itemName() + " in your room was recorded"
                            + (event.damageLevel() == null ? " as damaged. " : " at " + event.damageLevel() + ". ")
                            + amount + " of it is on you.";
                    subtype = NotificationSubtype.DAMAGE_RECORDED;
                }
                case UPDATED -> {
                    title = "Damage record updated";
                    body = "The damage record for " + event.itemName() + " (" + event.code() + ") was changed. "
                            + amount + " of it is on you.";
                    subtype = NotificationSubtype.DAMAGE_RECORD_UPDATED;
                }
                default -> {
                    title = "Damage record removed";
                    body = "The damage record for " + event.itemName() + " (" + event.code() + ") was removed.";
                    subtype = NotificationSubtype.DAMAGE_RECORD_REMOVED;
                }
            }

            notificationModule.notifyUser(
                    recipient.tenantUserId(),
                    title,
                    body,
                    NotificationCategory.PAYMENT,
                    NotificationPriority.NORMAL,
                    subtype,
                    event.recordId(),
                    data,
                    NotificationDeliveryMode.IN_APP_AND_PUSH);
        }
    }

    private static String formatAmount(long amountPaise) {
        long rupees = amountPaise / 100;
        long paise = Math.abs(amountPaise % 100);
        return paise == 0 ? "Rs. " + rupees : "Rs. " + rupees + "." + (paise < 10 ? "0" : "") + paise;
    }
}
