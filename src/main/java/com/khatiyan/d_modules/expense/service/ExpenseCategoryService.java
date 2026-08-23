package com.khatiyan.d_modules.expense.service;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
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
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        ensureSeeded(propertyId);
        return categoryRepository.findByPropertyIdAndActiveTrueOrderByNameAsc(propertyId).stream()
                .map(ExpenseCategoryResponse::from)
                .toList();
    }

    @Transactional
    public ExpenseCategoryResponse createCategory(UUID actorUserId, UUID propertyId, UpsertExpenseCategoryRequest request) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        ensureSeeded(propertyId);
        Optional<ExpenseCategory> existing =
                categoryRepository.findByPropertyIdAndNormalizedName(propertyId, normalize(request.name()));

        if (existing.isPresent()) {
            ExpenseCategory found = existing.get();
            if (found.isActive()) {
                throw new ValidationException("A category with this name already exists");
            }
            // Deleted, not gone. Revive rather than refuse — the name is taken by
            // a row nobody can see, and inserting would break the unique
            // constraint anyway.
            found.restore(request.name());
            return ExpenseCategoryResponse.from(found);
        }

        return ExpenseCategoryResponse.from(categoryRepository.save(ExpenseCategory.custom(propertyId, request.name())));
    }

    @Transactional
    public ExpenseCategoryResponse renameCategory(
            UUID actorUserId, UUID propertyId, UUID categoryId, UpsertExpenseCategoryRequest request) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        ExpenseCategory category = category(propertyId, categoryId);
        String normalized = normalize(request.name());
        // Renaming ONTO a deleted name still refuses: two rows would share it and
        // the unique constraint would reject the flush. Said plainly, so nobody
        // hunts for a category that is not on screen.
        if (!normalized.equals(category.getNormalizedName())) {
            Optional<ExpenseCategory> clash =
                    categoryRepository.findByPropertyIdAndNormalizedName(propertyId, normalized);
            if (clash.isPresent()) {
                throw new ValidationException(clash.get().isActive()
                        ? "A category with this name already exists"
                        : "A deleted category has this name. Create it again instead of renaming.");
            }
        }
        category.rename(request.name());
        return ExpenseCategoryResponse.from(category);
    }

    @Transactional
    public void deactivateCategory(UUID actorUserId, UUID propertyId, UUID categoryId) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        category(propertyId, categoryId).deactivate();
    }

    /**
     * Resolves a system category id for internal writers (event listeners), seeding
     * the property's categories first if it has never used expenses. No actor
     * check — callers are trusted module-internal flows, not user requests.
     */
    @Transactional
    public UUID systemCategoryId(UUID propertyId, ExpenseCategoryType type) {
        ensureSeeded(propertyId);
        return categoryRepository.findByPropertyIdAndSystemKey(propertyId, type.name())
                .orElseThrow(() -> new NotFoundException("ExpenseCategory", type.name()))
                .getId();
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
