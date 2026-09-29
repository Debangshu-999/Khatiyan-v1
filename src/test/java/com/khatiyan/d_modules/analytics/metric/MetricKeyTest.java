package com.khatiyan.d_modules.analytics.metric;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.property.model.ManagerAccessLevel;
import com.khatiyan.d_modules.property.model.ManagerResource;

class MetricKeyTest {

    private static Map<ManagerResource, ManagerAccessLevel> levels(ManagerResource... viewable) {
        Map<ManagerResource, ManagerAccessLevel> levels = new EnumMap<>(ManagerResource.class);
        for (ManagerResource resource : ManagerResource.values()) {
            levels.put(resource, ManagerAccessLevel.NONE);
        }
        for (ManagerResource resource : viewable) {
            levels.put(resource, ManagerAccessLevel.VIEW);
        }
        return levels;
    }

    @Test
    void keysAreUniqueAndNamedAfterTheirDivision() {
        assertThat(Arrays.stream(MetricKey.values()).map(MetricKey::key)).doesNotHaveDuplicates();
        for (MetricKey key : MetricKey.values()) {
            assertThat(key.key()).startsWith(key.division().name().toLowerCase() + ".");
        }
    }

    @Test
    void anOwnerSeesEveryMetricOfTheDivision() {
        assertThat(MetricKey.visibleIn(AnalyticsDivision.BILLING, true, levels()))
                .contains(MetricKey.BILLING_DUES, MetricKey.BILLING_UPI_CLAIMS_PENDING);
    }

    @Test
    void aManagerWithBillingSeesBillingButNeverTheOwnerOnlyClaims() {
        var visible = MetricKey.visibleIn(AnalyticsDivision.BILLING, false, levels(ManagerResource.BILLING_CYCLES));
        assertThat(visible).contains(MetricKey.BILLING_DUES, MetricKey.BILLING_COLLECTION_RATE);
        assertThat(visible).doesNotContain(MetricKey.BILLING_UPI_CLAIMS_PENDING);
    }

    @Test
    void aFinanceManagerSeesOnlyWhatEachOfTheirPermissionsCovers() {
        assertThat(MetricKey.visibleIn(AnalyticsDivision.FINANCE, false, levels(ManagerResource.DEPOSITS)))
                .containsExactly(MetricKey.FINANCE_DEPOSITS);
        // Per-bed needs BOTH P&L and tenancies.
        assertThat(MetricKey.visibleIn(AnalyticsDivision.FINANCE, false, levels(ManagerResource.PNL)))
                .contains(MetricKey.FINANCE_INCOME_VS_EXPENSES)
                .doesNotContain(MetricKey.FINANCE_PER_BED, MetricKey.FINANCE_TOP_PAYEES);
        assertThat(MetricKey.visibleIn(AnalyticsDivision.FINANCE, false, levels(ManagerResource.PNL, ManagerResource.TENANCIES)))
                .contains(MetricKey.FINANCE_PER_BED);
    }

    @Test
    void aManagerWithoutTheResourceSeesNothing() {
        assertThat(MetricKey.visibleIn(AnalyticsDivision.BILLING, false, levels(ManagerResource.CONCERNS))).isEmpty();
    }
}
