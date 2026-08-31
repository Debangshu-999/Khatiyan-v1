package com.khatiyan.d_modules.compliance.model;

/**
 * What a recorded declaration is about.
 *
 * <p>Mirrored by a CHECK constraint on the table, so a new value needs a
 * migration as well as an enum constant. That is on purpose: the set of things
 * this platform asserts about people is small and should not be able to grow by
 * accident.
 *
 * <p>Never remove or rename a constant. These rows are evidence and are read
 * back years later — see the standing rule about persisted enum constants.
 */
public enum AttestationKind {

    /** A tenant signing their tenancy agreement, with a one-time password. */
    TENANCY_AGREEMENT_ACCEPTANCE,

    /** An owner or manager declaring they checked a tenant's government photo ID. */
    TENANT_ID_DECLARATION
}
