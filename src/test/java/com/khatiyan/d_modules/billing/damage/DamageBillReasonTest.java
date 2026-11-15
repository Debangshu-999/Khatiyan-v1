package com.khatiyan.d_modules.billing.damage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.khatiyan.d_modules.property.model.DamageLevel;

class DamageBillReasonTest {
    @Test
    void aSplitNamesItsNumberAndASingleRecordDoesNot() {
        DamageRecord record = mock(DamageRecord.class);
        when(record.getCode()).thenReturn("DMG-2026-000279");
        when(record.getItemName()).thenReturn("Cupboard");
        when(record.getDamageLevel()).thenReturn(DamageLevel.D3);

        when(record.getSplitNumber()).thenReturn(null);
        String single = ReflectionTestUtils.invokeMethod(DamageRecordService.class, "billReason", record);
        assertThat(single).isEqualTo("Damage DMG-2026-000279: Cupboard (D3)");

        when(record.getSplitNumber()).thenReturn(2);
        String split = ReflectionTestUtils.invokeMethod(DamageRecordService.class, "billReason", record);
        assertThat(split).isEqualTo("Damage DMG-2026-000279: Cupboard (D3), split 2");

        // Recorded with the property's levels off: no level in the line (2026-11-07).
        when(record.getDamageLevel()).thenReturn(null);
        when(record.getSplitNumber()).thenReturn(null);
        String unlevelled = ReflectionTestUtils.invokeMethod(DamageRecordService.class, "billReason", record);
        assertThat(unlevelled).isEqualTo("Damage DMG-2026-000279: Cupboard");
    }
}
