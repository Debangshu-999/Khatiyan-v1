package com.khatiyan.d_modules.notification.service;

import com.khatiyan.d_modules.notification.model.PushNotificationCommand;
import com.khatiyan.d_modules.notification.model.PushProvider;
import com.khatiyan.d_modules.notification.model.PushSendResult;

/**
 * Adapter contract for push providers such as OneSignal, Firebase, or local
 * logging.
 */
public interface PushNotificationProvider {

    PushProvider provider();

    PushSendResult send(PushNotificationCommand command);
}
