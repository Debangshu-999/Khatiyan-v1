package com.khatiyan.d_modules.notice.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Authorization chokepoint for the property board.
 *
 * <p>
 * The board shares a Java module with notices but NOT a permission: notices are
 * announcements pushed to tenants, the board is reference material they browse.
 * An owner can reasonably want a manager to keep the board tidy without letting
 * them broadcast, so the board answers to
 * {@link ManagerResource#PROPERTY_BOARD} while notices stay on
 * {@code NOTICES} — which is not converted yet and still uses the old
 * all-or-nothing check.
 */
@Component
public class PropertyBoardAccessPolicy {

    private final PropertyModule propertyModule;

    public PropertyBoardAccessPolicy(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    public void ensureCanViewBoard(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.PROPERTY_BOARD);
    }

    /** Adding, editing or removing a board item or category. */
    public void ensureCanManageBoard(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.PROPERTY_BOARD);
    }
}
