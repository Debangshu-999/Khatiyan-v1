package com.khatiyan.d_modules.concerns.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Set;
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

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.concerns.api.dto.AssignConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernPhotoRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernResponse;
import com.khatiyan.d_modules.concerns.api.dto.CreateConcernRequest;
import com.khatiyan.d_modules.concerns.event.ConcernAssignedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernRaisedEvent;
import com.khatiyan.d_modules.concerns.model.Concern;
import com.khatiyan.d_modules.concerns.model.ConcernCategory;
import com.khatiyan.d_modules.concerns.model.ConcernStatus;
import com.khatiyan.d_modules.concerns.repository.ConcernRepository;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.d_modules.property.model.RoomStatus;
import com.khatiyan.d_modules.property.model.RoomType;
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
    private AuthModule authModule;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private ReferenceCodeGenerator referenceCodeGenerator;

    @Mock
    private ConcernAccessPolicy concernAccessPolicy;

    private ConcernService concernService;

    @BeforeEach
    void setUp() {
        concernService = new ConcernService(
                concernRepository,
                tenancyModule,
                propertyModule,
                concernAccessPolicy,
                authModule,
                eventPublisher,
                referenceCodeGenerator);
    }

    @Test
    void raiseConcernUsesActiveTenancyAndPublishesRaisedEvent() {
        when(referenceCodeGenerator.nextCode("CON")).thenReturn("CON-2026-000001");
        when(tenancyModule.findActiveByUserId(TENANT_ID)).thenReturn(Optional.of(activeTenancy()));
        when(tenancyModule.findById(TENANCY_ID)).thenReturn(Optional.of(activeTenancy()));
        when(propertyModule.findRoomForDisplay(PROPERTY_ID, ROOM_ID)).thenReturn(Optional.of(activeRoom()));
        when(concernRepository.countRaisedByUserIdSince(any(UUID.class), any())).thenReturn(0L);
        when(concernRepository.save(any(Concern.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ConcernResponse response = concernService.raiseConcern(
                TENANT_ID,
                new CreateConcernRequest(
                        ConcernCategory.WIFI,
                        " WiFi down ",
                        " Router is not working ",
                        List.of(new ConcernPhotoRequest("https://cdn.example.com/photo.jpg", "concerns/photo"))));

        assertThat(response.propertyId()).isEqualTo(PROPERTY_ID);
        assertThat(response.referenceCode()).isEqualTo("CON-2026-000001");
        assertThat(response.roomNumber()).isEqualTo("101");
        assertThat(response.tenancyReferenceCode()).isEqualTo("TEN-2026-000001");
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
    void raiseConcernRejectsSixthConcernWithinSevenDays() {
        when(tenancyModule.findActiveByUserId(TENANT_ID)).thenReturn(Optional.of(activeTenancy()));
        when(concernRepository.countRaisedByUserIdSince(any(UUID.class), any())).thenReturn(5L);

        assertThatThrownBy(() -> concernService.raiseConcern(
                TENANT_ID,
                new CreateConcernRequest(
                        ConcernCategory.WIFI,
                        "WiFi down",
                        "Router is not working",
                        List.of())))
                .isInstanceOf(ValidationException.class)
                .hasMessage("You can raise up to 5 concerns in a 7 day period.");
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
        // The actor needs MANAGE on concerns; the assignee is checked separately,
        // because being handed a concern you cannot act on leaves it unclearable.
        verify(concernAccessPolicy).ensureCanManage(ACTOR_ID, PROPERTY_ID);
        verify(concernAccessPolicy).ensureAssigneeCanWorkConcerns(MANAGER_ID, PROPERTY_ID);
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
                "Room cleaning",
                "Cleaning was missed");
    }

    private static TenancyResponse activeTenancy() {
        return new TenancyResponse(
                TENANCY_ID,
                "TEN-2026-000001",
                TENANT_ID,
                "Test Tenant",
                "+911234567890",
                true,
                true,
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
                true,
                true,
                false,
                null,
                null,
                null,
                null,
                null,
                // Not a guest stay: this fixture is an account-backed monthly tenancy.
                false,
                null,
                null,
                null,
                null);
    }

    private static RoomResponse activeRoom() {
        return new RoomResponse(
                ROOM_ID,
                PROPERTY_ID,
                "101",
                "1",
                1,
                1,
                0,
                0,
                RoomType.SINGLE,
                RoomConditioning.NON_AC,
                12_000_00L,
                null,
                Set.of(),
                Set.of(),
                RoomStatus.OCCUPIED,
                true,
                null,
                null,
                null,
                null,
                null,
                null);
    }
}
