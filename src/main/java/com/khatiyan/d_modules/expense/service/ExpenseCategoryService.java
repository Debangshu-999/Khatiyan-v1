package com.khatiyan.d_modules.expense.service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.expense.api.dto.ExpenseCategoryResponse;
import com.khatiyan.d_modules.expense.api.dto.UpsertExpenseCategoryRequest;
import com.khatiyan.d_modules.expense.model.ExpenseCategory;
import com.khatiyan.d_modules.expense.model.ExpenseCategoryType;
import com.khatiyan.d_modules.expense.repository.ExpenseCategoryRepository;

/** Property-scoped expense categories (system seed + owner custom). */
@Service
public class ExpenseCategoryService {

    private final ExpenseCategoryRepository categoryRepository;
    private final FinanceAccessPolicy financeAccessPolicy;

    public ExpenseCategoryService(
            ExpenseCategoryRepository categoryRepository,
            FinanceAccessPolicy financeAccessPolicy) {
        this.categoryRepository = categoryRepository;
        this.financeAccessPolicy = financeAccessPolicy;
    }

    @Transactional
    public List<ExpenseCategoryResponse> listCategories(UUID actorUserId, UUID propertyId) {
        financeAccessPolicy.ensureCanManageFinances(actorUserId, propertyId);
        ensureSeeded(propertyId);
        return categoryRepository.findByPropertyIdAndActiveTrueOrderByNameAsc(propertyId).stream()
                .map(ExpenseCategoryResponse::from)
                .toList();
    }

    @Transactional
    public ExpenseCategoryResponse createCategory(UUID actorUserId, UUID propertyId, UpsertExpenseCategoryRequest request) {
        financeAccessPolicy.ensureCanManageFinances(actorUserId, propertyId);
        ensureSeeded(propertyId);
        if (categoryRepository.existsByPropertyIdAndNormalizedName(propertyId, normalize(request.name()))) {
            throw new ValidationException("A category with this name already exists");
        }
        return ExpenseCategoryResponse.from(categoryRepository.save(ExpenseCategory.custom(propertyId, request.name())));
    }

    @Transactional
    public ExpenseCategoryResponse renameCategory(
            UUID actorUserId, UUID propertyId, UUID categoryId, UpsertExpenseCategoryRequest request) {
        financeAccessPolicy.ensureCanManageFinances(actorUserId, propertyId);
        ExpenseCategory category = category(propertyId, categoryId);
        String normalized = normalize(request.name());
        if (!normalized.equals(category.getNormalizedName())
                && categoryRepository.existsByPropertyIdAndNormalizedName(propertyId, normalized)) {
            throw new ValidationException("A category with this name already exists");
        }
        category.rename(request.name());
        return ExpenseCategoryResponse.from(category);
    }

    @Transactional
    public void deactivateCategory(UUID actorUserId, UUID propertyId, UUID categoryId) {
        financeAccessPolicy.ensureCanManageFinances(actorUserId, propertyId);
        category(propertyId, categoryId).deactivate();
    }

    /** Seeds the system categories the first time a property uses expenses. */
    private void ensureSeeded(UUID propertyId) {
        if (categoryRepository.existsByPropertyId(propertyId)) {
            return;
        }
        for (ExpenseCategoryType type : ExpenseCategoryType.values()) {
            categoryRepository.save(ExpenseCategory.system(propertyId, type));
        }
    }

    private ExpenseCategory category(UUID propertyId, UUID categoryId) {
        return categoryRepository.findByIdAndPropertyId(categoryId, propertyId)
                .orElseThrow(() -> new NotFoundException("ExpenseCategory", categoryId));
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
