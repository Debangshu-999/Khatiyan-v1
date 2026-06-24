package com.khatiyan.d_modules.concerns;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.d_modules.concerns.api.dto.AssignConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernResponse;
import com.khatiyan.d_modules.concerns.api.dto.CreateConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.UpdateConcernStatusRequest;
import com.khatiyan.d_modules.concerns.model.ConcernCategory;
import com.khatiyan.d_modules.concerns.model.ConcernEscalationLevel;
import com.khatiyan.d_modules.concerns.model.ConcernStatus;
import com.khatiyan.d_modules.concerns.service.ConcernService;

@ExtendWith(MockitoExtension.class)
class ConcernModuleTest {

    @Mock
    private ConcernService concernService;

    private ConcernModule concernModule;
    private ConcernResponse concernResponse;

    @BeforeEach
    void setUp() {
        concernModule = new ConcernModule(concernService);
        concernResponse = concernResponse();
    }

    @Test
    void delegatesTenantConcernMethodsToService() {
        UUID tenantUserId = UUID.randomUUID();
        CreateConcernRequest request = new CreateConcernRequest(
                ConcernCategory.WATER,
                "No water",
                "Water supply stopped",
                List.of());
        when(concernService.raiseConcern(tenantUserId, request)).thenReturn(concernResponse);
        when(concernService.listTenantCurrentConcerns(tenantUserId)).thenReturn(List.of(concernResponse));
        when(concernService.listTenantConcernHistory(tenantUserId)).thenReturn(List.of());

        assertThat(concernModule.raiseConcern(tenantUserId, request)).isSameAs(concernResponse);
        assertThat(concernModule.listTenantCurrentConcerns(tenantUserId)).containsExactly(concernResponse);
        assertThat(concernModule.listTenantConcernHistory(tenantUserId)).isEmpty();

        verify(concernService).raiseConcern(tenantUserId, request);
        verify(concernService).listTenantCurrentConcerns(tenantUserId);
        verify(concernService).listTenantConcernHistory(tenantUserId);
    }

    @Test
    void delegatesAdminConcernLifecycleMethodsToService() {
        UUID actorUserId = UUID.randomUUID();
        UUID propertyId = UUID.randomUUID();
        UUID concernId = UUID.randomUUID();
        AssignConcernRequest assignRequest = new AssignConcernRequest(UUID.randomUUID());
        UpdateConcernStatusRequest statusRequest = new UpdateConcernStatusRequest(ConcernStatus.IN_PROGRESS, "Will be done in 2 days");
        when(concernService.listAvailableConcerns(actorUserId, propertyId)).thenReturn(List.of(concernResponse));
        when(concernService.assignConcern(actorUserId, concernId, assignRequest)).thenReturn(concernResponse);
        when(concernService.updateConcernStatus(actorUserId, concernId, statusRequest)).thenReturn(concernResponse);

        assertThat(concernModule.listAvailableConcerns(actorUserId, propertyId)).containsExactly(concernResponse);
        assertThat(concernModule.assignConcern(actorUserId, concernId, assignRequest)).isSameAs(concernResponse);
        assertThat(concernModule.updateConcernStatus(actorUserId, concernId, statusRequest)).isSameAs(concernResponse);

        verify(concernService).listAvailableConcerns(actorUserId, propertyId);
        verify(concernService).assignConcern(actorUserId, concernId, assignRequest);
        verify(concernService).updateConcernStatus(actorUserId, concernId, statusRequest);
    }

    @Test
    void delegatesSchedulerQueriesToService() {
        Instant createdBefore = Instant.parse("2026-06-01T00:00:00Z");
        when(concernService.closeExpiredResolvedConcerns()).thenReturn(2);
        when(concernService.findOpenUnassignedCreatedBefore(createdBefore)).thenReturn(List.of(concernResponse));
        when(concernService.updateConcernEscalationLevels()).thenReturn(1);

        assertThat(concernModule.closeExpiredResolvedConcerns()).isEqualTo(2);
        assertThat(concernModule.findOpenUnassignedCreatedBefore(createdBefore)).containsExactly(concernResponse);
        assertThat(concernModule.updateConcernEscalationLevels()).isEqualTo(1);
    }

    private static ConcernResponse concernResponse() {
        return new ConcernResponse(
                UUID.randomUUID(),
                "CON-2026-000001",
                UUID.randomUUID(),
                "101",
                "TEN-2026-000001",
                UUID.randomUUID(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                ConcernCategory.WATER,
                ConcernEscalationLevel.NONE,
                ConcernStatus.OPEN,
                "No water",
                "Water supply stopped",
                null,
                null,
                null,
                null,
                false,
                null,
                null,
                null,
                null,
                List.of());
    }
}
