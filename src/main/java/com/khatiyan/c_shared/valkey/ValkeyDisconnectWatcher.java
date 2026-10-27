package com.khatiyan.c_shared.valkey;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import io.lettuce.core.event.connection.DisconnectedEvent;
import io.lettuce.core.resource.ClientResources;
import reactor.core.Disposable;

/**
 * Counts a dropped Valkey connection as an outage (2026-10-18).
 *
 * <p>Lettuce reconnects on its own. If Valkey restarted and reloaded an older
 * saved copy of its data while nobody was making requests, no command would
 * ever fail, and the old copy could hold a session from before its sign-out.
 * So every disconnect marks Valkey down, and it is brought back through
 * {@link ValkeyHealth}, which raises the auth generation first.
 *
 * <p>Listens on Spring Boot's shared {@link ClientResources}, which the rate
 * limiter's client uses too.
 */
@Component
public class ValkeyDisconnectWatcher implements InitializingBean, DisposableBean {

    private final ObjectProvider<ClientResources> clientResources;
    private final ValkeyHealth health;
    private Disposable subscription;

    public ValkeyDisconnectWatcher(ObjectProvider<ClientResources> clientResources, ValkeyHealth health) {
        this.clientResources = clientResources;
        this.health = health;
    }

    @Override
    public void afterPropertiesSet() {
        ClientResources resources = clientResources.getIfAvailable();
        if (resources == null) {
            return;
        }
        subscription = resources.eventBus().get()
                .filter(DisconnectedEvent.class::isInstance)
                .subscribe(event -> health.failed(new IllegalStateException("Valkey connection dropped")));
    }

    @Override
    public void destroy() {
        if (subscription != null) {
            subscription.dispose();
        }
    }
}
