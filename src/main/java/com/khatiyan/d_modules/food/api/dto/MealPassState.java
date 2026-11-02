package com.khatiyan.d_modules.food.api.dto;

/** Where a tenant's meal pass stands. */
public enum MealPassState {
    /** The meal has not started. There is no code to show yet. */
    UPCOMING,
    /** The meal is on and the pass can be scanned. */
    OPEN,
    /** This meal's pass has been scanned. */
    RECORDED
}
