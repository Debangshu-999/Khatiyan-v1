package com.khatiyan.d_modules.analytics.snapshot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.billing.analytics.BillingAnalytics;
import com.khatiyan.d_modules.property.analytics.PropertyAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics;

class PropertyDailySnapshotJobTest {

    @Test
    void oneBrokenPropertyDoesNotStopTheOthers() {
        UUID broken = UUID.randomUUID();
        UUID fine = UUID.randomUUID();
        PropertyAnalytics property = mock(PropertyAnalytics.class);
        TenancyAnalytics tenancy = mock(TenancyAnalytics.class);
        BillingAnalytics billing = mock(BillingAnalytics.class);
        PropertyDailySnapshotWriter writer = mock(PropertyDailySnapshotWriter.class);
        List<PropertyDailySnapshot> written = new ArrayList<>();
        doAnswer(call -> written.add(call.getArgument(0))).when(writer).upsert(any());

        when(property.activePropertyIds()).thenReturn(List.of(broken, fine));
        when(property.bedCounts(broken)).thenThrow(new IllegalStateException("boom"));
        when(property.bedCounts(fine)).thenReturn(new PropertyAnalytics.BedCounts(28, 5, 1, 2));
        when(tenancy.activeStays(fine)).thenReturn(new TenancyAnalytics.ActiveStays(5, 1));
        when(billing.duesTotals(fine)).thenReturn(new BillingAnalytics.DuesTotals(7500000, 1200000));
        when(billing.deposits(fine)).thenReturn(new BillingAnalytics.Deposits(4000000, 5, 0, 0));

        int count = new PropertyDailySnapshotJob(property, tenancy, billing, writer, "Asia/Kolkata")
                .captureFor(LocalDate.of(2026, 9, 25));

        assertThat(count).isEqualTo(1);
        assertThat(written).singleElement().satisfies(row -> {
            assertThat(row.propertyId()).isEqualTo(fine);
            assertThat(row.snapshotDate()).isEqualTo(LocalDate.of(2026, 9, 25));
            assertThat(row.totalBeds()).isEqualTo(28);
            assertThat(row.activeDailyStays()).isEqualTo(1);
            assertThat(row.duesOverduePaise()).isEqualTo(1200000);
            assertThat(row.depositsHeldPaise()).isEqualTo(4000000);
        });
    }
}
