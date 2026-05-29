package com.khatiyan.a_auth.model;

/**
 * Roles supported by the auth module.
 *
 * <p>Roles are intentionally coarse at this layer. Fine-grained
 * permissions, such as what a manager can do for a property, belong
 * to the property module.
 */
public enum UserRole {
    USER,
    OWNER,
    TENANT
}

