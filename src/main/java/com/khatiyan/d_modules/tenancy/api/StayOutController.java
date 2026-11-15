package com.khatiyan.d_modules.tenancy.api;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.tenancy.api.dto.SaveStayOutRequest;
import com.khatiyan.d_modules.tenancy.api.dto.StayOutBoardResponse;
import com.khatiyan.d_modules.tenancy.api.dto.StayOutListResponse;
import com.khatiyan.d_modules.tenancy.api.dto.StayOutResponse;
import com.khatiyan.d_modules.tenancy.service.StayOutService;

import jakarta.validation.Valid;

/**
 * Stay outs (user, 2026-11-08): the tenant's own, on their current stay, and
 * management's board for a property.
 */
@RestController
public class StayOutController {

    private final StayOutService service;

    public StayOutController(StayOutService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/tenancies/me/stay-outs")
    public StayOutListResponse mine(@AuthenticationPrincipal UserPrincipal user) {
        return service.mine(user.userId());
    }

    @PostMapping("/api/v1/tenancies/me/stay-outs")
    public StayOutResponse declare(
            @AuthenticationPrincipal UserPrincipal user, @Valid @RequestBody SaveStayOutRequest request) {
        return service.declare(user.userId(), request);
    }

    @PutMapping("/api/v1/tenancies/me/stay-outs/{stayOutId}")
    public StayOutResponse change(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID stayOutId,
            @Valid @RequestBody SaveStayOutRequest request) {
        return service.change(user.userId(), stayOutId, request);
    }

    @PostMapping("/api/v1/tenancies/me/stay-outs/{stayOutId}/cancel")
    public ResponseEntity<Void> cancel(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID stayOutId) {
        service.cancel(user.userId(), stayOutId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/v1/properties/{propertyId}/stay-outs")
    public StayOutBoardResponse board(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID propertyId) {
        return service.board(user.userId(), propertyId);
    }
}
