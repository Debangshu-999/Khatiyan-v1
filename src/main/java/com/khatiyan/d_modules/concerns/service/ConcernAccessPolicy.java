package com.khatiyan.d_modules.concerns.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Authorization chokepoint for the concern queue.
 *
 * <p>
 * Names {@link ManagerResource#CONCERNS} once so the rest of the module never
 * repeats it, and gives the module one place to change if concerns ever split
 * into more than a single grantable resource. Mirrors
 * {@code expense/FinanceAccessPolicy}.
 *
 * <p>
 * <b>Only the management side goes through here.</b> A tenant raising or
 * following their own concern is not exercising a manager permission and must
 * never be gated by one — those paths authorize on ownership of the concern
 * instead.
 */
@Component
public class ConcernAccessPolicy {

    private final PropertyModule propertyModule;

    public ConcernAccessPolicy(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    /** Reading the queue: lists, summaries, history. */
    public void ensureCanView(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.CONCERNS);
    }

    /** Acting on a concern: assigning, changing status, resolving. */
    public void ensureCanManage(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.CONCERNS);
    }

    /**
     * The person a concern is being assigned TO must be able to work on it.
     *
     * <p>
     * Distinct from {@link #ensureCanManage} on purpose: this is not the actor's
     * permission being tested. Assigning to someone who cannot act on concerns
     * would produce a queue item nobody is able to clear.
     */
    public void ensureAssigneeCanWorkConcerns(UUID assigneeUserId, UUID propertyId) {
        propertyModule.ensureCanManage(assigneeUserId, propertyId, ManagerResource.CONCERNS);
    }
}
