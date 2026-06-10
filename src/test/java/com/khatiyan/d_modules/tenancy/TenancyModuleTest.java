package com.khatiyan.d_modules.tenancy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.service.TenancyExitRequestService;
import com.khatiyan.d_modules.tenancy.service.TenancyRoomChangeRequestService;
import com.khatiyan.d_modules.tenancy.service.TenancyService;

@ExtendWith(MockitoExtension.class)
class TenancyModuleTest {

    @Mock
    private TenancyService tenancyService;

    @Mock
    private TenancyExitRequestService tenancyExitRequestService;

    @Mock
    private TenancyRoomChangeRequestService tenancyRoomChangeRequestService;

    private TenancyModule tenancyModule;

    @BeforeEach
    void setUp() {
        tenancyModule = new TenancyModule(tenancyService, tenancyExitRequestService, tenancyRoomChangeRequestService);
    }

    @Test
    void findByIdReturnsPublicTenancyResponse() {
        Tenancy tenancy = tenancy();
        when(tenancyService.findById(tenancy.getId())).thenReturn(Optional.of(tenancy));

        Optional<TenancyResponse> response = tenancyModule.findById(tenancy.getId());

        assertThat(response).isPresent();
        assertThat(response.get().id()).isEqualTo(tenancy.getId());
        assertThat(response.get().userId()).isEqualTo(tenancy.getUserId());
        assertThat(response.get().propertyId()).isEqualTo(tenancy.getPropertyId());
    }

    @Test
    void findActiveByPropertyIdMapsAllTenanciesToResponses() {
        UUID propertyId = UUID.randomUUID();
        Tenancy tenancy = tenancyForProperty(propertyId);
        when(tenancyService.findActiveByPropertyId(propertyId)).thenReturn(List.of(tenancy));

        List<TenancyResponse> responses = tenancyModule.findActiveByPropertyId(propertyId);

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).id()).isEqualTo(tenancy.getId());
        assertThat(responses.get(0).propertyId()).isEqualTo(propertyId);
    }

    @Test
    void delegatesPropertyAndRoomQuestions() {
        UUID userId = UUID.randomUUID();
        UUID propertyId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        when(tenancyService.isUserTenantOfProperty(userId, propertyId)).thenReturn(true);
        when(tenancyService.hasActiveTenancyForRoom(roomId)).thenReturn(true);
        when(tenancyService.countActiveTenanciesForRoom(roomId)).thenReturn(2L);

        assertThat(tenancyModule.isUserTenantOfProperty(userId, propertyId)).isTrue();
        assertThat(tenancyModule.hasActiveTenancyForRoom(roomId)).isTrue();
        assertThat(tenancyModule.countActiveTenanciesForRoom(roomId)).isEqualTo(2);
    }

    @Test
    void markBillingStartedDelegatesToService() {
        UUID tenancyId = UUID.randomUUID();

        tenancyModule.markBillingStarted(tenancyId);

        verify(tenancyService).markBillingStarted(tenancyId);
    }

    private static Tenancy tenancy() {
        return tenancyForProperty(UUID.randomUUID());
    }

    private static Tenancy tenancyForProperty(UUID propertyId) {
        return Tenancy.start(
                UUID.randomUUID(),
                propertyId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                12_000_00,
                10_000_00,
                LocalDate.of(2026, 6, 1));
    }
}
