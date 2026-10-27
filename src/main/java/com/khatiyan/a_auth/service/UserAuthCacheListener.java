package com.khatiyan.a_auth.service;

import org.springframework.beans.factory.ObjectProvider;

import com.khatiyan.a_auth.model.User;

import jakarta.persistence.PostUpdate;

/**
 * Overwrites a user's cached auth record whenever their row changes
 * (2026-10-18).
 *
 * <p>An entity listener rather than calls in each service, so a change made
 * anywhere — a new PIN, which raises the credential version, or a future
 * deactivation — reaches the cache. The overwrite waits for the commit, see
 * {@link AuthStateCache#userChanged(User)}.
 *
 * <p>Made by Hibernate through Spring Boot's bean container. The cache is looked
 * up when an update happens, not when the listener is made, because the
 * listener is made while the entity manager itself is still being built.
 */
public class UserAuthCacheListener {

    private final ObjectProvider<AuthStateCache> authStateCache;

    public UserAuthCacheListener(ObjectProvider<AuthStateCache> authStateCache) {
        this.authStateCache = authStateCache;
    }

    @PostUpdate
    void userUpdated(User user) {
        AuthStateCache cache = authStateCache.getIfAvailable();
        if (cache != null) {
            cache.userChanged(user);
        }
    }
}
