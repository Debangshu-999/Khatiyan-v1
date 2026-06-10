package com.khatiyan.d_modules.notice.api;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.notice.api.dto.PropertyBoardItemResponse;
import com.khatiyan.d_modules.notice.service.PropertyBoardService;

/**
 * Tenant-facing API boundary for stable property board content.
 */
@RestController
@RequestMapping("/api/v1/property-board/me")
@SuppressWarnings("null")
public class TenantPropertyBoardController {

    private final PropertyBoardService propertyBoardService;

    public TenantPropertyBoardController(PropertyBoardService propertyBoardService) {
        this.propertyBoardService = propertyBoardService;
    }

    @GetMapping("/items")
    public List<PropertyBoardItemResponse> listMyPropertyBoardItems(
            @AuthenticationPrincipal UserPrincipal user) {
        return propertyBoardService.listActiveItemsForTenant(user.userId());
    }
}
