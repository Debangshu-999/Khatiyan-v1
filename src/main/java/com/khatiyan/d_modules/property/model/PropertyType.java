package com.khatiyan.d_modules.property.model;

/**
 * Type of managed property.
 *
 * <p>For v1, PG and HOSTEL are the primary product targets. APARTMENT
 * and SOCIETY are kept for future expansion but should not drive v1
 * behavior unless explicitly needed.
 */
public enum PropertyType {
    PG,
    HOSTEL,
    APARTMENT,
    SOCIETY
}
