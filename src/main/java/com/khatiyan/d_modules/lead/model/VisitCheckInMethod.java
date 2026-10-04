package com.khatiyan.d_modules.lead.model;

/** How attendance was marked (user, 2026-10-04). Stored, so values are added and never renamed. */
public enum VisitCheckInMethod {

    /** The visitor's pass was scanned at the property. */
    QR,

    /** The code on the pass was typed in, because it could not be scanned. */
    CODE,

    /** Nobody scanned them. The owner marked it after the slot, before midnight. */
    OWNER
}
