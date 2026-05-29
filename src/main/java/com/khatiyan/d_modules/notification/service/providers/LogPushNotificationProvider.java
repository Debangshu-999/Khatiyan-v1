package com.khatiyan.d_modules.notification.service.providers;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.notification.model.PushNotificationCommand;
import com.khatiyan.d_modules.notification.model.PushProvider;
import com.khatiyan.d_modules.notification.model.PushSendResult;
import com.khatiyan.d_modules.notification.service.PushNotificationProvider;

import lombok.extern.slf4j.Slf4j;

/**
 * Local development push provider.
 *
 * <p>This provider does not contact an external service. It logs the push
 * payload so the notification pipeline can be tested before OneSignal/FCM
 * credentials are configured.
 */
@Slf4j
@Component
public class LogPushNotificationProvider implements PushNotificationProvider {

    @Override
    public PushProvider provider() {
        return PushProvider.LOG;
    }

    @Override
    public PushSendResult send(PushNotificationCommand command) {
        log.info(
                "LOG push delivered pushNotificationId={} userId={} title={} category={} sourceId={} tokens={}",
                command.pushNotificationId(),
                command.userId(),
                command.title(),
                command.category(),
                command.sourceId(),
                command.providerTokens().size());

        return PushSendResult.success();
    }
}
