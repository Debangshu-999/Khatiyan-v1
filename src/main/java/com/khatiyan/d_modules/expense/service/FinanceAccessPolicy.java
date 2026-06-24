package com.khatiyan.d_modules.expense.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.PropertyModule;

/**
 * Single chokepoint for finance (expense / P&L) authorization.
 *
 * <p>For now finance access equals property management — an owner or an active
 * manager. A future per-capability IAM layer (owner-customisable manager scopes)
 * can narrow this here without touching the many call sites.
 */
@Component
public class FinanceAccessPolicy {

    private final PropertyModule propertyModule;

    public FinanceAccessPolicy(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    public void ensureCanManageFinances(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
    }
}
