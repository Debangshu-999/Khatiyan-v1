package com.khatiyan.d_modules.property.api.dto;

import jakarta.validation.constraints.Size;

/**
 * What leaving an indefinite stay without serving notice costs, in the owner's
 * own words.
 *
 * <p>Free text, never a formula: the computed penalty this replaced was a number
 * nobody had agreed to, and every property prices an early departure
 * differently. Applied by a person at end-tenancy.
 *
 * <p>A request of its own so it can be written from the agreement screen without
 * touching the damage schedule or the move-out checklist.
 */
public record UpdatePrematureExitPolicyRequest(
        @Size(max = 2000) String prematureExitPolicy) {
}
