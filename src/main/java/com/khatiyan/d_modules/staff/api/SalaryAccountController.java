package com.khatiyan.d_modules.staff.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.staff.api.dto.CreateSalaryAdjustmentRequest;
import com.khatiyan.d_modules.staff.api.dto.RecordSalaryPaymentRequest;
import com.khatiyan.d_modules.staff.api.dto.SalaryAccountDetailResponse;
import com.khatiyan.d_modules.staff.api.dto.SalaryAccountResponse;
import com.khatiyan.d_modules.staff.api.dto.UpdateSalaryAdjustmentRequest;
import com.khatiyan.d_modules.staff.service.SalaryAccountService;

import jakarta.validation.Valid;

/** Owner-only manual payroll routes for managers and non-user staff alike. */
@RestController
@Validated
@PreAuthorize("hasRole('OWNER')")
@RequestMapping("/api/v1/properties/{propertyId}/staff")
public class SalaryAccountController {

    private final SalaryAccountService salaryAccountService;

    public SalaryAccountController(SalaryAccountService salaryAccountService) {
        this.salaryAccountService = salaryAccountService;
    }

    @GetMapping("/salary-accounts")
    public List<SalaryAccountResponse> listAccounts(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return salaryAccountService.listActiveAccounts(user.userId(), propertyId);
    }

    @PostMapping("/members/{staffReferenceCode}/salary-account")
    public SalaryAccountDetailResponse openStaffAccount(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String staffReferenceCode) {
        return salaryAccountService.openStaffAccount(user.userId(), propertyId, staffReferenceCode);
    }

    @PostMapping("/managers/{managerReferenceCode}/salary-account")
    public SalaryAccountDetailResponse openManagerAccount(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String managerReferenceCode) {
        return salaryAccountService.openManagerAccount(user.userId(), propertyId, managerReferenceCode);
    }

    @GetMapping("/salary-accounts/{accountReferenceCode}")
    public SalaryAccountDetailResponse getAccount(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String accountReferenceCode) {
        return salaryAccountService.getAccount(user.userId(), propertyId, accountReferenceCode);
    }

    @PostMapping("/salary-accounts/{accountReferenceCode}/months")
    public SalaryAccountDetailResponse openSalaryMonth(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String accountReferenceCode) {
        return salaryAccountService.openSalaryMonth(user.userId(), propertyId, accountReferenceCode);
    }

    @PostMapping("/salary-accounts/{accountReferenceCode}/months/{payrollMonth}/adjustments")
    public SalaryAccountDetailResponse addAdjustment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String accountReferenceCode,
            @PathVariable LocalDate payrollMonth,
            @Valid @RequestBody CreateSalaryAdjustmentRequest request) {
        return salaryAccountService.addAdjustment(user.userId(), propertyId, accountReferenceCode, payrollMonth, request);
    }

    @PatchMapping("/salary-accounts/{accountReferenceCode}/months/{payrollMonth}/adjustments/{adjustmentId}")
    public SalaryAccountDetailResponse updateAdjustment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String accountReferenceCode,
            @PathVariable LocalDate payrollMonth,
            @PathVariable UUID adjustmentId,
            @Valid @RequestBody UpdateSalaryAdjustmentRequest request) {
        return salaryAccountService.updateAdjustment(
                user.userId(), propertyId, accountReferenceCode, payrollMonth, adjustmentId, request);
    }

    @DeleteMapping("/salary-accounts/{accountReferenceCode}/months/{payrollMonth}/adjustments/{adjustmentId}")
    public SalaryAccountDetailResponse removeAdjustment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String accountReferenceCode,
            @PathVariable LocalDate payrollMonth,
            @PathVariable UUID adjustmentId) {
        return salaryAccountService.removeAdjustment(
                user.userId(), propertyId, accountReferenceCode, payrollMonth, adjustmentId);
    }

    @PostMapping("/salary-accounts/{accountReferenceCode}/months/{payrollMonth}/payments")
    public SalaryAccountDetailResponse recordManualPayment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String accountReferenceCode,
            @PathVariable LocalDate payrollMonth,
            @Valid @RequestBody RecordSalaryPaymentRequest request) {
        return salaryAccountService.recordManualPayment(
                user.userId(), propertyId, accountReferenceCode, payrollMonth, request);
    }
}
