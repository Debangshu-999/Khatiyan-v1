package com.khatiyan.c_shared.concurrency;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.lead.api.LeadVisitController;
import com.khatiyan.d_modules.tenancy.api.TenancyController;

/** Updates that must arrive with the version their screen loaded (2026-11-01). */
class RequiredVersionEndpointsTest {

    @Test
    void theVisitFormAndTheTenancyUpdateRefuseARequestWithNoVersion() {
        assertThat(requiresVersion(LeadVisitController.class, "completeForm")).isTrue();
        assertThat(requiresVersion(TenancyController.class, "updateTenancy")).isTrue();
    }

    private static boolean requiresVersion(Class<?> controller, String name) {
        return Arrays.stream(controller.getMethods())
                .filter(method -> method.getName().equals(name))
                .allMatch(method -> method.isAnnotationPresent(RequiresVersion.class));
    }
}
