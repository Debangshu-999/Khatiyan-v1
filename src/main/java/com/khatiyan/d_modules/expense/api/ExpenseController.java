package com.khatiyan.d_modules.expense.api;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.expense.api.dto.CreateExpenseRequest;
import com.khatiyan.d_modules.expense.api.dto.ExpenseMonthSummaryResponse;
import com.khatiyan.d_modules.expense.api.dto.ExpenseResponse;
import com.khatiyan.d_modules.expense.api.dto.ReverseExpenseRequest;
import com.khatiyan.d_modules.expense.service.ExpenseService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/properties/{propertyId}/expenses")
public class ExpenseController {

    private final ExpenseService expenseService;

    public ExpenseController(ExpenseService expenseService) {
        this.expenseService = expenseService;
    }

    @GetMapping
    public PageResponse<ExpenseResponse> list(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate month,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return expenseService.listExpenses(user.userId(), propertyId, month, page, size);
    }

    @GetMapping("/summary")
    public ExpenseMonthSummaryResponse summary(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate month) {
        return expenseService.monthlySummary(user.userId(), propertyId, month);
    }

    @PostMapping
    public ExpenseResponse create(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateExpenseRequest request) {
        return expenseService.createManual(user.userId(), propertyId, request);
    }

    @PostMapping("/{expenseId}/reverse")
    public ExpenseResponse reverse(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID expenseId,
            @Valid @RequestBody ReverseExpenseRequest request) {
        return expenseService.reverse(user.userId(), propertyId, expenseId, request);
    }
}
