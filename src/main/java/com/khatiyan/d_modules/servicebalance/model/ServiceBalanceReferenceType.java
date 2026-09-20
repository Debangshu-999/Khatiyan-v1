package com.khatiyan.d_modules.servicebalance.model;

/** What a ledger row was about, so a statement line can explain itself. */
public enum ServiceBalanceReferenceType {

    /** A gateway top-up. The reference id is the top-up row. */
    TOP_UP,

    /** An identity verification attempt. The reference id is the attempt. */
    VERIFICATION,

    /** Money going back to a card. The reference id is the refund row. */
    REFUND,

    /** A human at Khatiyan moved this. The reference id may be null. */
    MANUAL
}
