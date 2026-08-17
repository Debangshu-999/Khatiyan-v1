package com.khatiyan.d_modules.notice.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Authorization chokepoint for notices.
 *
 * <p>
 * One resource covers both one-off notices and recurring schedules: a recurring
 * notice is a notice that publishes itself, so someone trusted to announce
 * something once is trusted to announce it weekly. Splitting them would offer an
 * owner a distinction they have no reason to draw.
 *
 * <p>
 * The property board shares this Java module but NOT this permission — it
 * answers to {@code PROPERTY_BOARD} via {@link PropertyBoardAccessPolicy},
 * because browsing reference material and broadcasting to tenants are different
 * powers.
 */
@Component
public class NoticeAccessPolicy {

    private final PropertyModule propertyModule;

    public NoticeAccessPolicy(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    public void ensureCanViewNotices(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.NOTICES);
    }

    /** Publishing, editing, archiving, deleting, and scheduling recurrences. */
    public void ensureCanManageNotices(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.NOTICES);
    }
}
