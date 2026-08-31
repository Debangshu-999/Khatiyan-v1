package com.khatiyan.d_modules.property.model;

/**
 * Sharing category used to describe how a room is offered to tenants.
 *
 * <p>AC and non-AC details are intentionally modeled separately through
 * {@link RoomConditioning}. This avoids enum combinations like DOUBLE_AC
 * and keeps filtering/pricing logic easier to evolve.
 */
public enum RoomType {
    SINGLE,
    DOUBLE,
    TRIPLE,
    FOUR_SHARING,
    DORMITORY
}

