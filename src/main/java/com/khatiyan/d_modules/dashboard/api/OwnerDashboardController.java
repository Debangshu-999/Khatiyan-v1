package com.khatiyan.d_modules.dashboard.api;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.dashboard.api.dto.ActionCenterResponse;
import com.khatiyan.d_modules.dashboard.service.OwnerDashboardService;

/**
 * REST boundary for the owner action center.
 *
 * <p>The dashboard is per-property: the caller picks a property (from the
 * existing properties list) and this returns the composite snapshot. Access is
 * enforced in the service via {@code ensureCanManageProperty}, so both owners
 * and active managers of the property can read it.
 */
@RestController
@RequestMapping("/api/v1/dashboard/owner")
@SuppressWarnings("null")
public class OwnerDashboardController {

    private final OwnerDashboardService ownerDashboardService;

    public OwnerDashboardController(OwnerDashboardService ownerDashboardService) {
        this.ownerDashboardService = ownerDashboardService;
    }

    @GetMapping("/{propertyId}")
    public ActionCenterResponse getPropertyActionCenter(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return ownerDashboardService.getPropertyActionCenter(user.userId(), propertyId);
    }
}
