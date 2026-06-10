package com.khatiyan.d_modules.billing.api;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.AdjustBillingLineItemRequest;
import com.khatiyan.d_modules.billing.api.dto.BillingDashboardSummary;
import com.khatiyan.d_modules.billing.api.dto.BillingMonthSummary;
import com.khatiyan.d_modules.billing.api.dto.BillingPastSummary;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleLineItemResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.CreateDiscountRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateExtraChargeRequest;
import com.khatiyan.d_modules.billing.api.dto.ManualPaymentResponse;
import com.khatiyan.d_modules.billing.api.dto.RecordManualPaymentRequest;
import com.khatiyan.d_modules.billing.api.dto.RecordPaymentSuccessRequest;

import jakarta.validation.Valid;

/**
 * REST API boundary for live billing cycles and editable cycle line items.
 *
 * <p>
 * Billing cycles are the mutable payable workspace before payment succeeds.
 */
@SuppressWarnings("null")
@RestController
@RequestMapping("/api/v1/billing")
public class BillCycleController {

    private final BillingModule billingModule;

    public BillCycleController(BillingModule billingModule) {
        this.billingModule = billingModule;
    }

    // Tenant self-view endpoints

    @GetMapping("/me/cycles")
    public List<BillingCycleResponse> listMyCycles(@AuthenticationPrincipal UserPrincipal user) {
        return billingModule.listMyCycles(user.userId());
    }

    @GetMapping("/me/tenancies/{tenancyId}/cycles")
    public List<BillingCycleResponse> listMyTenancyCycles(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return billingModule.listMyTenancyCycles(user.userId(), tenancyId);
    }

    @GetMapping("/me/tenancies/{tenancyId}/line-items")
    public List<BillingCycleLineItemResponse> listMyTenancyLineItems(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return billingModule.listMyTenancyLineItems(user.userId(), tenancyId);
    }

    // Owner/manager live billing-cycle endpoints

    @GetMapping("/properties/{propertyId}/summary")
    public BillingDashboardSummary getPropertyBillingSummary(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return billingModule.getPropertyBillingSummary(user.userId(), propertyId);
    }

    @GetMapping("/properties/{propertyId}/month-summary")
    public BillingMonthSummary getPropertyMonthSummary(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String month) {
        return billingModule.getPropertyMonthSummary(user.userId(), propertyId, month);
    }

    @GetMapping("/properties/{propertyId}/past-summary")
    public BillingPastSummary getPropertyPastSummary(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String month) {
        return billingModule.getPropertyPastSummary(user.userId(), propertyId, month);
    }

    @GetMapping("/properties/{propertyId}/cycles")
    public List<BillingCycleResponse> listPropertyCycles(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String month) {
        return billingModule.listPropertyCycles(user.userId(), propertyId, query, month);
    }

    @GetMapping("/properties/{propertyId}/past-cycles")
    public List<BillingCycleResponse> listPastPropertyCycles(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String month) {
        return billingModule.listPastPropertyCycles(user.userId(), propertyId, query, month);
    }

    @GetMapping(value = "/properties/{propertyId}/cycles/export", produces = "text/csv")
    public ResponseEntity<String> exportPropertyCycles(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String month) {
        String csv = billingModule.exportPropertyCyclesCsv(user.userId(), propertyId, month);
        String filename = "billing-cycles-" + (month == null || month.isBlank() ? "current" : month.trim()) + ".csv";

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(csv);
    }

    @PostMapping("/tenancies/{tenancyId}/cycles/first")
    public ResponseEntity<BillingCycleResponse> createFirstCycle(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        BillingCycleResponse response = billingModule.createFirstCycle(user.userId(), tenancyId);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/billing/cycles/" + response.id()))
                .body(response);
    }

    @GetMapping("/tenancies/{tenancyId}/cycles")
    public List<BillingCycleResponse> listManagedTenancyCycles(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return billingModule.listManagedTenancyCycles(user.userId(), tenancyId);
    }

    @GetMapping("/tenancies/{tenancyId}/line-items")
    public List<BillingCycleLineItemResponse> listManagedTenancyLineItems(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return billingModule.listManagedTenancyLineItems(user.userId(), tenancyId);
    }

    @PostMapping("/cycles/{billingCycleId}/refresh")
    public BillingCycleResponse refreshManagedCycle(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId) {
        return billingModule.refreshManagedCycle(user.userId(), billingCycleId);
    }

    @PostMapping("/me/cycles/{billingCycleId}/refresh")
    public BillingCycleResponse refreshMyCycle(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId) {
        return billingModule.refreshMyCycle(user.userId(), billingCycleId);
    }

    @PostMapping("/tenancies/{tenancyId}/extra-charges")
    public BillingCycleResponse addTenancyExtraCharges(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody List<@Valid CreateExtraChargeRequest> requests) {
        return billingModule.addExtraChargeForTenancy(user.userId(), tenancyId, requests);
    }

