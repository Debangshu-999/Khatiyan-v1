package com.khatiyan.d_modules.billing.api;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.bind.annotation.RequestParam;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.CreateDepositCorrectionRequest;
import com.khatiyan.d_modules.billing.api.dto.DepositAccountResponse;
import com.khatiyan.d_modules.billing.api.dto.SettleDepositRequest;
import com.khatiyan.d_modules.billing.model.DepositAccountStatus;

import jakarta.validation.Valid;

/**
 * REST API boundary for tenancy deposit accounts and deposit ledger changes.
 *
 * <p>
 * Deposit movements are their own ledger. Billing-cycle deposit adjustments are
 * linked back to cycle line items so both views stay consistent.
 */
@SuppressWarnings("null")
@RestController
@RequestMapping("/api/v1/billing")
public class DepositManagerController {

    private final BillingModule billingModule;

    public DepositManagerController(BillingModule billingModule) {
        this.billingModule = billingModule;
    }

    // Tenant self-view endpoints

    @GetMapping("/me/deposit")
    public DepositAccountResponse getMyDeposit(@AuthenticationPrincipal UserPrincipal user) {
        return billingModule.getMyActiveDepositAccount(user.userId());
    }

    @GetMapping("/me/tenancies/{tenancyId}/deposit")
    public DepositAccountResponse getMyTenancyDeposit(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return billingModule.getMyDepositAccountForTenancy(user.userId(), tenancyId);
    }

    // Owner/manager deposit endpoints

    @GetMapping("/properties/{propertyId}/deposits")
    public PageResponse<DepositAccountResponse> listPropertyDeposits(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) DepositAccountStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return billingModule.listPropertyDepositAccounts(user.userId(), propertyId, query, status, page, size);
    }

    @GetMapping("/tenancies/{tenancyId}/deposit")
    public DepositAccountResponse getManagedDeposit(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return billingModule.getManagedDepositAccount(user.userId(), tenancyId);
    }

    @PostMapping("/tenancies/{tenancyId}/deposit/corrections/add")
    public DepositAccountResponse addDepositCorrection(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody CreateDepositCorrectionRequest request) {
        return billingModule.addDepositCorrection(user.userId(), tenancyId, request);
    }

    @PostMapping("/tenancies/{tenancyId}/deposit/corrections/deduct")
    public DepositAccountResponse deductDepositCorrection(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody CreateDepositCorrectionRequest request) {
        return billingModule.deductDepositCorrection(user.userId(), tenancyId, request);
    }

    @PostMapping("/tenancies/{tenancyId}/deposit/settle")
    public DepositAccountResponse settleDeposit(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody SettleDepositRequest request) {
        return billingModule.settleDeposit(user.userId(), tenancyId, request.reason());
    }
}
