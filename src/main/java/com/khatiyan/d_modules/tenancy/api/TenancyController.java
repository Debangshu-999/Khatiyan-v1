package com.khatiyan.d_modules.tenancy.api;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
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
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.tenancy.api.dto.CreateExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.CreateRoomChangeRequest;
import com.khatiyan.d_modules.tenancy.api.dto.CreateDailyStayRequest;
import com.khatiyan.d_modules.tenancy.api.dto.EndTenancyRequest;
import com.khatiyan.d_modules.tenancy.api.dto.CreatePrematureExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.ApproveTenancyExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.ExitCheckoutWindowResponse;
import com.khatiyan.d_modules.tenancy.api.dto.RejectTenancyExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.DecideTenancyExitWithdrawalRequest;
import com.khatiyan.d_modules.tenancy.api.dto.WithdrawTenancyExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.ReviewRoomChangeRequest;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyOnboardingResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyExitRequestResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyRoomChangeRequestResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenantActiveTenancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenantLookupResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TransferTenancyRoomRequest;
import com.khatiyan.d_modules.tenancy.api.dto.UpdateTenancyRequest;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.service.TenancyService;
import com.khatiyan.d_modules.tenancy.service.TenancyExitRequestService;
import com.khatiyan.d_modules.tenancy.service.TenancyRoomChangeRequestService;

import jakarta.validation.Valid;

@SuppressWarnings("null")
@RestController
@RequestMapping("/api/v1/tenancies")
public class TenancyController {

    private final TenancyService tenancyService;
    private final TenancyExitRequestService tenancyExitRequestService;
    private final TenancyRoomChangeRequestService tenancyRoomChangeRequestService;

    public TenancyController(
            TenancyService tenancyService,
            TenancyExitRequestService tenancyExitRequestService,
            TenancyRoomChangeRequestService tenancyRoomChangeRequestService) {
        this.tenancyService = tenancyService;
        this.tenancyExitRequestService = tenancyExitRequestService;
        this.tenancyRoomChangeRequestService = tenancyRoomChangeRequestService;
    }

    /**
     * @param propertyId the property being onboarded into, so the lookup can say
     *                   at step one that this person manages it — the creation
     *                   guard would otherwise only surface that at the very end,
     *                   after the whole wizard has been filled in. Optional so
     *                   the endpoint still answers before a property is chosen.
     */
    @GetMapping("/tenant-lookup")
    public TenantLookupResponse lookupTenant(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam String phone,
            @RequestParam(required = false) UUID propertyId) {
        return tenancyService.lookupTenant(phone, propertyId);
    }

    /**
     * Books a daily stay. Creates no account — see
     * {@code TenancyService.onboardDailyGuest}.
     *
     * <p>Monthly tenancies are not reachable here. They are agreement-backed and
     * go through the compliance module's onboarding endpoint.
     */
    @PostMapping
    public ResponseEntity<TenancyOnboardingResponse> createDailyStay(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreateDailyStayRequest req) {
        TenancyOnboardingResponse body = tenancyService.onboardDailyGuest(
                user.userId(), req.propertyId(), req.roomId(),
                req.startDate(), req.plannedEndDate(), req.toGuestDetails(), req.idCheck());

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/tenancies/" + body.tenancy().id()))
                .body(body);
    }


    @GetMapping("/me/active")
    public TenantActiveTenancyResponse getMyActiveTenancy(@AuthenticationPrincipal UserPrincipal user) {
        return tenancyService.getTenantActiveTenancyProfile(user.userId());
    }

    @GetMapping("/me/property-rooms")
    public List<RoomResponse> listMyActivePropertyRooms(@AuthenticationPrincipal UserPrincipal user) {
        return tenancyService.listActivePropertyRoomsForTenant(user.userId());
    }

    @PostMapping("/me/room-change-requests")
    public ResponseEntity<TenancyRoomChangeRequestResponse> requestRoomChange(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreateRoomChangeRequest req) {
        TenancyRoomChangeRequestResponse response = tenancyRoomChangeRequestService.requestRoomChange(
                user.userId(),
                req.targetRoomId(),
                req.reason());

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/tenancies/room-change-requests/" + response.id()))
                .body(response);
    }

    @GetMapping("/me/room-change-requests")
    public List<TenancyRoomChangeRequestResponse> listMyRoomChangeRequests(
            @AuthenticationPrincipal UserPrincipal user) {
        return tenancyRoomChangeRequestService.listMine(user.userId());
    }

    @GetMapping("/me")
    public List<TenancyResponse> listMyTenancies(@AuthenticationPrincipal UserPrincipal user) {
        return tenancyService.findByUserId(user.userId())
            .stream()
            .map(tenancyService::toResponse)
            .toList();
    }

