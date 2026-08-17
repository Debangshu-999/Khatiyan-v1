package com.khatiyan.d_modules.expense.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Single chokepoint for finance authorization.
 *
 * <p>
 * Two resources, and <b>neither has a view-only level</b>: an owner grants the
 * expense ledger or the P&amp;L outright, or not at all. A read-only tier would
 * be redundant — the month's spend already shows on Home's live digest and
 * profitability on the dashboard, both of which every manager sees. So the
 * question these answer is "do they get the tool", not "may they change it",
 * which is why both checks demand MANAGE.
 *
 * <p>
 * They are separate because the powers differ in kind: logging what was spent is
 * daily upkeep, while profitability is the owner's own numbers.
 */
@Component
public class FinanceAccessPolicy {

    private final PropertyModule propertyModule;

    public FinanceAccessPolicy(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    /** The expense ledger, categories, budgets, recurring expenses and income. */
    public void ensureCanUseExpenses(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.EXPENSES);
    }

    /** The profit-and-loss statement and its trend. */
    public void ensureCanUsePnl(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.PNL);
    }
}
