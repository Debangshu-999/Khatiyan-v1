package com.khatiyan.d_modules.tenancy.api.dto;

import java.util.List;

import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

/**
 * Everything the end-tenancy screen decided, submitted as one action.
 *
 * <p>The exit policy is not a set of separate calls the client makes in
 * sequence: a deposit deducted against a tenancy that then fails to end is
 * worse than either outcome alone, and there is no screen left afterwards to
 * show the actor what half-happened. So the whole assessment arrives together
 * and is applied in one transaction, or not at all.
 *
 * <p>No end date is accepted. The date a stay ends is already settled — by an
 * approved exit request, by the agreement's own term, or by a daily stay's
 * checkout — and letting the client restate it here would only create a way for
 * the two to disagree.
 */
public record EndTenancyRequest(

        /**
         * The early-exit charge, possibly split across instruments — part taken
         * from the deposit and the rest billed when one charge outgrows the
         * deposit. Empty or null if nothing is charged.
         */
        @Valid List<ApplyExitPolicyRequest.ExitCharge> earlyExitCharges,

        /**
         * Whether the remaining deposit is refundable — decided here and never
         * revisited at settlement. Null for stays with no deposit.
         */
        Boolean depositPayable,

        /** Damage assessed at move-out. Null if none. */
        @Valid ApplyExitPolicyRequest.DamageCharge damages,

        /**
         * The move-out checklist items the actor confirmed. Advisory: recorded as
         * their assessment, never a gate on the exit.
         */
        List<@Size(max = 200) String> checklistConfirmed,

        /**
         * Photo of the money collected at move-out, attached to the single
         * payment recorded against the exit's bill. Null when nothing is billed.
         */
        @Size(max = 600) String proofImageUrl) {

    public ApplyExitPolicyRequest toExitPolicy() {
        return new ApplyExitPolicyRequest(earlyExitCharges, damages, depositPayable, proofImageUrl);
    }
}
