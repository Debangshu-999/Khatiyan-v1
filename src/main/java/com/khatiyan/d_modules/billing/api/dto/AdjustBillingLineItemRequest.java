package com.khatiyan.d_modules.billing.api.dto;

import jakarta.validation.constraints.Positive;

/**
 * Request for replacing or carrying forward an editable line item amount.
 *
 * <p>
 * Some actions may omit amountPaise, in which case the current line value is
 * carried over while only the settlement mode changes.
 */
public record AdjustBillingLineItemRequest(

    @Positive
    Long amountPaise
) {
}
