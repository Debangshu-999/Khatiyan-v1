package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * Kind of event shown in the owner dashboard recent-activity feed.
 */
public enum RecentActivityType {
    TENANCY_STARTED,
    PAYMENT_RECORDED,
    CONCERN_RAISED,
    CONCERN_ASSIGNED,
    CONCERN_TAKEN_UP,
    CONCERN_ESCALATED,
    CONCERN_RESOLVED,
    NOTICE_PUBLISHED,
    ROOM_MAINTENANCE_STARTED,
    ROOM_MAINTENANCE_ENDED,
    ROOM_DEACTIVATED,
    ROOM_REACTIVATED,
    STAFF_ADDED,
    STAFF_REMOVED,
    MANAGER_ADDED,
    MANAGER_REMOVED
}
