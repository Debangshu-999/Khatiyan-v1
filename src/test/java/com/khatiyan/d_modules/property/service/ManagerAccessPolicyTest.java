package com.khatiyan.d_modules.property.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.model.ManagerAccessLevel;
import com.khatiyan.d_modules.property.model.ManagerPermission;
import com.khatiyan.d_modules.property.model.ManagerResource;
import com.khatiyan.d_modules.property.repository.ManagerPermissionRepository;
import com.khatiyan.d_modules.property.repository.PropertyManagerRepository;
import com.khatiyan.d_modules.property.repository.PropertyRepository;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ManagerAccessPolicyTest {

    private static final UUID PROPERTY_ID = UUID.randomUUID();
    private static final UUID OWNER_ID = UUID.randomUUID();
    private static final UUID MANAGER_ID = UUID.randomUUID();
    private static final UUID STRANGER_ID = UUID.randomUUID();

    @Mock
    private PropertyRepository propertyRepository;

    @Mock
    private PropertyManagerRepository propertyManagerRepository;

    @Mock
    private ManagerPermissionRepository managerPermissionRepository;

    private ManagerAccessPolicy policy;

    @BeforeEach
    void setUp() {
        policy = new ManagerAccessPolicy(propertyRepository, propertyManagerRepository, managerPermissionRepository);

        when(propertyRepository.existsByIdAndOwnerIdAndActiveTrue(PROPERTY_ID, OWNER_ID)).thenReturn(true);
        when(propertyManagerRepository.existsByPropertyIdAndManagerUserIdAndActiveTrue(PROPERTY_ID, MANAGER_ID))
                .thenReturn(true);
        when(managerPermissionRepository.findByPropertyIdAndManagerUserId(PROPERTY_ID, MANAGER_ID))
                .thenReturn(List.of());
    }

    private static ManagerPermission grant(ManagerResource resource, ManagerAccessLevel level) {
        return ManagerPermission.grant(PROPERTY_ID, MANAGER_ID, resource, level, OWNER_ID);
    }

    @Test
    void ownerHasEverythingWithoutAnyGrants() {
        for (ManagerResource resource : ManagerResource.values()) {
            assertThat(policy.levelFor(OWNER_ID, PROPERTY_ID, resource))
                    .as("owner must not depend on granted rows")
                    .isEqualTo(ManagerAccessLevel.MANAGE);
        }
    }

    @Test
    void aManagerWithNoGrantsHasNothing() {
        // The state every existing manager lands in the day this ships.
        for (ManagerResource resource : ManagerResource.values()) {
            assertThat(policy.levelFor(MANAGER_ID, PROPERTY_ID, resource)).isEqualTo(ManagerAccessLevel.NONE);
        }

        assertThatThrownBy(() -> policy.ensureCanView(MANAGER_ID, PROPERTY_ID, ManagerResource.BILLING_CYCLES))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void viewGrantAllowsReadingButNotChanging() {
        when(managerPermissionRepository.findByPropertyIdAndManagerUserId(PROPERTY_ID, MANAGER_ID))
                .thenReturn(List.of(grant(ManagerResource.BILLING_CYCLES, ManagerAccessLevel.VIEW)));

        policy.ensureCanView(MANAGER_ID, PROPERTY_ID, ManagerResource.BILLING_CYCLES);

        assertThatThrownBy(() -> policy.ensureCanManage(MANAGER_ID, PROPERTY_ID, ManagerResource.BILLING_CYCLES))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("view-only");
    }

    @Test
    void grantsDoNotLeakBetweenResources() {
        when(managerPermissionRepository.findByPropertyIdAndManagerUserId(PROPERTY_ID, MANAGER_ID))
                .thenReturn(List.of(grant(ManagerResource.CONCERNS, ManagerAccessLevel.MANAGE)));

        assertThat(policy.levelFor(MANAGER_ID, PROPERTY_ID, ManagerResource.CONCERNS))
                .isEqualTo(ManagerAccessLevel.MANAGE);
        assertThat(policy.levelFor(MANAGER_ID, PROPERTY_ID, ManagerResource.BILLING_CYCLES))
                .as("holding one resource must not imply any other")
                .isEqualTo(ManagerAccessLevel.NONE);
    }

    @Test
    void someoneWhoIsNeitherOwnerNorManagerHasNothingEvenWithRows() {
        // Rows could survive a manager being removed; being listed is not access.
        when(managerPermissionRepository.findByPropertyIdAndManagerUserId(PROPERTY_ID, STRANGER_ID))
                .thenReturn(List.of(ManagerPermission.grant(
                        PROPERTY_ID, STRANGER_ID, ManagerResource.NOTICES, ManagerAccessLevel.MANAGE, OWNER_ID)));

        assertThat(policy.levelFor(STRANGER_ID, PROPERTY_ID, ManagerResource.NOTICES))
                .isEqualTo(ManagerAccessLevel.NONE);
    }

    @Test
    void levelsForAlwaysReturnsEveryResource() {
        Map<ManagerResource, ManagerAccessLevel> levels = policy.levelsFor(MANAGER_ID, PROPERTY_ID);

        assertThat(levels)
                .as("the client must never have to interpret a missing key")
                .hasSize(ManagerResource.values().length);
    }

    @Test
    void onlyTheOwnerCanChangeGrants() {
        Map<ManagerResource, ManagerAccessLevel> requested = new EnumMap<>(ManagerResource.class);
        requested.put(ManagerResource.BILLING_CYCLES, ManagerAccessLevel.MANAGE);

        // A manager granting themselves would make the whole model decorative.
        assertThatThrownBy(() -> policy.replaceGrants(MANAGER_ID, PROPERTY_ID, MANAGER_ID, requested))
                .isInstanceOf(ForbiddenException.class);
        verify(managerPermissionRepository, never()).save(any());
    }

    @Test
    void grantsCannotBeGivenToSomeoneWhoIsNotAManager() {
        assertThatThrownBy(() -> policy.replaceGrants(
                OWNER_ID, PROPERTY_ID, STRANGER_ID, new EnumMap<>(ManagerResource.class)))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void revokingDeletesTheRowBecauseAbsenceIsNone() {
        ManagerPermission existing = grant(ManagerResource.NOTICES, ManagerAccessLevel.MANAGE);
        when(managerPermissionRepository.findByPropertyIdAndManagerUserId(PROPERTY_ID, MANAGER_ID))
                .thenReturn(List.of(existing));

        // Empty request = revoke everything.
        policy.replaceGrants(OWNER_ID, PROPERTY_ID, MANAGER_ID, new EnumMap<>(ManagerResource.class));

        verify(managerPermissionRepository).delete(existing);
    }

    @Test
    void viewAnyPassesOnTheSecondResourceWhenTheFirstIsNotGranted() {
        // The exit-policies read: not granted TENANCY_RULES, but ending a stay
        // needs the damage schedule, and TENANCIES says they may end one.
        when(managerPermissionRepository.findByPropertyIdAndManagerUserId(PROPERTY_ID, MANAGER_ID))
                .thenReturn(List.of(grant(ManagerResource.TENANCIES, ManagerAccessLevel.VIEW)));

        policy.ensureCanViewAny(
                MANAGER_ID, PROPERTY_ID, ManagerResource.TENANCY_RULES, ManagerResource.TENANCIES);
    }

    @Test
    void viewAnyRefusesWhenNoneOfTheResourcesAreGranted() {
        when(managerPermissionRepository.findByPropertyIdAndManagerUserId(PROPERTY_ID, MANAGER_ID))
                .thenReturn(List.of(grant(ManagerResource.NOTICES, ManagerAccessLevel.MANAGE)));

        assertThatThrownBy(() -> policy.ensureCanViewAny(
                MANAGER_ID, PROPERTY_ID, ManagerResource.TENANCY_RULES, ManagerResource.TENANCIES))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void viewAnyStillRefusesSomeoneWhoIsNotOnTheProperty() {
        assertThatThrownBy(() -> policy.ensureCanViewAny(
                STRANGER_ID, PROPERTY_ID, ManagerResource.TENANCY_RULES, ManagerResource.TENANCIES))
                .isInstanceOf(ForbiddenException.class);
    }
}
