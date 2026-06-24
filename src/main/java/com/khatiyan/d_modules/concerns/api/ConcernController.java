package com.khatiyan.d_modules.concerns.api;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.concerns.ConcernModule;
import com.khatiyan.d_modules.concerns.api.dto.AssignConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernResponse;
import com.khatiyan.d_modules.concerns.api.dto.CreateConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ReopenConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ResolveConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.UpdateConcernStatusRequest;

import jakarta.validation.Valid;

/**
 * REST API boundary for tenant concerns and owner/manager concern workflows.
 *
 * <p>Role-level access is handled by {@code SecurityConfig}. This controller
 * stays thin and passes the authenticated user id into the concerns module,
 * where tenant ownership and property-management checks are enforced.
 */
@RestController
@RequestMapping("/api/v1")
@SuppressWarnings("null")
public class ConcernController {

    private final ConcernModule concernModule;

    public ConcernController(ConcernModule concernModule) {
        this.concernModule = concernModule;
    }

    @PostMapping("/concerns")
    public ResponseEntity<ConcernResponse> raiseConcern(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreateConcernRequest request) {
        ConcernResponse response = concernModule.raiseConcern(user.userId(), request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/concerns/" + response.id()))
                .body(response);
    }

    @GetMapping("/concerns/me/current")
    public List<ConcernResponse> listMyCurrentConcerns(@AuthenticationPrincipal UserPrincipal user) {
        return concernModule.listTenantCurrentConcerns(user.userId());
    }

    @GetMapping("/concerns/me/history")
    public PageResponse<ConcernResponse> listMyConcernHistory(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return concernModule.listTenantConcernHistory(user.userId(), page, size);
    }

    @PostMapping("/concerns/{concernId}/reopen")
    public ConcernResponse reopenConcern(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID concernId,
            @Valid @RequestBody ReopenConcernRequest request) {
        return concernModule.reopenConcern(user.userId(), concernId, request);
    }

    @GetMapping("/properties/{propertyId}/concerns/available")
    public List<ConcernResponse> listAvailableConcerns(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return concernModule.listAvailableConcerns(user.userId(), propertyId);
    }

    @GetMapping("/properties/{propertyId}/concerns/history")
    public PageResponse<ConcernResponse> listPropertyConcernHistory(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return concernModule.listPropertyConcernHistory(user.userId(), propertyId, page, size);
    }

    @GetMapping("/properties/{propertyId}/concerns/escalated")
    public List<ConcernResponse> listEscalatedConcerns(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return concernModule.listEscalatedConcerns(user.userId(), propertyId);
    }

    @GetMapping("/properties/{propertyId}/concerns/monitor")
    public List<ConcernResponse> listOwnerMonitorConcerns(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return concernModule.listOwnerMonitorConcerns(user.userId(), propertyId);
    }

    @GetMapping("/concerns/undertaken")
    public List<ConcernResponse> listUndertakenConcerns(@AuthenticationPrincipal UserPrincipal user) {
        return concernModule.listUndertakenConcerns(user.userId());
    }

    @PatchMapping("/concerns/{concernId}/assign")
    public ConcernResponse assignConcern(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID concernId,
            @Valid @RequestBody AssignConcernRequest request) {
        return concernModule.assignConcern(user.userId(), concernId, request);
    }

    @PatchMapping("/concerns/{concernId}/status")
    public ConcernResponse updateConcernStatus(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID concernId,
            @Valid @RequestBody UpdateConcernStatusRequest request) {
        return concernModule.updateConcernStatus(user.userId(), concernId, request);
    }

    @PatchMapping("/concerns/{concernId}/resolve")
    public ConcernResponse resolveConcern(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID concernId,
            @Valid @RequestBody ResolveConcernRequest request) {
        return concernModule.resolveConcern(user.userId(), concernId, request);
    }
}
