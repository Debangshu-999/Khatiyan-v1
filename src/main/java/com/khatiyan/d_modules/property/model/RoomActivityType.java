package com.khatiyan.d_modules.property.model;

/**
 * A single room lifecycle action recorded for the recent-activity feed. Unlike
 * the room's current status, each action is persisted as its own row so the
 * feed shows independent entries for putting a room on and off maintenance,
 * and for deactivating and reactivating it.
 */
public enum RoomActivityType {
    MAINTENANCE_STARTED,
    MAINTENANCE_ENDED,
    DEACTIVATED,
    REACTIVATED
}
