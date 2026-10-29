package com.khatiyan.d_modules.tenancy.api;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistResponse;
import com.khatiyan.d_modules.tenancy.api.dto.RespondMoveInChecklistRequest;
import com.khatiyan.d_modules.tenancy.service.MoveInChecklistService;

import jakarta.validation.Valid;

/** A stay's move-in checklist: read by its tenant and management, answered by the tenant. */
@RestController
@RequestMapping("/api/v1/tenancies/{tenancyId}/move-in-checklist")
public class MoveInChecklistController {

    private final MoveInChecklistService service;

    public MoveInChecklistController(MoveInChecklistService service) {
        this.service = service;
    }

    /** 204 when the stay has none: a screen shows the checklist only when there is one. */
    @GetMapping
    public org.springframework.http.ResponseEntity<MoveInChecklistResponse> get(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable UUID tenancyId) {
        return service.find(user.userId(), tenancyId)
                .map(org.springframework.http.ResponseEntity::ok)
                .orElseGet(() -> org.springframework.http.ResponseEntity.noContent().build());
    }

    @PostMapping("/response")
    public MoveInChecklistResponse respond(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody RespondMoveInChecklistRequest request) {
        return service.respond(user.userId(), tenancyId, request.looksRight(), request.note());
    }
}
