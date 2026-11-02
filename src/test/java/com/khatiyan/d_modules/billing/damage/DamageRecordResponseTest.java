package com.khatiyan.d_modules.billing.damage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.d_modules.billing.api.dto.DamageRecordResponse;
import com.khatiyan.d_modules.property.PropertyModule;

class DamageRecordResponseTest {
    @Test
    void historyIncludesTheRepairerIdEvenWhenTheirDisplayNameIsUnavailable() {
        UUID propertyId = UUID.randomUUID();
        UUID creatorId = UUID.randomUUID();
        UUID repairerId = UUID.randomUUID();
        PropertyModule properties = mock(PropertyModule.class);
        AuthModule auth = mock(AuthModule.class);
        when(properties.findRoomsForDisplay(eq(propertyId), anySet())).thenReturn(Map.of());
        when(auth.findByIds(anySet())).thenReturn(Map.of());
        DamageRecordService service = new DamageRecordService(null, null, null, properties, null, auth, null, null);
        DamageRecord record = mock(DamageRecord.class);
        when(record.getRoomId()).thenReturn(UUID.randomUUID());
        when(record.getCreatedBy()).thenReturn(creatorId);
        when(record.getRepairedBy()).thenReturn(repairerId);
        when(record.getPhotoUrls()).thenReturn(List.of());
        when(record.getShares()).thenReturn(List.of());

        List<DamageRecordResponse> responses = ReflectionTestUtils.invokeMethod(service, "toResponses", propertyId, List.of(record));

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).createdByUserId()).isEqualTo(creatorId);
        assertThat(responses.get(0).repairedByUserId()).isEqualTo(repairerId);
        assertThat(responses.get(0).repairedByName()).isNull();
        verify(auth).findByIds(Set.of(creatorId, repairerId));
    }

    @Test
    void anOpenRecordHasNoRepairerId() {
        UUID propertyId = UUID.randomUUID();
        UUID creatorId = UUID.randomUUID();
        PropertyModule properties = mock(PropertyModule.class);
        AuthModule auth = mock(AuthModule.class);
        when(properties.findRoomsForDisplay(eq(propertyId), anySet())).thenReturn(Map.of());
        when(auth.findByIds(anySet())).thenReturn(Map.of());
        DamageRecordService service = new DamageRecordService(null, null, null, properties, null, auth, null, null);
        DamageRecord record = mock(DamageRecord.class);
        when(record.getRoomId()).thenReturn(UUID.randomUUID());
        when(record.getCreatedBy()).thenReturn(creatorId);
        when(record.getPhotoUrls()).thenReturn(List.of());
        when(record.getShares()).thenReturn(List.of());

        List<DamageRecordResponse> responses = ReflectionTestUtils.invokeMethod(service, "toResponses", propertyId, List.of(record));

        assertThat(responses.get(0).repairedByUserId()).isNull();
        verify(auth).findByIds(Set.of(creatorId));
    }
}
