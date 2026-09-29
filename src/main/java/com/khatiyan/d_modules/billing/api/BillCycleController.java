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

import com.khatiyan.c_shared.concurrency.RequiresVersion;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.http.ClientIpResolver;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.AdjustBillingLineItemRequest;
import com.khatiyan.d_modules.billing.api.dto.BillingDashboardSummary;
import com.khatiyan.d_modules.billing.api.dto.BillingMonthSummary;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleLineItemResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.CreateDiscountRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateExtraChargeRequest;
import com.khatiyan.d_modules.billing.api.dto.CancelOneOffBillRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateOneOffBillRequest;
import com.khatiyan.d_modules.billing.api.dto.CashPaymentCodeResponse;
import com.khatiyan.d_modules.billing.api.dto.ManualPaymentResponse;
import com.khatiyan.d_modules.billing.api.dto.RecordManualPaymentRequest;
import com.khatiyan.d_modules.billing.api.dto.RecordPaymentSuccessRequest;
import com.khatiyan.d_modules.billing.api.dto.UpcomingBillingCycleResponse;

import jakarta.servlet.http.HttpServletRequest;
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
    private final ClientIpResolver clientIpResolver;

    public BillCycleController(BillingModule billingModule, ClientIpResolver clientIpResolver) {
        this.billingModule = billingModule;
        this.clientIpResolver = clientIpResolver;
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

    @GetMapping("/properties/{propertyId}/cycles")
    public List<BillingCycleResponse> listPropertyCycles(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String month) {
        return billingModule.listPropertyCycles(user.userId(), propertyId, query, month);
    }

    @GetMapping("/properties/{propertyId}/upcoming-cycles")
    public PageResponse<UpcomingBillingCycleResponse> listUpcomingPropertyCycles(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String month,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return billingModule.listUpcomingPropertyCycles(user.userId(), propertyId, month, page, size);
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

    /**
     * Raises a standalone bill against a tenancy, due today — the way to charge
     * something that a frozen live cycle can no longer absorb.
     */
    @PostMapping("/tenancies/{tenancyId}/one-off-bills")
    public ResponseEntity<BillingCycleResponse> createOneOffBill(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody CreateOneOffBillRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(billingModule.createOneOffBill(user.userId(), tenancyId, request));
    }

    /**
     * Cancels a one-off bill raised by mistake. One-off only, and only while it
     * is unpaid or overdue; the reason is kept on the bill and sent to the tenant.
     */
    @PostMapping("/cycles/{billingCycleId}/cancel")
    @RequiresVersion
    public BillingCycleResponse cancelOneOffBill(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @Valid @RequestBody CancelOneOffBillRequest request) {
        return billingModule.cancelOneOffBill(user.userId(), billingCycleId, request);
    }

    /**
     * Waives the late fee on a bill. Only while it is overdue: not while a
     * payment claim awaits confirmation, and not in any other state.
     */
    @PostMapping("/cycles/{billingCycleId}/late-fee/remove")
    @RequiresVersion
    public BillingCycleResponse removeLateFee(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId) {
        return billingModule.removeLateFee(user.userId(), billingCycleId);
    }

    @PostMapping("/tenancies/{tenancyId}/discounts")
    public BillingCycleResponse addTenancyDiscount(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody CreateDiscountRequest request) {
        return billingModule.addDiscountForTenancy(user.userId(), tenancyId, request);
    }

    @PostMapping("/cycles/{billingCycleId}/extra-charges")
    @RequiresVersion
    public BillingCycleResponse addExtraCharges(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @Valid @RequestBody List<@Valid CreateExtraChargeRequest> requests) {
        return billingModule.addExtraCharge(user.userId(), billingCycleId, requests);
    }

    @PostMapping("/cycles/{billingCycleId}/discounts")
    @RequiresVersion
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
    @RequiresVersion
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
    @RequiresVersion
    public ResponseEntity<ManualPaymentResponse> recordManualPayment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @Valid @RequestBody RecordManualPaymentRequest request) {
        ManualPaymentResponse response = billingModule.recordManualPayment(user.userId(), billingCycleId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Sends the bill's tenant a code confirming a cash payment.
     *
     * <p>No body: the number comes from the bill, never from the request, and
     * the amount is the bill's own total. The code is then entered with the
     * payment above.
     */
    @PostMapping("/cycles/{billingCycleId}/manual-payment/cash-code")
    @RequiresVersion
    public CashPaymentCodeResponse sendCashPaymentCode(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            HttpServletRequest servletRequest) {
        return billingModule.sendCashPaymentCode(
                user.userId(), billingCycleId, clientIpResolver.resolve(servletRequest));
    }

    /**
     * The bill receipt as a PDF file.
     *
     * <p>An ordinary attachment download, like the CSV export above it — which
     * is the point of generating it here rather than in the app, where the
     * browser could only ever open a print dialog.
     */
    @GetMapping(value = "/cycles/{billingCycleId}/receipt.pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> downloadReceipt(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId) {
        byte[] pdf = billingModule.renderReceiptPdf(user.userId(), billingCycleId);

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"receipt-" + billingCycleId + ".pdf\"")
                .body(pdf);
    }

    @GetMapping("/cycles/{billingCycleId}/manual-payments")
    public List<ManualPaymentResponse> listManualPayments(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId) {
        return billingModule.listManualPayments(user.userId(), billingCycleId);
    }
}
