package com.khatiyan.d_modules.expense.api;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.expense.api.dto.CreateRecurringExpenseRequest;
import com.khatiyan.d_modules.expense.api.dto.RecurringExpenseResponse;
import com.khatiyan.d_modules.expense.api.dto.UpdateRecurringExpenseRequest;
import com.khatiyan.d_modules.expense.service.RecurringExpenseService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/properties/{propertyId}/recurring-expenses")
public class RecurringExpenseController {

    private final RecurringExpenseService recurringExpenseService;

    public RecurringExpenseController(RecurringExpenseService recurringExpenseService) {
        this.recurringExpenseService = recurringExpenseService;
    }

    @GetMapping
    public List<RecurringExpenseResponse> list(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return recurringExpenseService.list(user.userId(), propertyId);
    }

    @PostMapping
    public RecurringExpenseResponse create(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateRecurringExpenseRequest request) {
        return recurringExpenseService.create(user.userId(), propertyId, request);
    }

    @PatchMapping("/{recurringExpenseId}")
    public RecurringExpenseResponse update(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID recurringExpenseId,
            @Valid @RequestBody UpdateRecurringExpenseRequest request) {
        return recurringExpenseService.update(user.userId(), propertyId, recurringExpenseId, request);
    }

    @DeleteMapping("/{recurringExpenseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID recurringExpenseId) {
        recurringExpenseService.deactivate(user.userId(), propertyId, recurringExpenseId);
    }
}
