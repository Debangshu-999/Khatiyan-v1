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
import com.khatiyan.d_modules.expense.api.dto.ExpenseCategoryResponse;
import com.khatiyan.d_modules.expense.api.dto.UpsertExpenseCategoryRequest;
import com.khatiyan.d_modules.expense.service.ExpenseCategoryService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/properties/{propertyId}/expense-categories")
public class ExpenseCategoryController {

    private final ExpenseCategoryService categoryService;

    public ExpenseCategoryController(ExpenseCategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    public List<ExpenseCategoryResponse> list(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return categoryService.listCategories(user.userId(), propertyId);
    }

    @PostMapping
    public ExpenseCategoryResponse create(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UpsertExpenseCategoryRequest request) {
        return categoryService.createCategory(user.userId(), propertyId, request);
    }

    @PatchMapping("/{categoryId}")
    public ExpenseCategoryResponse rename(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID categoryId,
            @Valid @RequestBody UpsertExpenseCategoryRequest request) {
        return categoryService.renameCategory(user.userId(), propertyId, categoryId, request);
    }

    @DeleteMapping("/{categoryId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID categoryId) {
        categoryService.deactivateCategory(user.userId(), propertyId, categoryId);
    }
}
