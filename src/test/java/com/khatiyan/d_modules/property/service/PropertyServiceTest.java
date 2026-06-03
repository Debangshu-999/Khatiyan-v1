package com.khatiyan.d_modules.property.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.discovery.DiscoveryModule;
import com.khatiyan.d_modules.property.api.dto.CreatePropertyRequest;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.event.PropertyCreatedEvent;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.repository.PropertyRepository;

@ExtendWith(MockitoExtension.class)
class PropertyServiceTest {

    private static final UUID OWNER_ID = UUID.randomUUID();

    @Mock
    private PropertyRepository propertyRepository;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private DiscoveryModule discoveryModule;

    @Mock
    private ReferenceCodeGenerator referenceCodeGenerator;

    private PropertyService propertyService;

    @BeforeEach
    void setUp() {
        propertyService = new PropertyService(propertyRepository, eventPublisher, discoveryModule, referenceCodeGenerator);
    }

    @Test
    void createPropertyPersistsBillingPolicyAndPublishesDiscoverySeedEvent() {
        when(referenceCodeGenerator.nextCode("PROP")).thenReturn("PROP-2026-000001");
        when(propertyRepository.save(any(Property.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PropertyResponse response = propertyService.createProperty(OWNER_ID, createPropertyRequest());

        assertThat(response.referenceCode()).isEqualTo("PROP-2026-000001");
        assertThat(response.ownerId()).isEqualTo(OWNER_ID);
        assertThat(response.name()).isEqualTo("Sky Prime PG");
        assertThat(response.facilities()).contains(PropertyFacility.WIFI, PropertyFacility.MESS);
        assertThat(response.customFacilities()).contains("Ironing");
        assertThat(response.billingCollectionTiming()).isEqualTo(BillingCollectionTiming.CYCLE_START);
        assertThat(response.rentGraceDays()).isEqualTo(4);
        assertThat(response.standardDepositPaise()).isEqualTo(10_000_00);
        assertThat(response.discoveryProfileCreated()).isFalse();

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue()).isInstanceOf(PropertyCreatedEvent.class);
        PropertyCreatedEvent event = (PropertyCreatedEvent) eventCaptor.getValue();
        assertThat(event.propertyId()).isEqualTo(response.id());
        assertThat(event.discoveryHeadline()).isEqualTo("Near metro PG");
        assertThat(event.discoveryDescription()).isEqualTo("Clean managed PG near metro.");
    }

    @Test
    void deactivatePropertyUnlistsDiscoveryProfileBeforeMarkingPropertyInactive() {
        Property property = property();
        when(propertyRepository.findByIdAndActiveTrue(property.getId())).thenReturn(Optional.of(property));

        propertyService.deactivateProperty(OWNER_ID, property.getId());

        assertThat(property.isCurrentlyActive()).isFalse();
        InOrder order = inOrder(discoveryModule);
        order.verify(discoveryModule).unlistPropertyProfileForDeactivation(property.getId());
    }

    private static Property property() {
        return Property.create(
                OWNER_ID,
                "Sky Prime PG",
                "Plot 1",
                "Hyderabad",
                "500046",
                new BigDecimal("17.4500000"),
                new BigDecimal("78.3800000"),
                PropertyType.PG,
                Set.of(PropertyFacility.WIFI),
                Set.of(),
                2_000_00L,
                1_500_00L,
                100_00L,
                3,
                10_000_00L,
                30);
    }

    private static CreatePropertyRequest createPropertyRequest() {
        return new CreatePropertyRequest(
                "Sky Prime PG",
                "Plot 1",
                "Hyderabad",
                "500046",
                new BigDecimal("17.4500000"),
                new BigDecimal("78.3800000"),
                PropertyType.PG,
                Set.of(PropertyFacility.WIFI, PropertyFacility.MESS),
                Set.of("Ironing"),
                2_000_00L,
                1_500_00L,
                100_00L,
                4,
                10_000_00L,
                30,
                "Near metro PG",
                "Clean managed PG near metro.",
                "https://cdn.example.com/pg.jpg");
    }
}