    @PostMapping("/tenancies/{tenancyId}/discounts")
    public BillingCycleResponse addTenancyDiscount(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody CreateDiscountRequest request) {
        return billingModule.addDiscountForTenancy(user.userId(), tenancyId, request);
    }

    @PostMapping("/cycles/{billingCycleId}/extra-charges")
    public BillingCycleResponse addExtraCharges(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @Valid @RequestBody List<@Valid CreateExtraChargeRequest> requests) {
        return billingModule.addExtraCharge(user.userId(), billingCycleId, requests);
    }

    @PostMapping("/cycles/{billingCycleId}/discounts")
    public BillingCycleResponse addDiscount(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @Valid @RequestBody CreateDiscountRequest request) {
        return billingModule.addDiscount(user.userId(), billingCycleId, request);
    }

    @PatchMapping("/cycles/{billingCycleId}/line-items/{lineItemId}")
    public BillingCycleResponse adjustLineItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @PathVariable UUID lineItemId,
            @Valid @RequestBody AdjustBillingLineItemRequest request) {
        return billingModule.adjustLineItem(user.userId(), billingCycleId, lineItemId, request);
    }

    @PatchMapping("/cycles/{billingCycleId}/line-items/{lineItemId}/clear")
    public BillingCycleResponse clearLineItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @PathVariable UUID lineItemId) {
        return billingModule.clearLineItem(user.userId(), billingCycleId, lineItemId);
    }

    @PatchMapping("/cycles/{billingCycleId}/line-items/{lineItemId}/adjust-from-deposit")
    public BillingCycleResponse adjustLineItemFromDeposit(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @PathVariable UUID lineItemId,
            @Valid @RequestBody AdjustBillingLineItemRequest request) {
        return billingModule.adjustLineItemFromDeposit(user.userId(), billingCycleId, lineItemId, request);
    }

    @PatchMapping("/cycles/{billingCycleId}/line-items/{lineItemId}/adjust-to-bill")
    public BillingCycleResponse adjustLineItemToBill(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @PathVariable UUID lineItemId,
            @Valid @RequestBody AdjustBillingLineItemRequest request) {
        return billingModule.adjustLineItemToBill(user.userId(), billingCycleId, lineItemId, request);
    }

    @PatchMapping("/tenancies/{tenancyId}/line-items/{lineItemId}")
    public BillingCycleLineItemResponse adjustPendingLineItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @PathVariable UUID lineItemId,
            @Valid @RequestBody AdjustBillingLineItemRequest request) {
        return billingModule.adjustPendingLineItem(user.userId(), tenancyId, lineItemId, request);
    }

    @PatchMapping("/tenancies/{tenancyId}/line-items/{lineItemId}/clear")
    public BillingCycleLineItemResponse clearPendingLineItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @PathVariable UUID lineItemId) {
        return billingModule.clearPendingLineItem(user.userId(), tenancyId, lineItemId);
    }

    @PatchMapping("/tenancies/{tenancyId}/line-items/{lineItemId}/adjust-from-deposit")
    public BillingCycleLineItemResponse adjustPendingLineItemFromDeposit(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @PathVariable UUID lineItemId,
            @Valid @RequestBody AdjustBillingLineItemRequest request) {
        return billingModule.adjustPendingLineItemFromDeposit(user.userId(), tenancyId, lineItemId, request);
    }

    @PatchMapping("/tenancies/{tenancyId}/line-items/{lineItemId}/adjust-to-bill")
    public BillingCycleLineItemResponse adjustPendingLineItemToBill(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @PathVariable UUID lineItemId,
            @Valid @RequestBody AdjustBillingLineItemRequest request) {
        return billingModule.adjustPendingLineItemToBill(user.userId(), tenancyId, lineItemId, request);
    }

    @PostMapping("/cycles/{billingCycleId}/payment-success")
    public BillingCycleResponse recordPaymentSuccess(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @Valid @RequestBody RecordPaymentSuccessRequest request) {
        return billingModule.recordPaymentSuccess(user.userId(), billingCycleId, request.paidAmountPaise());
    }

    @PostMapping("/me/cycles/{billingCycleId}/payment-success")
    public BillingCycleResponse recordMyPaymentSuccess(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @Valid @RequestBody RecordPaymentSuccessRequest request) {
        return billingModule.recordMyPaymentSuccess(user.userId(), billingCycleId, request.paidAmountPaise());
    }

    // Owner/manager manual (offline) payment collection

    @PostMapping("/cycles/{billingCycleId}/manual-payment")
    public ResponseEntity<ManualPaymentResponse> recordManualPayment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @Valid @RequestBody RecordManualPaymentRequest request) {
        ManualPaymentResponse response = billingModule.recordManualPayment(user.userId(), billingCycleId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/cycles/{billingCycleId}/manual-payments")
    public List<ManualPaymentResponse> listManualPayments(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId) {
        return billingModule.listManualPayments(user.userId(), billingCycleId);
    }
}
