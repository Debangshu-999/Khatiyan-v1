package com.khatiyan.d_modules.analytics.metric;

import java.util.Optional;
import java.util.Set;

import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * The four division screens. Agreements is part of Tenants (user decision
 * 2026-09-26: three cards were too small for a screen of their own). A manager may open a division if they can view
 * ANY of its resources, and then sees only the metrics whose resources they
 * hold (spec §6.7).
 */
public enum AnalyticsDivision {
    BILLING(ManagerResource.BILLING_CYCLES),
    FINANCE(ManagerResource.PNL, ManagerResource.EXPENSES, ManagerResource.DEPOSITS),
    TENANTS(ManagerResource.ROOMS, ManagerResource.TENANCIES, ManagerResource.EXIT_REQUESTS, ManagerResource.FOOD),
    CONCERNS(ManagerResource.CONCERNS);

    private final Set<ManagerResource> resources;

    AnalyticsDivision(ManagerResource... resources) {
        this.resources = Set.of(resources);
    }

    public Set<ManagerResource> resources() {
        return resources;
    }

    /** Parses the URL segment: "billing", "finance" and so on. */
    public static Optional<AnalyticsDivision> fromPath(String path) {
        if (path == null) {
            return Optional.empty();
        }
        for (AnalyticsDivision division : values()) {
            if (division.name().equalsIgnoreCase(path.trim())) {
                return Optional.of(division);
            }
        }
        return Optional.empty();
    }
}
