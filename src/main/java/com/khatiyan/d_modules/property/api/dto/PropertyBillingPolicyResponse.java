package com.khatiyan.d_modules.property.api.dto;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.d_modules.property.model.Property;

/**
 * Read model exposing the active billing policy owned by a property.
 */
public record PropertyBillingPolicyResponse(
    BillingCollectionTiming billingCollectionTiming,
    int rentGraceDays,
    Long rentLateFeePerDayPaise
) {
    public static PropertyBillingPolicyResponse from(Property property) {
        return new PropertyBillingPolicyResponse(
            property.getBillingCollectionTiming(),
            property.getRentGraceDays(),
            property.getRentLateFeePerDayPaise()
        );
    }
}