    @GetMapping("/{id}")
    public TenancyResponse getTenancyById(@PathVariable UUID id) {
        return tenancyService.findById(id)
            .map(tenancyService::toResponse)
            .orElseThrow(() -> new NotFoundException("Tenancy", id));
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
            .map(tenancyService::toResponse)
            .toList();
    }

    @GetMapping("/properties/{propertyId}/active")
    public PageResponse<TenancyResponse> listActivePropertyTenancies(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return tenancyService.listActiveForManagedProperty(user.userId(), propertyId, query, page, size);
    }

    @GetMapping("/properties/{propertyId}/past")
    public PageResponse<TenancyResponse> listPastPropertyTenancies(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return tenancyService.listPastForManagedProperty(user.userId(), propertyId, query, page, size);
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

        return tenancyService.toResponse(tenancy);
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
                .body(tenancyService.toResponse(tenancy));
    }

    /**
     * Ends a stay, applying everything the end-tenancy screen decided in one
     * transaction. This is the only way a tenancy ends.
     */
    @PostMapping("/{id}/end")
    public ResponseEntity<Void> endTenancy(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID id,
            @Valid @RequestBody EndTenancyRequest request) {
        tenancyExitRequestService.endTenancyNow(user.userId(), id, request);
        return ResponseEntity.noContent().build();
    }

    /**
     * The dates this tenant may choose to leave on. Clients call this before
     * showing the exit form: a whole-month notice yields one fixed date, a
     * sub-month notice a range to pick from.
     */
    @GetMapping("/me/exit-requests/checkout-window")
    public ExitCheckoutWindowResponse getExitCheckoutWindow(@AuthenticationPrincipal UserPrincipal user) {
        return tenancyExitRequestService.getExitCheckoutWindow(user.userId());
    }

    /**
     * The single exit route. Replaces the old normal/premature split, which made
     * the tenant pick a flow based on state they could not see.
     */
    @PostMapping("/me/exit-requests")
    public ResponseEntity<TenancyExitRequestResponse> requestExit(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreateExitRequest req) {
        TenancyExitRequestResponse response = tenancyExitRequestService.requestExit(
                user.userId(),
                req.chosenCheckoutDate(),
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

    @GetMapping("/properties/{propertyId}/room-change-requests")
    public List<TenancyRoomChangeRequestResponse> listPropertyRoomChangeRequests(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return tenancyRoomChangeRequestService.listForProperty(user.userId(), propertyId);
    }

    @GetMapping("/{id}/room-change-requests")
    public List<TenancyRoomChangeRequestResponse> listTenancyRoomChangeRequests(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID id) {
        return tenancyRoomChangeRequestService.listForTenancy(user.userId(), id);
    }

    @PostMapping("/room-change-requests/{requestId}/approve")
    public TenancyRoomChangeRequestResponse approveRoomChangeRequest(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody ReviewRoomChangeRequest req) {
        return tenancyRoomChangeRequestService.approve(user.userId(), requestId, req.adminNotes());
    }

    @PostMapping("/room-change-requests/{requestId}/reject")
    public TenancyRoomChangeRequestResponse rejectRoomChangeRequest(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody ReviewRoomChangeRequest req) {
        return tenancyRoomChangeRequestService.reject(user.userId(), requestId, req.adminNotes());
    }

    @PostMapping("/room-change-requests/{requestId}/cancel")
    public TenancyRoomChangeRequestResponse cancelRoomChangeRequest(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId) {
        return tenancyRoomChangeRequestService.cancel(user.userId(), requestId);
    }

    @PostMapping("/room-change-requests/{requestId}/execute")
    public TenancyRoomChangeRequestResponse executeRoomChangeRequest(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId) {
        return tenancyRoomChangeRequestService.execute(user.userId(), requestId);
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

    /**
     * Tenant asks to undo an approved exit. Distinct from {@code /cancel}, which
     * is unilateral and only works before a decision has been made.
     */
    @PostMapping("/me/exit-requests/{requestId}/withdraw")
    public TenancyExitRequestResponse withdrawApprovedExitRequest(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody WithdrawTenancyExitRequest req) {
        return tenancyExitRequestService.requestWithdrawal(user.userId(), requestId, req.reason());
    }

    /** Owner/manager decides on a pending withdrawal. */
    @PostMapping("/exit-requests/{requestId}/withdrawal-decision")
    public TenancyExitRequestResponse decideExitWithdrawal(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID requestId,
            @Valid @RequestBody DecideTenancyExitWithdrawalRequest req) {
        return tenancyExitRequestService.decideWithdrawal(
                user.userId(), requestId, req.approved(), req.adminNotes());
    }

}
