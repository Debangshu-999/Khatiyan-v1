package com.khatiyan.d_modules.compliance.model;

/**
 * Whether a clause is a machine-readable rule the engine reads ({@code SYSTEM})
 * or free-text prose the engine ignores ({@code CUSTOM}).
 */
public enum ClauseKind {
    SYSTEM,
    CUSTOM
}
