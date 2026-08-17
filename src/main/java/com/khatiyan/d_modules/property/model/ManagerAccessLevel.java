package com.khatiyan.d_modules.property.model;

/**
 * How much of a {@link ManagerResource} a manager may use.
 *
 * <p>
 * Three states, because "can look but not touch" is the common real case — an
 * owner who wants help watching the bills without anyone issuing discounts.
 */
public enum ManagerAccessLevel {

    /** Hidden entirely. The section does not render for this manager. */
    NONE,

    /** Reads only. Every mutating affordance is absent, not disabled. */
    VIEW,

    /** Reads and writes. */
    MANAGE;

    public boolean canView() {
        return this != NONE;
    }

    public boolean canManage() {
        return this == MANAGE;
    }
}
