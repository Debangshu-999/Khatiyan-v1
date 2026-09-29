package com.khatiyan.d_modules.analytics.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.d_modules.analytics.api.AnalyticsResponse;
import com.khatiyan.d_modules.analytics.metric.AnalyticsContext;
import com.khatiyan.d_modules.analytics.metric.AnalyticsDivision;
import com.khatiyan.d_modules.analytics.metric.DivisionAssembler;
import com.khatiyan.d_modules.analytics.metric.MetricKey;
import com.khatiyan.d_modules.analytics.metric.MetricResult;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.analytics.PropertyAnalytics;
import com.khatiyan.d_modules.property.api.dto.ManagerPermissionsResponse;
import com.khatiyan.d_modules.property.model.ManagerAccessLevel;
import com.khatiyan.d_modules.property.model.ManagerResource;

class AnalyticsServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 26);
    private final UUID actor = UUID.randomUUID();
    private final UUID property = UUID.randomUUID();

    private PropertyModule propertyModule;
    private PropertyAnalytics propertyAnalytics;
    private final List<AnalyticsContext> seen = new ArrayList<>();
    private AnalyticsService service;

    @BeforeEach
    void setUp() {
        propertyModule = mock(PropertyModule.class);
        propertyAnalytics = mock(PropertyAnalytics.class);
        when(propertyAnalytics.registeredOn(property)).thenReturn(LocalDate.of(2026, 1, 14));
        DivisionAssembler billing = new DivisionAssembler() {
            @Override
            public AnalyticsDivision division() {
                return AnalyticsDivision.BILLING;
            }

            @Override
            public List<MetricResult> assemble(AnalyticsContext context) {
                seen.add(context);
                return List.of(MetricResult.of(MetricKey.BILLING_DUES).build());
            }
        };
        service = new AnalyticsService(propertyModule, propertyAnalytics, List.of(billing));
    }

    private void grant(boolean owner, ManagerResource... viewable) {
        Map<ManagerResource, ManagerAccessLevel> levels = new EnumMap<>(ManagerResource.class);
        for (ManagerResource resource : ManagerResource.values()) {
            levels.put(resource, owner ? ManagerAccessLevel.MANAGE : ManagerAccessLevel.NONE);
        }
        for (ManagerResource resource : viewable) {
            levels.put(resource, ManagerAccessLevel.VIEW);
        }
        when(propertyModule.permissionsFor(actor, property))
                .thenReturn(new ManagerPermissionsResponse(property, actor, owner, levels, 0L));
    }

    @Test
    void anOwnerGetsTheResolvedPeriodAndEveryBillingMetric() {
        grant(true);
        AnalyticsResponse response = service.divisionAnalytics(actor, property, AnalyticsDivision.BILLING,
                PeriodPreset.LAST_3_MONTHS, null, null, TODAY);

        assertThat(response.period().from()).isEqualTo(LocalDate.of(2026, 7, 1));
        assertThat(response.period().compareFrom()).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(response.metrics()).extracting(MetricResult::key).containsExactly("billing.dues");
        assertThat(seen.get(0).visible()).contains(MetricKey.BILLING_UPI_CLAIMS_PENDING);
    }

    @Test
    void aManagerIsFilteredBeforeTheAssemblerRuns() {
        grant(false, ManagerResource.BILLING_CYCLES);
        service.divisionAnalytics(actor, property, AnalyticsDivision.BILLING, PeriodPreset.THIS_MONTH, null, null, TODAY);
        assertThat(seen.get(0).visible()).contains(MetricKey.BILLING_DUES).doesNotContain(MetricKey.BILLING_UPI_CLAIMS_PENDING);
    }

    @Test
    void aManagerWithNoneOfTheDivisionsResourcesIsRefused() {
        grant(false, ManagerResource.CONCERNS);
        assertThatThrownBy(() -> service.divisionAnalytics(actor, property, AnalyticsDivision.BILLING,
                PeriodPreset.THIS_MONTH, null, null, TODAY)).isInstanceOf(ForbiddenException.class);
        assertThat(seen).isEmpty();
    }

    @Test
    void aDivisionWithNoAssemblerYetReturnsNoMetrics() {
        grant(true);
        AnalyticsResponse response = service.divisionAnalytics(actor, property, AnalyticsDivision.CONCERNS,
                PeriodPreset.THIS_MONTH, null, null, TODAY);
        assertThat(response.metrics()).isEmpty();
    }
}
