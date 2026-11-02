package com.khatiyan.d_modules.tenancy.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.support.IntegrationTest;

/**
 * Being signed in is not a reason to read a stay. These two reads answered any
 * account, with tenant names and phones, until 2026-10-31. Through the real
 * controller, so the wiring is what is tested.
 */
@IntegrationTest
class TenancyReadAccessIntegrationTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private TenancyController controller;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID tenant;
    private UUID stay;
    private UUID otherTenant;

    @BeforeEach
    void seed() {
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerAccount(property);
        UUID room = fx.room(property, 2, 2);
        tenant = fx.appUser();
        otherTenant = fx.appUser();
        stay = fx.stay(property, room, tenant, "ACTIVE", null);
        fx.stay(property, room, otherTenant, "ACTIVE", null);
    }

    @AfterEach
    void remove() {
        fx.remove();
    }

    private static UserPrincipal as(UUID userId) {
        return new UserPrincipal(userId, "+919800000000", "USER", null);
    }

    private UUID managerWith(String resource) {
        UUID manager = fx.manager(property, "Manager " + resource);
        fx.grant(property, manager, resource);
        return manager;
    }

    @Test
    void aStrangerCannotReadAStayOrTheList() {
        UserPrincipal stranger = as(fx.appUser());

        assertThatThrownBy(() -> controller.getTenancyById(stranger, stay)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> controller.listTenancyByProperty(stranger, property, false))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void aTenantReadsTheirOwnStayButNotAFlatmatesOrTheList() {
        assertThat(controller.getTenancyById(as(tenant), stay).id()).isEqualTo(stay);

        assertThatThrownBy(() -> controller.getTenancyById(as(otherTenant), stay))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> controller.listTenancyByProperty(as(tenant), property, false))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void theOwnerReadsBoth() {
        assertThat(controller.getTenancyById(as(owner), stay).id()).isEqualTo(stay);
        assertThat(controller.listTenancyByProperty(as(owner), property, false)).hasSize(2);
    }

    @Test
    void aManagerOfAnotherSectionThatShowsStaysKeepsTheList() {
        for (String resource : new String[] {"ROOMS", "BILLING_CYCLES", "VACANCY_FINDER", "TENANCY_RULES"}) {
            assertThat(controller.listTenancyByProperty(as(managerWith(resource)), property, false))
                    .as(resource).hasSize(2);
        }
    }

    @Test
    void aManagerWithNoReasonToSeeStaysIsRefused() {
        UserPrincipal food = as(managerWith("FOOD"));

        assertThatThrownBy(() -> controller.listTenancyByProperty(food, property, false))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> controller.getTenancyById(food, stay)).isInstanceOf(ForbiddenException.class);
    }

    @Test
    void oneStayNeedsTheStaysPermissionNotJustAnyGrant() {
        assertThatThrownBy(() -> controller.getTenancyById(as(managerWith("ROOMS")), stay))
                .isInstanceOf(ForbiddenException.class);
        assertThat(controller.getTenancyById(as(managerWith("TENANCIES")), stay).id()).isEqualTo(stay);
    }
}
