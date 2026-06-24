package com.khatiyan.d_modules.property;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.model.RoomType;
import com.khatiyan.d_modules.property.model.SharingType;
import com.khatiyan.d_modules.property.service.PropertyManagerService;
import com.khatiyan.d_modules.property.service.PropertyService;
import com.khatiyan.d_modules.property.service.RoomService;

@ExtendWith(MockitoExtension.class)
class PropertyModuleTest {

    @Mock
    private RoomService roomService;

    @Mock
    private PropertyService propertyService;

    @Mock
    private PropertyManagerService propertyManagerService;

    private PropertyModule propertyModule;

    @BeforeEach
    void setUp() {
        propertyModule = new PropertyModule(roomService, propertyService, propertyManagerService);
    }

    @Test
    void delegatesPropertyReadsAndManagementChecks() {
        UUID actorUserId = UUID.randomUUID();
        UUID propertyId = UUID.randomUUID();
        PropertyResponse propertyResponse = propertyResponse(propertyId);
        PropertyBillingPolicyResponse billingPolicy = new PropertyBillingPolicyResponse(
                BillingCollectionTiming.CYCLE_START,
                3,
                100_00L);
        when(propertyService.getActiveProperty(propertyId)).thenReturn(propertyResponse);
        when(propertyService.getBillingPolicy(propertyId)).thenReturn(billingPolicy);

        assertThat(propertyModule.getActiveProperty(propertyId)).isSameAs(propertyResponse);
        assertThat(propertyModule.getBillingPolicy(propertyId)).isSameAs(billingPolicy);
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        propertyModule.markDiscoveryProfileCreated(propertyId);

        verify(propertyManagerService).ensureCanManageProperty(actorUserId, propertyId);
        verify(propertyService).markDiscoveryProfileCreated(propertyId);
    }

    @Test
    void delegatesRoomVacancyAndTenancyLifecycleOperations() {
        UUID propertyId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        UUID oldRoomId = UUID.randomUUID();
        UUID newRoomId = UUID.randomUUID();
        RoomResponse roomResponse = roomResponse(propertyId, roomId);
        when(roomService.getActiveRoom(propertyId, roomId)).thenReturn(roomResponse);
        when(roomService.hasAvailableVacancy(propertyId, roomId)).thenReturn(true);
        when(roomService.getAvailableVacancies(propertyId, roomId)).thenReturn(2);

        assertThat(propertyModule.getActiveRoom(propertyId, roomId)).isSameAs(roomResponse);
        assertThat(propertyModule.hasAvailableVacancy(propertyId, roomId)).isTrue();
        assertThat(propertyModule.getAvailableVacancies(propertyId, roomId)).isEqualTo(2);

        propertyModule.handleTenancyStarted(propertyId, roomId);
        propertyModule.handleTenancyEnded(propertyId, roomId);
        propertyModule.handleTenancyRoomTransferred(propertyId, oldRoomId, newRoomId);

        verify(roomService).handleTenancyStarted(propertyId, roomId);
        verify(roomService).handleTenancyEnded(propertyId, roomId);
        verify(roomService).handleTenancyEnded(propertyId, oldRoomId);
        verify(roomService).handleTenancyStarted(propertyId, newRoomId);
    }

    private static PropertyResponse propertyResponse(UUID propertyId) {
        return new PropertyResponse(
                propertyId,
                "PROP-2026-000001",
                UUID.randomUUID(),
                "Sky PG",
                "Plot 1",
                "Madhapur",
                "Hyderabad",
                "Telangana",
                "500046",
                new BigDecimal("17.4500000"),
                new BigDecimal("78.3800000"),
                PropertyType.PG,
                PgFor.ANYONE,
                PreferredTenantType.ANYONE,
                false,
                Set.of(),
                false,
                BathroomType.COMMON,
                Set.of(SharingType.DOUBLE),
                Set.of(),
                Set.of(),
                2_000_00L,
                1_500_00L,
                100_00L,
                BillingCollectionTiming.CYCLE_START,
                3,
                10_000_00,
                30,
                true,
                true);
    }

    private static RoomResponse roomResponse(UUID propertyId, UUID roomId) {
        return new RoomResponse(
                roomId,
                propertyId,
                "101",
                "1",
                2,
                0,
                2,
                RoomType.DOUBLE,
                RoomConditioning.NON_AC,
                12_000_00,
                RoomStatus.VACANT,
                true,
                null,
                null,
                null,
                null,
                null,
                null);
    }
}
