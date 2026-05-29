package com.khatiyan.c_shared.rate_limit;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Central API rate-limit policy loaded from application configuration.
 */
@Component
@ConfigurationProperties(prefix = "app.rate-limit")
public class ApiRateLimitProperties {

    private boolean enabled = true;
    private boolean failOpen = true;
    private Rule defaultRule = new Rule();
    private List<RouteRule> routes = new ArrayList<>();

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isFailOpen() {
        return failOpen;
    }

    public void setFailOpen(boolean failOpen) {
        this.failOpen = failOpen;
    }

    public Rule getDefaultRule() {
        return defaultRule;
    }

    public void setDefaultRule(Rule defaultRule) {
        this.defaultRule = defaultRule;
    }

    public List<RouteRule> getRoutes() {
        return routes;
    }

    public void setRoutes(List<RouteRule> routes) {
        this.routes = routes;
    }

    public static class Rule {
        private int attempts = 300;
        private int durationSeconds = 60;

        public int getAttempts() {
            return attempts;
        }

        public void setAttempts(int attempts) {
            this.attempts = attempts;
        }

        public int getDurationSeconds() {
            return durationSeconds;
        }

        public void setDurationSeconds(int durationSeconds) {
            this.durationSeconds = durationSeconds;
        }
    }

    public static class RouteRule extends Rule {
        private String method;
        private String pathPrefix;
        private RateLimitIdentity identity = RateLimitIdentity.USER_OR_IP;

        public String getMethod() {
            return method;
        }

        public void setMethod(String method) {
            this.method = method;
        }

        public String getPathPrefix() {
            return pathPrefix;
        }

        public void setPathPrefix(String pathPrefix) {
            this.pathPrefix = pathPrefix;
        }

        public RateLimitIdentity getIdentity() {
            return identity;
        }

        public void setIdentity(RateLimitIdentity identity) {
            this.identity = identity;
        }
    }
}
