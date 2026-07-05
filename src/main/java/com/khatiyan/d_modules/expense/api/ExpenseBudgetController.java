package com.khatiyan.d_modules.expense.api;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetOverviewResponse;
import com.khatiyan.d_modules.expense.api.dto.ExpenseBudgetTrendResponse;
import com.khatiyan.d_modules.expense.api.dto.RaiseBudgetRequest;
import com.khatiyan.d_modules.expense.api.dto.SetDefaultBudgetRequest;
import com.khatiyan.d_modules.expense.service.ExpenseBudgetService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/properties/{propertyId}/expense-budget")
public class ExpenseBudgetController {

    private final ExpenseBudgetService budgetService;

    public ExpenseBudgetController(ExpenseBudgetService budgetService) {
        this.budgetService = budgetService;
    }

    @GetMapping
    public ExpenseBudgetOverviewResponse overview(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate month) {
        return budgetService.getOverview(user.userId(), propertyId, month);
    }

    /** Trailing-window budget trend (spent / budget / signed savings per month). */
    @GetMapping("/trend")
    public ExpenseBudgetTrendResponse trend(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate month,
            @RequestParam(defaultValue = "6") int months) {
        return budgetService.getTrend(user.userId(), propertyId, month, months);
    }

    /** Set / edit the recurring default monthly budget. */
    @PutMapping
    public ExpenseBudgetOverviewResponse setDefault(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate month,
            @Valid @RequestBody SetDefaultBudgetRequest request) {
        return budgetService.setDefaultBudget(user.userId(), propertyId, month, request);
    }

    /** Raise the budget for a month (tracked separately from the default). */
    @PostMapping("/raises")
    public ExpenseBudgetOverviewResponse raise(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody RaiseBudgetRequest request) {
        return budgetService.raiseBudget(user.userId(), propertyId, request);
    }
}
