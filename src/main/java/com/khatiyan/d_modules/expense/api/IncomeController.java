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
import com.khatiyan.d_modules.expense.api.dto.CreateIncomeRequest;
import com.khatiyan.d_modules.expense.api.dto.IncomeResponse;
import com.khatiyan.d_modules.expense.api.dto.ReverseIncomeRequest;
import com.khatiyan.d_modules.expense.service.IncomeService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/properties/{propertyId}/incomes")
public class IncomeController {

    private final IncomeService incomeService;

    public IncomeController(IncomeService incomeService) {
        this.incomeService = incomeService;
    }

    @GetMapping
    public PageResponse<IncomeResponse> list(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate month,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return incomeService.listIncome(user.userId(), propertyId, month, page, size);
    }

    @PostMapping
    public IncomeResponse create(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateIncomeRequest request) {
        return incomeService.createManual(user.userId(), propertyId, request);
    }

    @PostMapping("/{incomeId}/reverse")
    public IncomeResponse reverse(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID incomeId,
            @Valid @RequestBody ReverseIncomeRequest request) {
        return incomeService.reverse(user.userId(), propertyId, incomeId, request);
    }
}
