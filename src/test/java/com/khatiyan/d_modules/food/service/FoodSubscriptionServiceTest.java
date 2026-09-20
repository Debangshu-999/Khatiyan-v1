package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.mock;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.FoodSubscriptionResponse;
import com.khatiyan.d_modules.food.api.dto.SubscribeFoodProfileRequest;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodSubscription;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

@ExtendWith(MockitoExtension.class)
class FoodSubscriptionServiceTest {

    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID TENANCY = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID ACTOR = UUID.randomUUID();

    @Mock private TenancyModule tenancyModule;
    @Mock private PropertyModule propertyModule;
    @Mock private FoodModuleSettingService moduleSettingService;
    @Mock private FoodAccessPolicy accessPolicy;
    @Mock private FoodProfileRepository profileRepository;
    @Mock private FoodSubscriptionRepository subscriptionRepository;
    @Mock private FoodMenuService menuService;
    private FoodSubscriptionService service;

    @BeforeEach
    void setUp() {
        service = new FoodSubscriptionService(
                tenancyModule,
                propertyModule,
                moduleSettingService,
                accessPolicy,
                profileRepository,
                subscriptionRepository,
                menuService);
    }

    @Test
    void availabilityKeepsPropertyFoodSeparateFromModuleStatus() {
        activeTenancy();
        // Built, not mocked. PropertyResponse is a record and therefore final,
        // so Mockito cannot stub it — and a real one is clearer anyway: the
        // test says a property that offers food, with no meals configured.
        PropertyResponse property = FoodTestFixtures.property(PROPERTY, true, Set.of());
        when(propertyModule.getActiveProperty(PROPERTY)).thenReturn(property);
        when(moduleSettingService.isEnabled(PROPERTY)).thenReturn(false);

        var response = service.availability(TENANT);

        assertThat(response.foodAvailableInProperty()).isTrue();
        assertThat(response.moduleEnabled()).isFalse();
    }

    @Test
    void tenantCanSubscribeOnlyThroughTheirActiveTenancy() {
        FoodProfile veg = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0);
        activeTenancy();
        when(profileRepository.findByIdAndActiveTrue(veg.getId())).thenReturn(Optional.of(veg));
        when(subscriptionRepository.findByTenantUserIdAndActiveTrue(TENANT)).thenReturn(Optional.empty());
        when(subscriptionRepository.save(any(FoodSubscription.class)))
                .thenAnswer(call -> call.getArgument(0));

        FoodSubscriptionResponse response =
                service.subscribe(TENANT, new SubscribeFoodProfileRequest(veg.getId()));

        assertThat(response.tenancyId()).isEqualTo(TENANCY);
        assertThat(response.profileName()).isEqualTo("Veg");
        verify(moduleSettingService).requireUsable(PROPERTY);
    }

    @Test
    void changingProfileSoftEndsThePreviousSubscription() {
        FoodProfile oldProfile = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0);
        FoodProfile newProfile = FoodProfile.create(PROPERTY, ACTOR, "Non-veg", null, 1);
        FoodSubscription current =
                FoodSubscription.start(PROPERTY, TENANCY, TENANT, oldProfile.getId());
        activeTenancy();
        when(profileRepository.findByIdAndActiveTrue(newProfile.getId()))
                .thenReturn(Optional.of(newProfile));
        when(subscriptionRepository.findByTenantUserIdAndActiveTrue(TENANT))
                .thenReturn(Optional.of(current));
        when(subscriptionRepository.save(any(FoodSubscription.class)))
                .thenAnswer(call -> call.getArgument(0));

        service.subscribe(TENANT, new SubscribeFoodProfileRequest(newProfile.getId()));

        assertThat(current.isCurrentlyActive()).isFalse();
        assertThat(current.getEndedAt()).isNotNull();
        verify(subscriptionRepository).flush();
    }

    @Test
    void accountWithoutActiveTenancyCannotSubscribe() {
        when(tenancyModule.findActiveByUserId(TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.subscribe(
                TENANT, new SubscribeFoodProfileRequest(UUID.randomUUID())))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Tenant has no active tenancy");

        verify(moduleSettingService, never()).requireUsable(any());
    }

    private void activeTenancy() {
        TenancyResponse tenancy = FoodTestFixtures.tenancy(TENANCY, TENANT, PROPERTY);
        when(tenancyModule.findActiveByUserId(TENANT)).thenReturn(Optional.of(tenancy));
    }
}
