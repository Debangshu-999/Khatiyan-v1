package com.khatiyan.d_modules.compliance.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Authorization chokepoint for agreements.
 *
 * <p>
 * Two different things live here and they are governed differently:
 *
 * <ul>
 *   <li><b>Property agreement settings</b> — whether an agreement is required
 *       and its default clauses. These are the RULES a stay runs under, so they
 *       share {@link ManagerResource#TENANCY_RULES} with exit policies: the
 *       owner sets both in one decision.</li>
 *   <li><b>A specific tenancy's agreement</b> — reading or amending the clauses
 *       on one stay. That is part of managing that stay, so it follows
 *       {@link ManagerResource#TENANCIES}.</li>
 * </ul>
 *
 * <p>
 * A tenant reading or accepting their own agreement authorizes on their own
 * tenancy and must never come through here.
 */
@Component
public class ComplianceAccessPolicy {

    private final PropertyModule propertyModule;

    public ComplianceAccessPolicy(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    /**
     * Reading the property's agreement settings.
     *
     * <p>
     * Wider than {@link #ensureCanManageRules} on purpose: onboarding a tenant
     * has to know whether an agreement is required and which clauses it starts
     * from, so {@code TENANCY_CREATE} must not be refused this read. Editing the
     * settings stays on {@code TENANCY_RULES} alone.
     */
    public void ensureCanViewRules(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanViewAny(
                actorUserId, propertyId, ManagerResource.TENANCY_RULES, ManagerResource.TENANCY_CREATE);
    }

    public void ensureCanManageRules(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_RULES);
    }

    /**
     * Whether the actor may author clause prose, as a question rather than an
     * assertion.
     *
     * <p>
     * Onboarding prefills its clause editor from the property defaults, so
     * someone without the grant still posts those defaults straight back.
     * Rejecting the request would fail onboarding for a manager who did nothing
     * wrong, so the caller drops the submitted prose instead and falls back to
     * the stored defaults.
     */
    public boolean canManageRules(UUID actorUserId, UUID propertyId) {
        return propertyModule.accessLevel(actorUserId, propertyId, ManagerResource.TENANCY_RULES).canManage();
    }

    public void ensureCanViewTenancyAgreement(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.TENANCIES);
    }

    /**
     * Amending the clause prose on one tenancy's agreement.
     *
     * <p>
     * {@code TENANCY_RULES}, not {@code TENANCIES}: writing contract prose is
     * the same power wherever it happens, and it would be incoherent to refuse
     * it on the settings screen but allow it one screen later.
     */
    public void ensureCanAmendTenancyAgreement(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_RULES);
    }
}
