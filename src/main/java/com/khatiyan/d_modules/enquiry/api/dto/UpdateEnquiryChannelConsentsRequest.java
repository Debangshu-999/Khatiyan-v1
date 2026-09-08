package com.khatiyan.d_modules.enquiry.api.dto;

import java.util.Set;

import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;

import jakarta.validation.constraints.NotNull;

/**
 * The channels this person wants live, as a whole set.
 *
 * <p>A replacement rather than a grant or a revoke, mirroring
 * {@code ManagerAccessPolicy.replaceGrants}: the client sends what it wants to
 * be true and the server reconciles. Two endpoints for add and remove would let
 * a dropped request leave the stored set disagreeing with the screen that sent
 * it.
 */
public record UpdateEnquiryChannelConsentsRequest(

    /** Empty means "reach me on nothing", which is allowed. */
    @NotNull Set<EnquiryResponseChannel> channels,

    /**
     * The agreement tick.
     *
     * <p>Required only when the request ADDS a channel. Revoking needs no
     * agreement, and re-sending a set that is already live is not a fresh
     * decision — demanding a tick for either would train people to tick without
     * reading, which is the failure this whole flow exists to avoid.
     */
    boolean agreed
) {}
