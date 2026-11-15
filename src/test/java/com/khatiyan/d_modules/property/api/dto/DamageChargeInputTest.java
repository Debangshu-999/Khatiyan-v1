package com.khatiyan.d_modules.property.api.dto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.property.model.DamageCategory;

/** How an item's prices arrive from the app (2026-11-07). */
class DamageChargeInputTest {

    @Test
    void aZeroWithNoLevelsIsUnpricedNotAFlatZero() {
        // A common washroom's thing comes back as 0 with no levels, and must stay unpriced.
        var bucket = new UpdatePropertyExitPolicyRequest.DamageChargeInput("Bucket", 0L, null, null, null, DamageCategory.COMMON_TOILET);
        assertThat(bucket.d1()).isNull();
        assertThat(bucket.d2()).isNull();
        assertThat(bucket.d3()).isNull();
    }

    @Test
    void aPositiveFlatAmountStillPricesEveryLevel() {
        var kettle = new UpdatePropertyExitPolicyRequest.DamageChargeInput("Kettle", 100_000L);
        assertThat(kettle.d1()).isEqualTo(100_000L);
        assertThat(kettle.d3()).isEqualTo(100_000L);
    }
}
