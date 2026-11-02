package com.khatiyan.d_modules.property.api;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.property.api.dto.RoomItemConditionResponse;
import com.khatiyan.d_modules.property.model.ManagerResource;
import com.khatiyan.d_modules.property.service.ManagerAccessPolicy;
import com.khatiyan.d_modules.property.service.RoomConditionService;
import com.khatiyan.d_modules.property.service.RoomService;

import lombok.RequiredArgsConstructor;

/**
 * Each item's running condition in one room (2026-10-29): what onboarding
 * starts from, and the level a damage record shows as the item's now. Read
 * under the same resources as the item catalogue.
 */
@RestController
@RequestMapping("/api/v1/properties")
@RequiredArgsConstructor
public class RoomConditionController {

    private final ManagerAccessPolicy managerAccessPolicy;
    private final RoomService roomService;
    private final RoomConditionService roomConditionService;

    @GetMapping("/{propertyId}/rooms/{roomId}/item-conditions")
    public List<RoomItemConditionResponse> getRoomItemConditions(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID roomId) {
        managerAccessPolicy.ensureCanViewAny(
                user.userId(),
                propertyId,
                ManagerResource.TENANCY_RULES,
                ManagerResource.TENANCIES,
                ManagerResource.DEPOSITS);
        roomService.findRoomForDisplay(propertyId, roomId)
                .orElseThrow(() -> new NotFoundException("Room", roomId));
        return roomConditionService.list(roomId);
    }
}
