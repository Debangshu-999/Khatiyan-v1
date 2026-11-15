package com.khatiyan.d_modules.tenancy.model;

/** How a mark was made: the property's WiFi, its location, the tenant's own tap, or the warden. */
public enum RollCallMethod {
    WIFI,
    LOCATION,
    SELF,
    WARDEN;

    /** Checked against the property, rather than taken on the tenant's word. */
    public boolean isVerified() {
        return this == WIFI || this == LOCATION;
    }
}
