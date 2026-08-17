package com.khatiyan.d_modules.property.event;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.property.service.ManagerAccessPolicy;

/**
 * Drops a manager's granted permissions when they are removed from a property.
 *
 * <p>
 * Without this, re-adding someone would silently restore whatever they used to
 * hold. The rule is that adding a manager grants nothing until the owner says
 * so, and that has to survive a remove/re-add cycle — otherwise the safest
 * default quietly stops applying to exactly the people it matters for.
 *
 * <p>
 * Runs BEFORE_COMMIT so the revoke and the removal are one atomic change.
 */
@Component
public class ManagerPermissionCleanupListener {

    private final ManagerAccessPolicy managerAccessPolicy;

    /**
     * {@code @Lazy} for the same reason the tenancy listener needs it: this sits
     * inside the property module and the policy pulls in property repositories,
     * so an eager edge here risks closing a cycle at startup.
     */
    public ManagerPermissionCleanupListener(@Lazy ManagerAccessPolicy managerAccessPolicy) {
        this.managerAccessPolicy = managerAccessPolicy;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onManagerRemoved(ManagerRemovedEvent event) {
        managerAccessPolicy.clearGrants(event.propertyId(), event.managerUserId());
    }
}
