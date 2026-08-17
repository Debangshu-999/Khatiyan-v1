package com.khatiyan.d_modules.billing.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Authorization chokepoint for billing.
 *
 * <p>
 * Two resources, because an owner may want a manager to run the bills without
 * touching anyone's deposit:
 *
 * <ul>
 *   <li>{@link ManagerResource#BILLING_CYCLES} — cycles, one-off bills, line
 *       items, payment history. <b>Manage includes recording payment.</b> With
 *       online collection parked, marking a bill paid IS the collection
 *       workflow; splitting it off would leave a level that cannot do the job.</li>
 *   <li>{@link ManagerResource#DEPOSITS} — the deposit ledger, corrections and
 *       settlement.</li>
 * </ul>
 *
 * <h2>Three kinds of caller must NOT come through here</h2>
 *
 * <ol>
 *   <li><b>Tenants.</b> {@code listMyCycles}, {@code getMyCycle} and friends
 *       authorize on the tenant's own tenancy — a tenant is not exercising a
 *       manager permission.</li>
 *   <li><b>The exit flow.</b> Applying an early-exit penalty, squaring the last
 *       cycle, and marking a deposit {@code PENDING_SETTLEMENT} are driven by
 *       tenancy, which has already authorized the actor for {@code EXIT_REQUESTS}
 *       or {@code TENANCIES}. Re-checking here on a billing resource would refuse
 *       a move-out the manager is allowed to run — and deliberately so:
 *       <b>ending a stay never requires {@code DEPOSITS}</b>. The deposit is left
 *       pending for someone who holds it.</li>
 *   <li><b>The dashboard and P&amp;L.</b> They read billing summaries under their
 *       own gate and show the numbers to any manager, so they call the
 *       {@code ...ForDashboard} variants that take no actor.</li>
 * </ol>
 */
@Component
public class BillingAccessPolicy {

    private final PropertyModule propertyModule;

    public BillingAccessPolicy(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    // --- Billing cycles (incl. line items and recording payment) ---

    public void ensureCanViewBilling(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.BILLING_CYCLES);
    }

    public void ensureCanManageBilling(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.BILLING_CYCLES);
    }

    // --- Deposits ---

    public void ensureCanViewDeposits(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.DEPOSITS);
    }

    /** Corrections, deductions and settlement. */
    public void ensureCanManageDeposits(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.DEPOSITS);
    }
}
