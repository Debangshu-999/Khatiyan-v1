package com.khatiyan.d_modules.concerns.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.d_modules.concerns.api.dto.AssignConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernPhotoRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernResponse;
import com.khatiyan.d_modules.concerns.api.dto.CreateConcernRequest;
import com.khatiyan.d_modules.concerns.event.ConcernAssignedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernRaisedEvent;
import com.khatiyan.d_modules.concerns.model.Concern;
import com.khatiyan.d_modules.concerns.model.ConcernCategory;
import com.khatiyan.d_modules.concerns.model.ConcernPriority;
import com.khatiyan.d_modules.concerns.model.ConcernStatus;
import com.khatiyan.d_modules.concerns.repository.ConcernRepository;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;

@ExtendWith(MockitoExtension.class)
class ConcernServiceTest {

    private static final UUID TENANT_ID = UUID.randomUUID();
    private static final UUID PROPERTY_ID = UUID.randomUUID();
    private static final UUID ROOM_ID = UUID.randomUUID();
    private static final UUID TENANCY_ID = UUID.randomUUID();
    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID MANAGER_ID = UUID.randomUUID();

    @Mock
    private ConcernRepository concernRepository;

    @Mock
    private TenancyModule tenancyModule;

    @Mock
    private PropertyModule propertyModule;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private ReferenceCodeGenerator referenceCodeGenerator;

    private ConcernService concernService;

    @BeforeEach
    void setUp() {
        concernService = new ConcernService(
                concernRepository,
                tenancyModule,
                propertyModule,
                eventPublisher,
                referenceCodeGenerator);
    }

    @Test
    void raiseConcernUsesActiveTenancyAndPublishesRaisedEvent() {
        when(referenceCodeGenerator.nextCode("CON")).thenReturn("CON-2026-000001");
        when(tenancyModule.findActiveByUserId(TENANT_ID)).thenReturn(Optional.of(activeTenancy()));
        when(concernRepository.save(any(Concern.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ConcernResponse response = concernService.raiseConcern(
                TENANT_ID,
                new CreateConcernRequest(
                        ConcernCategory.WIFI,
                        ConcernPriority.HIGH,
                        " WiFi down ",
                        " Router is not working ",
                        List.of(new ConcernPhotoRequest("https://cdn.example.com/photo.jpg", "concerns/photo"))));

        assertThat(response.propertyId()).isEqualTo(PROPERTY_ID);
        assertThat(response.referenceCode()).isEqualTo("CON-2026-000001");
        assertThat(response.roomId()).isEqualTo(ROOM_ID);
        assertThat(response.tenancyId()).isEqualTo(TENANCY_ID);
        assertThat(response.raisedByUserId()).isEqualTo(TENANT_ID);
        assertThat(response.status()).isEqualTo(ConcernStatus.OPEN);
        assertThat(response.title()).isEqualTo("WiFi down");
        assertThat(response.description()).isEqualTo("Router is not working");
        assertThat(response.photos()).hasSize(1);

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue()).isInstanceOf(ConcernRaisedEvent.class);
    }

    @Test
    void assignConcernVerifiesActorAndAssigneeCanManageProperty() {
        Concern concern = concern();
        when(concernRepository.findConcernById(concern.getId())).thenReturn(Optional.of(concern));

        ConcernResponse response = concernService.assignConcern(
                ACTOR_ID,
                concern.getId(),
                new AssignConcernRequest(MANAGER_ID));

        assertThat(response.status()).isEqualTo(ConcernStatus.UNDER_REVIEW);
        assertThat(response.assignedToUserId()).isEqualTo(MANAGER_ID);
        verify(propertyModule).ensureCanManageProperty(ACTOR_ID, PROPERTY_ID);
        verify(propertyModule).ensureCanManageProperty(MANAGER_ID, PROPERTY_ID);
        verify(eventPublisher).publishEvent(any(ConcernAssignedEvent.class));
    }

    private static Concern concern() {
        return Concern.raise(
                "CON-2026-000001",
                PROPERTY_ID,
                ROOM_ID,
                TENANCY_ID,
                TENANT_ID,
                ConcernCategory.CLEANING,
                ConcernPriority.MEDIUM,
                "Room cleaning",
                "Cleaning was missed");
    }

    private static TenancyResponse activeTenancy() {
        return new TenancyResponse(
                TENANCY_ID,
                "TEN-2026-000001",
                TENANT_ID,
                PROPERTY_ID,
                ROOM_ID,
                ACTOR_ID,
                TenancyBillingType.MONTHLY,
                12_000_00L,
                10_000_00L,
                null,
                LocalDate.of(2026, 6, 1),
                null,
                null,
                TenancyStatus.ACTIVE,
                null,
                true);
    }
}
