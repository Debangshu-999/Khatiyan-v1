package com.khatiyan.d_modules.notification.listener;

import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.modulith.events.ApplicationModuleListener;

import com.khatiyan.a_auth.event.NewDeviceSignedInEvent;
import com.khatiyan.a_auth.event.PinChangedEvent;
import com.khatiyan.a_auth.event.UserRegisteredEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;

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

    @ApplicationModuleListener
    public void onUserRegistered(UserRegisteredEvent event) {
        notificationModule.notifyUser(
                event.userId(),
                "Welcome to Khatiyan",
                "Your " + event.role().name().toLowerCase() + " account has been created.",
                NotificationCategory.AUTH,
                NotificationPriority.NORMAL,
                NotificationSubtype.USER_REGISTERED,
                event.userId(),
                Map.of(
                        "userId", event.userId().toString(),
                        "phone", event.phone(),
                        "role", event.role().name()),
                NotificationDeliveryMode.IN_APP_ONLY);
    }

    /**
     * HIGH priority and pushed: this is the one notification whose whole value is
     * being seen quickly. A sign-in the owner did not make is worth interrupting
     * them for; one they did make costs them a glance.
     */
    @ApplicationModuleListener
    public void onNewDeviceSignedIn(NewDeviceSignedInEvent event) {
        notificationModule.notifyUser(
                event.userId(),
                "New device signed in",
                event.deviceLabel() + " just signed in to your account. If this was not you, "
                        + "sign that device out from Settings and change your PIN.",
                NotificationCategory.AUTH,
                NotificationPriority.HIGH,
                NotificationSubtype.NEW_DEVICE_SIGNED_IN,
                event.userId(),
                Map.of(
                        "userId", event.userId().toString(),
                        "deviceLabel", event.deviceLabel()),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    @ApplicationModuleListener
    public void onPinChanged(PinChangedEvent event) {
        notificationModule.notifyUser(
                event.userId(),
                "PIN updated",
                "Your account PIN was changed.",
                NotificationCategory.AUTH,
                NotificationPriority.HIGH,
                NotificationSubtype.PIN_CHANGED,
                event.userId(),
                Map.of("userId", event.userId().toString()),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }
}
