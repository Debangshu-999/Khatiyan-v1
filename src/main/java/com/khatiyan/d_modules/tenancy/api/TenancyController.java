package com.khatiyan.d_modules.tenancy.api;

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

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.tenancy.api.dto.CreateTenancyRequest;
import com.khatiyan.d_modules.tenancy.api.dto.CreateNormalExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.CreatePrematureExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.EndTenancyRequest;
import com.khatiyan.d_modules.tenancy.api.dto.ApproveTenancyExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.RejectTenancyExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyExitRequestResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenantActiveTenancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TransferTenancyRoomRequest;
import com.khatiyan.d_modules.tenancy.api.dto.UpdateTenancyRequest;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.service.TenancyService;
import com.khatiyan.d_modules.tenancy.service.TenancyExitRequestService;

import jakarta.validation.Valid;

@SuppressWarnings("null")
@RestController
@RequestMapping("/api/v1/tenancies")
public class TenancyController {

    private final TenancyService tenancyService;
    private final TenancyExitRequestService tenancyExitRequestService;

    public TenancyController(TenancyService tenancyService, TenancyExitRequestService tenancyExitRequestService) {
        this.tenancyService = tenancyService;
        this.tenancyExitRequestService = tenancyExitRequestService;
    }

    @PostMapping
    public ResponseEntity<TenancyResponse> createTenancy(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreateTenancyRequest req) {
        Tenancy tenancy = tenancyService.create(
                user.userId(), req.tenantPhone(), req.propertyId(), req.roomId(),
                req.resolvedBillingType(), req.depositAmountPaise(),
                req.startDate(), req.plannedEndDate());

        TenancyResponse body = TenancyResponse.from(tenancy);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/tenancies/" + tenancy.getId()))
                .body(body);
    }


    @GetMapping("/me/active")
    public TenantActiveTenancyResponse getMyActiveTenancy(@AuthenticationPrincipal UserPrincipal user) {
        return tenancyService.getTenantActiveTenancyProfile(user.userId());
    }

    @GetMapping("/me")
    public List<TenancyResponse> listMyTenancies(@AuthenticationPrincipal UserPrincipal user) {
        return tenancyService.findByUserId(user.userId())
            .stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    @GetMapping("/{id}")
    public TenancyResponse getTenancyById(@PathVariable UUID id) {
        return tenancyService.findById(id)
            .map(tenancy -> TenancyResponse.from(tenancy))
            .orElseThrow(() -> new NotFoundException("Tenancy_", id));
    }

    @GetMapping
    public List<TenancyResponse> listTenancyByProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam UUID propertyId,
            @RequestParam(defaultValue = "false") boolean includePast) {
        List<Tenancy> tenancies = includePast
            ? tenancyService.findByPropertyId(user.userId(), propertyId)
            : tenancyService.findActiveByPropertyId(propertyId);

        return tenancies.stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    @PatchMapping("/{id}")
    public TenancyResponse updateTenancy(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateTenancyRequest req) {
        Tenancy tenancy = tenancyService.updateSetupTerms(
                user.userId(),
                id,
                req.rentAmountPaise(),
                req.depositAmountPaise());

        return TenancyResponse.from(tenancy);
    }

    @PostMapping("/{id}/transfer-room")
    public ResponseEntity<TenancyResponse> transferRoom(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID id,
            @Valid @RequestBody TransferTenancyRoomRequest req) {
        Tenancy tenancy = tenancyService.transferRoom(
                user.userId(),
                id,
                req.newRoomId(),
                req.transferDate());

        return ResponseEntity
                .status(HttpStatus.OK)
                .location(URI.create("/api/v1/tenancies/" + tenancy.getId()))
                .body(TenancyResponse.from(tenancy));
    }

    @PostMapping("/{id}/end")
    public ResponseEntity<Void> endTenancy(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID id,
            @Valid @RequestBody EndTenancyRequest req) {
        throw new ValidationException("Tenancy exit must use the exit request workflow");
    }

    @PostMapping("/me/exit-requests/normal")
    public ResponseEntity<TenancyExitRequestResponse> requestNormalExit(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreateNormalExitRequest req) {
        TenancyExitRequestResponse response = tenancyExitRequestService.requestNormalNotice(
                user.userId(),
                req.reason());

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/tenancies/exit-requests/" + response.id()))
                .body(response);
    }

    @PostMapping("/me/exit-requests/premature")
    public ResponseEntity<TenancyExitRequestResponse> requestPrematureExit(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreatePrematureExitRequest req) {
        TenancyExitRequestResponse response = tenancyExitRequestService.requestPremature(
                user.userId(),
                req.requestedCheckoutDate(),
                req.reason());

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/tenancies/exit-requests/" + response.id()))
                .body(response);
    }

    @GetMapping("/me/exit-requests")
    public List<TenancyExitRequestResponse> listMyExitRequests(@AuthenticationPrincipal UserPrincipal user) {
        return tenancyExitRequestService.listMine(user.userId());
    }

    @GetMapping("/properties/{propertyId}/exit-requests")
    public List<TenancyExitRequestResponse> listPropertyExitRequests(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return tenancyExitRequestService.listForProperty(user.userId(), propertyId);
    }

    @GetMapping("/{id}/exit-requests")
    public List<TenancyExitRequestResponse> listTenancyExitRequests(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID id) {
        return tenancyExitRequestService.listForTenancy(user.userId(), id);
    }

    @PostMapping("/exit-requests/{requestId}/approve")
    public TenancyExitRequestResponse approveExitRequest(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody ApproveTenancyExitRequest req) {
        return tenancyExitRequestService.approve(user.userId(), requestId, req);
    }

    @PostMapping("/exit-requests/{requestId}/reject")
    public TenancyExitRequestResponse rejectExitRequest(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody RejectTenancyExitRequest req) {
        return tenancyExitRequestService.reject(user.userId(), requestId, req.adminNotes());
    }

    @PostMapping("/exit-requests/{requestId}/cancel")
    public TenancyExitRequestResponse cancelExitRequest(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId) {
        return tenancyExitRequestService.cancel(user.userId(), requestId);
    }

    @PostMapping("/exit-requests/{requestId}/execute")
    public TenancyExitRequestResponse executeExitRequest(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId) {
        return tenancyExitRequestService.execute(user.userId(), requestId);
    }

}
