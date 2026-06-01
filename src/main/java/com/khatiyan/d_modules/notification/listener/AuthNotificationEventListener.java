package com.khatiyan.d_modules.notification.listener;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.a_auth.event.PinChangedEvent;
import com.khatiyan.a_auth.event.UserRegisteredEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;

/**
 * Converts committed auth account/security events into user-facing
 * notifications.
 */
@Component
public class AuthNotificationEventListener {

    private final NotificationModule notificationModule;

    public AuthNotificationEventListener(NotificationModule notificationModule) {
        this.notificationModule = notificationModule;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onUserRegistered(UserRegisteredEvent event) {
        notificationModule.notifyUser(
                event.userId(),
                "Welcome to Khatiyan",
                "Your " + event.role().name().toLowerCase() + " account has been created.",
                NotificationCategory.AUTH,
                NotificationPriority.NORMAL,
                event.userId(),
                NotificationDeliveryMode.IN_APP_ONLY);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPinChanged(PinChangedEvent event) {
        notificationModule.notifyUser(
                event.userId(),
                "PIN updated",
                "Your account PIN was changed.",
                NotificationCategory.AUTH,
                NotificationPriority.HIGH,
                event.userId(),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }
}
